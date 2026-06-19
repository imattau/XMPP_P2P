# Swappable Transport & Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a swappable `XmppStorage` interface (sqlite + IndexedDB implementations) and a swappable libp2p transport factory (Node tcp/mdns + browser websockets/webrtc), both DHT-based for discovery, as new additive modules in `src/core` — laying the foundation for a future browser-only build without touching `XmppNode`'s existing internals yet.

**Architecture:** Two new independent modules under `src/core/storage/` (interface + two implementations sharing one contract test) and a split of `src/core/p2p.ts` into a shared base libp2p config plus a Node factory and a new browser factory. Nothing in `xmpp-node.ts`, `xmpp-persistence.ts`, `xmpp-uploads.ts`, `xmpp-openpgp.ts`, or `xmpp-omemo-state.ts` is modified by this plan — wiring those existing files to consume `XmppStorage` is a separate follow-up plan, since it's a large, independently-reviewable mechanical migration across a 2654-line file (`xmpp-node.ts`) and is riskier to bundle with this foundational, purely-additive work.

**Tech Stack:** TypeScript (Node >=22), `node:sqlite` (`DatabaseSync`), `fake-indexeddb` (new dev dependency, for testing `IndexedDbStorage` under Node), `libp2p` + `@libp2p/webrtc` + `@libp2p/circuit-relay-transport` (new dependencies).

## Global Constraints

- No backwards compatibility or migration path required for existing on-disk data (per spec decision).
- `XmppStorage` is one unified interface covering both records and blobs (per spec decision) — no split interfaces.
- Both Node and browser libp2p builds use KadDHT for discovery; mdns is Node-only (no browser equivalent).
- New dependencies (`@libp2p/webrtc`, `@libp2p/circuit-relay-transport`, `fake-indexeddb`) only — no removal of existing dependencies.
- Tests follow the existing convention: plain script in `src/tests/<name>.ts`, using `node:assert/strict`, run via `node dist/tests/<name>.js`, exposed as an npm script `test-<name>`, and added to the `test` script chain in `package.json`.

---

### Task 1: XmppStorage interface and shared contract test helper

**Files:**
- Create: `src/core/storage/types.ts`
- Create: `src/tests/storage-contract.ts`

**Interfaces:**
- Produces: `XmppStorage` interface and `StorageRecord` type, used by Tasks 2–4.
- Produces: `runXmppStorageContract(storage: XmppStorage): Promise<void>` — runs a sequence of `assert` checks against any conforming implementation; throws on failure. Used by Tasks 2 and 3 as their test bodies.

- [ ] **Step 1: Write `src/core/storage/types.ts`**

```ts
/**
 * @fileoverview Storage interface that XmppNode and its managers will use for all
 * persisted state (records) and binary data (blobs), so that Node and browser
 * builds can supply different backing implementations without protocol code
 * needing to know which one is in use.
 */

export interface StorageRecord {
  key: string
  value: string
  updatedAt: string
}

export interface XmppStorage {
  getRecord(namespace: string, key: string): Promise<string | undefined>
  putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void>
  deleteRecord(namespace: string, key: string): Promise<void>
  listRecords(namespace: string): Promise<StorageRecord[]>

  getBlob(namespace: string, key: string): Promise<Uint8Array | undefined>
  putBlob(namespace: string, key: string, data: Uint8Array): Promise<void>
  deleteBlob(namespace: string, key: string): Promise<void>

  close(): Promise<void>
}
```

- [ ] **Step 2: Write `src/tests/storage-contract.ts`**

```ts
import assert from 'node:assert/strict'
import type { XmppStorage } from '../core/storage/types.js'

export async function runXmppStorageContract(storage: XmppStorage): Promise<void> {
  // records: missing key returns undefined
  assert.equal(await storage.getRecord('roster', 'alice@example.com'), undefined)

  // records: put then get round-trips
  await storage.putRecord('roster', 'alice@example.com', JSON.stringify({ jid: 'alice@example.com' }), '2026-01-01T00:00:00.000Z')
  const raw = await storage.getRecord('roster', 'alice@example.com')
  assert.equal(raw, JSON.stringify({ jid: 'alice@example.com' }))

  // records: put again with same key overwrites, doesn't duplicate
  await storage.putRecord('roster', 'alice@example.com', JSON.stringify({ jid: 'alice@example.com', name: 'Alice' }), '2026-01-02T00:00:00.000Z')
  let rows = await storage.listRecords('roster')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].value, JSON.stringify({ jid: 'alice@example.com', name: 'Alice' }))
  assert.equal(rows[0].updatedAt, '2026-01-02T00:00:00.000Z')

  // records: namespaces are isolated
  await storage.putRecord('feed_history', 'topic:post-1', JSON.stringify({ id: 'post-1' }), '2026-01-01T00:00:00.000Z')
  rows = await storage.listRecords('roster')
  assert.equal(rows.length, 1)
  rows = await storage.listRecords('feed_history')
  assert.equal(rows.length, 1)

  // records: delete removes the key
  await storage.deleteRecord('roster', 'alice@example.com')
  assert.equal(await storage.getRecord('roster', 'alice@example.com'), undefined)
  rows = await storage.listRecords('roster')
  assert.equal(rows.length, 0)

  // blobs: missing key returns undefined
  assert.equal(await storage.getBlob('uploads', 'cid-1'), undefined)

  // blobs: put then get round-trips bytes exactly
  const payload = new Uint8Array([1, 2, 3, 4, 5])
  await storage.putBlob('uploads', 'cid-1', payload)
  const loaded = await storage.getBlob('uploads', 'cid-1')
  assert.ok(loaded)
  assert.deepEqual(Array.from(loaded as Uint8Array), [1, 2, 3, 4, 5])

  // blobs: delete removes the key
  await storage.deleteBlob('uploads', 'cid-1')
  assert.equal(await storage.getBlob('uploads', 'cid-1'), undefined)

  console.log('XmppStorage contract passed')
}
```

- [ ] **Step 3: Compile to verify no type errors**

Run: `npm run build`
Expected: compiles with no errors (these two files have no implementation to test yet, just type-check).

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/types.ts src/tests/storage-contract.ts
git commit -m "Add XmppStorage interface and shared storage contract test"
```

---

### Task 2: NodeSqliteStorage implementation

**Files:**
- Create: `src/core/storage/node-sqlite-storage.ts`
- Create: `src/tests/storage-node-sqlite.ts`
- Modify: `package.json` (add `test-storage-node-sqlite` script, add it to the `test` chain)

**Interfaces:**
- Consumes: `XmppStorage` from `src/core/storage/types.ts` (Task 1), `runXmppStorageContract` from `src/tests/storage-contract.ts` (Task 1).
- Produces: `NodeSqliteStorage` class with constructor `(dbPath: string)`, implementing `XmppStorage`. Used by Task 5 (Node entry point wiring) in a future plan.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/storage-node-sqlite.ts
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { runXmppStorageContract } from './storage-contract.js'

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'xmpp-storage-sqlite-'))
  const dbPath = join(dir, 'state.sqlite')
  const storage = new NodeSqliteStorage(dbPath)

  await runXmppStorageContract(storage)

  // sqlite-specific: state survives reopening the same file
  await storage.putRecord('roster', 'bob@example.com', JSON.stringify({ jid: 'bob@example.com' }), '2026-01-01T00:00:00.000Z')
  await storage.close()

  const reopened = new NodeSqliteStorage(dbPath)
  const raw = await reopened.getRecord('roster', 'bob@example.com')
  assert.equal(raw, JSON.stringify({ jid: 'bob@example.com' }))
  await reopened.close()

  await rm(dir, { recursive: true, force: true })
  console.log('NodeSqliteStorage test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run it to verify it fails (module doesn't exist yet)**

Run: `npx tsc --noEmit`
Expected: FAIL with `Cannot find module '../core/storage/node-sqlite-storage.js'`

- [ ] **Step 3: Write `src/core/storage/node-sqlite-storage.ts`**

```ts
/**
 * @fileoverview sqlite-backed XmppStorage implementation for the Node build.
 * Reuses the namespace/key/updated_at/payload schema already proven by
 * XmppSqliteStore, extended with a blobs table for binary data (uploads).
 */

import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { XmppStorage, StorageRecord } from './types.js'

export class NodeSqliteStorage implements XmppStorage {
  private db?: DatabaseSync

  constructor(private readonly dbPath: string) {}

  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    const db = this.open()
    const row = db
      .prepare('SELECT payload FROM state_records WHERE namespace = ? AND record_key = ?')
      .get(namespace, key) as { payload: string } | undefined
    return row?.payload
  }

  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    const db = this.open()
    db.prepare(
      `INSERT INTO state_records (namespace, record_key, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, record_key) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`
    ).run(namespace, key, updatedAt, value)
  }

  async deleteRecord(namespace: string, key: string): Promise<void> {
    const db = this.open()
    db.prepare('DELETE FROM state_records WHERE namespace = ? AND record_key = ?').run(namespace, key)
  }

  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const db = this.open()
    const rows = db
      .prepare(
        'SELECT record_key AS key, updated_at AS updatedAt, payload AS value FROM state_records WHERE namespace = ? ORDER BY updated_at ASC, record_key ASC'
      )
      .all(namespace) as StorageRecord[]
    return rows
  }

  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    const db = this.open()
    const row = db
      .prepare('SELECT data FROM state_blobs WHERE namespace = ? AND blob_key = ?')
      .get(namespace, key) as { data: Uint8Array } | undefined
    return row?.data ? new Uint8Array(row.data) : undefined
  }

  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    const db = this.open()
    db.prepare(
      `INSERT INTO state_blobs (namespace, blob_key, data) VALUES (?, ?, ?)
       ON CONFLICT(namespace, blob_key) DO UPDATE SET data = excluded.data`
    ).run(namespace, key, data)
  }

  async deleteBlob(namespace: string, key: string): Promise<void> {
    const db = this.open()
    db.prepare('DELETE FROM state_blobs WHERE namespace = ? AND blob_key = ?').run(namespace, key)
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = undefined
  }

  private open(): DatabaseSync {
    if (!this.db) {
      mkdirSync(dirname(this.dbPath), { recursive: true })
      this.db = new DatabaseSync(this.dbPath)
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS state_records (
          namespace TEXT NOT NULL,
          record_key TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload TEXT NOT NULL,
          PRIMARY KEY (namespace, record_key)
        );
        CREATE INDEX IF NOT EXISTS idx_state_records_namespace_updated_at
          ON state_records(namespace, updated_at DESC);
        CREATE TABLE IF NOT EXISTS state_blobs (
          namespace TEXT NOT NULL,
          blob_key TEXT NOT NULL,
          data BLOB NOT NULL,
          PRIMARY KEY (namespace, blob_key)
        );
      `)
    }

    return this.db
  }
}
```

Note: `existsSync` is imported but unused after this change (the old `XmppSqliteStore.loadSnapshot` used it to skip loading from a missing file; `NodeSqliteStorage` always creates the file via `mkdirSync`/`new DatabaseSync`). Remove the unused `existsSync` import — only `mkdirSync` is needed.

```ts
import { mkdirSync } from 'fs'
```

- [ ] **Step 4: Build and run the test**

Run: `npm run build && node dist/tests/storage-node-sqlite.js`
Expected: prints `XmppStorage contract passed` then `NodeSqliteStorage test passed`, exit code 0.

- [ ] **Step 5: Add the npm script**

Edit `package.json`, add after the `"test-sqlite"` line:

```json
    "test-storage-node-sqlite": "node dist/tests/storage-node-sqlite.js",
```

And add `&& npm run test-storage-node-sqlite` immediately after `&& npm run test-sqlite` in the `"test"` script.

- [ ] **Step 6: Run the full test script to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests plus the new one pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/storage/node-sqlite-storage.ts src/tests/storage-node-sqlite.ts package.json
git commit -m "Add NodeSqliteStorage implementation of XmppStorage"
```

---

### Task 3: IndexedDbStorage implementation

**Files:**
- Create: `src/core/storage/indexeddb-storage.ts`
- Create: `src/tests/storage-indexeddb.ts`
- Modify: `package.json` (add `fake-indexeddb` devDependency, add `test-storage-indexeddb` script, add it to the `test` chain)

**Interfaces:**
- Consumes: `XmppStorage` from `src/core/storage/types.ts` (Task 1), `runXmppStorageContract` from `src/tests/storage-contract.ts` (Task 1).
- Produces: `IndexedDbStorage` class with constructor `(dbName: string)`, implementing `XmppStorage`. Used by the future browser entry point (not part of this plan).

- [ ] **Step 1: Install the test-only dependency**

Run: `npm install --save-dev fake-indexeddb`
Expected: adds `fake-indexeddb` to `devDependencies` in `package.json` and `package-lock.json`.

- [ ] **Step 2: Write the failing test**

```ts
// src/tests/storage-indexeddb.ts
import 'fake-indexeddb/auto'
import { IndexedDbStorage } from '../core/storage/indexeddb-storage.js'
import { runXmppStorageContract } from './storage-contract.js'

async function main() {
  const storage = new IndexedDbStorage('xmpp-storage-test')
  await runXmppStorageContract(storage)
  await storage.close()
  console.log('IndexedDbStorage test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 3: Run it to verify it fails (module doesn't exist yet)**

Run: `npx tsc --noEmit`
Expected: FAIL with `Cannot find module '../core/storage/indexeddb-storage.js'`

- [ ] **Step 4: Write `src/core/storage/indexeddb-storage.ts`**

```ts
/**
 * @fileoverview IndexedDB-backed XmppStorage implementation for the browser build.
 * One database with two object stores: "records" (keyed by [namespace, key]) and
 * "blobs" (keyed by [namespace, key]). Designed to also run under Node tests via
 * the fake-indexeddb polyfill.
 */

import type { XmppStorage, StorageRecord } from './types.js'

const RECORDS_STORE = 'records'
const BLOBS_STORE = 'blobs'

interface RecordRow {
  namespace: string
  key: string
  value: string
  updatedAt: string
}

interface BlobRow {
  namespace: string
  key: string
  data: Uint8Array
}

export class IndexedDbStorage implements XmppStorage {
  private dbPromise?: Promise<IDBDatabase>

  constructor(private readonly dbName: string) {}

  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    const db = await this.open()
    const row = await this.get<RecordRow>(db, RECORDS_STORE, [namespace, key])
    return row?.value
  }

  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    const db = await this.open()
    await this.put<RecordRow>(db, RECORDS_STORE, { namespace, key, value, updatedAt })
  }

  async deleteRecord(namespace: string, key: string): Promise<void> {
    const db = await this.open()
    await this.delete(db, RECORDS_STORE, [namespace, key])
  }

  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const db = await this.open()
    const rows = await this.getAllByNamespace<RecordRow>(db, RECORDS_STORE, namespace)
    return rows
      .map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt }))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.key.localeCompare(b.key))
  }

  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    const db = await this.open()
    const row = await this.get<BlobRow>(db, BLOBS_STORE, [namespace, key])
    return row?.data
  }

  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    const db = await this.open()
    await this.put<BlobRow>(db, BLOBS_STORE, { namespace, key, data })
  }

  async deleteBlob(namespace: string, key: string): Promise<void> {
    const db = await this.open()
    await this.delete(db, BLOBS_STORE, [namespace, key])
  }

  async close(): Promise<void> {
    if (!this.dbPromise) {
      return
    }
    const db = await this.dbPromise
    db.close()
    this.dbPromise = undefined
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(RECORDS_STORE)) {
            db.createObjectStore(RECORDS_STORE, { keyPath: ['namespace', 'key'] })
          }
          if (!db.objectStoreNames.contains(BLOBS_STORE)) {
            db.createObjectStore(BLOBS_STORE, { keyPath: ['namespace', 'key'] })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }

    return this.dbPromise
  }

  private get<T>(db: IDBDatabase, storeName: string, key: [string, string]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  }

  private put<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private delete(db: IDBDatabase, storeName: string, key: [string, string]): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private getAllByNamespace<T extends { namespace: string }>(db: IDBDatabase, storeName: string, namespace: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const results: T[] = []
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(results)
          return
        }
        const value = cursor.value as T
        if (value.namespace === namespace) {
          results.push(value)
        }
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  }
}
```

- [ ] **Step 5: Build and run the test**

Run: `npm run build && node dist/tests/storage-indexeddb.js`
Expected: prints `XmppStorage contract passed` then `IndexedDbStorage test passed`, exit code 0.

- [ ] **Step 6: Add the npm script**

Edit `package.json`, add after `"test-storage-node-sqlite"`:

```json
    "test-storage-indexeddb": "node dist/tests/storage-indexeddb.js",
```

And add `&& npm run test-storage-indexeddb` immediately after `&& npm run test-storage-node-sqlite` in the `"test"` script.

- [ ] **Step 7: Run the full test script to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests plus both new storage tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/storage/indexeddb-storage.ts src/tests/storage-indexeddb.ts package.json package-lock.json
git commit -m "Add IndexedDbStorage implementation of XmppStorage"
```

---

### Task 4: Split p2p.ts into Node and browser factories

**Files:**
- Modify: `src/core/p2p.ts`
- Create: `src/core/p2p-browser.ts`
- Test: `src/tests/p2p-browser.ts`
- Modify: `package.json` (add `@libp2p/webrtc` and `@libp2p/circuit-relay-transport` dependencies, add `test-p2p-browser` script, add it to the `test` chain)
- Modify: `src/index.ts` (no behavior change, just confirm the import still matches — see Step 6)

**Interfaces:**
- Produces: `createBaseLibp2pConfig(options)` (internal, exported only for the browser factory to import) in `p2p.ts`.
- Produces: `createP2PNode(port?, options?)` in `p2p.ts` — same name/signature as today, behavior unchanged (this plan does not rename the Node factory, to avoid touching `src/index.ts`'s call site unnecessarily).
- Produces: `createBrowserP2PNode(options: CreateBrowserP2PNodeOptions): Promise<Libp2p>` in `p2p-browser.ts`, where `CreateBrowserP2PNodeOptions = { bootstrapAddrs: string[] }`.

- [ ] **Step 1: Install new dependencies**

Run: `npm install @libp2p/webrtc @libp2p/circuit-relay-transport`
Expected: both added to `dependencies` in `package.json` and `package-lock.json`.

- [ ] **Step 2: Extract the shared base config in `src/core/p2p.ts`**

Replace the body of `createP2PNode` (lines 53–136 in the current file) with a shared helper plus the existing Node-specific call, keeping the function's exported name and signature identical:

```ts
export interface CreateP2PNodeOptions {
  enableMdns?: boolean
  enableDht?: boolean
  host?: string
}

interface BaseLibp2pConfigOptions {
  enableDht?: boolean
}

export function createBaseLibp2pServices(options: BaseLibp2pConfigOptions = {}): Record<string, any> {
  const services: Record<string, any> = {
    identify: identify(),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      globalSignaturePolicy: StrictSign,
      scoreParams: {},
      scoreThresholds: {},
      emitSelf: false,
      maxInboundDataLength: 16 * 1024,
      messageProcessingConcurrency: 4
    })
  }

  if (options.enableDht) {
    services.dht = kadDHT({
      clientMode: false,
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper,
      allowQueryWithZeroPeers: true,
      validators: {
        xmpp: async (key: Uint8Array, value: Uint8Array) => {
          // Accept all xmpp custom records
        }
      },
      selectors: {
        xmpp: (key: Uint8Array, records: any[]) => {
          return 0
        }
      }
    })
    services.ping = ping()
  }

  return services
}

export async function createP2PNode(port?: number, options: CreateP2PNodeOptions = {}): Promise<any> {
  const listenHost = options.host || '0.0.0.0'
  const peerDiscovery = []

  if (options.enableMdns !== false) {
    peerDiscovery.push(
      mdns({
        interval: 2000
      })
    )
  }

  const services = createBaseLibp2pServices({ enableDht: options.enableDht })

  const listenAddresses: string[] = []
  if (listenHost === '0.0.0.0') {
    listenAddresses.push(port ? `/ip4/0.0.0.0/tcp/${port}` : `/ip4/0.0.0.0/tcp/0`)
    listenAddresses.push(port ? `/ip6/::/tcp/${port}` : `/ip6/::/tcp/0`)
    listenAddresses.push(port ? `/ip4/0.0.0.0/tcp/${port + 1000}/ws` : `/ip4/0.0.0.0/tcp/0/ws`)
    listenAddresses.push(port ? `/ip6/::/tcp/${port + 1000}/ws` : `/ip6/::/tcp/0/ws`)
  } else if (listenHost === '127.0.0.1') {
    listenAddresses.push(port ? `/ip4/127.0.0.1/tcp/${port}` : `/ip4/127.0.0.1/tcp/0`)
    listenAddresses.push(port ? `/ip6/::1/tcp/${port}` : `/ip6/::1/tcp/0`)
    listenAddresses.push(port ? `/ip4/127.0.0.1/tcp/${port + 1000}/ws` : `/ip4/127.0.0.1/tcp/0/ws`)
    listenAddresses.push(port ? `/ip6/::1/tcp/${port + 1000}/ws` : `/ip6/::1/tcp/0/ws`)
  } else {
    if (listenHost.includes(':')) {
      listenAddresses.push(port ? `/ip6/${listenHost}/tcp/${port}` : `/ip6/${listenHost}/tcp/0`)
      listenAddresses.push(port ? `/ip6/${listenHost}/tcp/${port + 1000}/ws` : `/ip6/${listenHost}/tcp/0/ws`)
    } else {
      listenAddresses.push(port ? `/ip4/${listenHost}/tcp/${port}` : `/ip4/${listenHost}/tcp/0`)
      listenAddresses.push(port ? `/ip4/${listenHost}/tcp/${port + 1000}/ws` : `/ip4/${listenHost}/tcp/0/ws`)
    }
  }

  const node = await createLibp2p({
    addresses: {
      listen: listenAddresses
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services
  })

  return node
}
```

Leave the file's imports, the `CreateP2PNodeOptions` interface, and the multiaddr `toOptions` polyfill block (lines 1–43) exactly as they are — only the body of `createP2PNode` changes (DHT/services extraction), and two new exports (`createBaseLibp2pServices`) are added.

- [ ] **Step 3: Write the browser factory test**

```ts
// src/tests/p2p-browser.ts
import assert from 'node:assert/strict'
import { createP2PNode } from '../core/p2p.js'
import { createBrowserP2PNode } from '../core/p2p-browser.js'

async function main() {
  const nodePeer = await createP2PNode(0, { enableMdns: false, enableDht: true, host: '127.0.0.1' })
  await nodePeer.start()

  const wsAddr = nodePeer.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
  assert.ok(wsAddr, 'Node peer must expose a /ws multiaddr for browser-style transports to dial')

  const browserPeer = await createBrowserP2PNode({ bootstrapAddrs: [wsAddr.toString()] })
  await browserPeer.start()

  await browserPeer.dial(wsAddr)
  const connections = browserPeer.getConnections(nodePeer.peerId)
  assert.ok(connections.length > 0, 'browser peer must successfully connect to the node peer over websockets')

  await browserPeer.stop()
  await nodePeer.stop()
  console.log('Browser/Node p2p interop test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 4: Run it to verify it fails (module doesn't exist yet)**

Run: `npx tsc --noEmit`
Expected: FAIL with `Cannot find module '../core/p2p-browser.js'`

- [ ] **Step 5: Write `src/core/p2p-browser.ts`**

```ts
/**
 * @fileoverview Browser-targeted libp2p node factory. Uses websockets and WebRTC
 * for transport (no tcp, no mdns — neither is available in a browser sandbox) and
 * relies on KadDHT, bootstrapped from at least one known Node peer's /ws multiaddr,
 * for peer discovery.
 */

import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-transport'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { createBaseLibp2pServices } from './p2p.js'

export interface CreateBrowserP2PNodeOptions {
  bootstrapAddrs: string[]
}

export async function createBrowserP2PNode(options: CreateBrowserP2PNodeOptions): Promise<Libp2p> {
  const services = createBaseLibp2pServices({ enableDht: true })

  const node = await createLibp2p({
    transports: [
      webSockets(),
      webRTC(),
      circuitRelayTransport()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      bootstrap({
        list: options.bootstrapAddrs
      })
    ],
    services
  })

  return node
}
```

- [ ] **Step 6: Install the bootstrap peer-discovery module if missing**

Run: `npm ls @libp2p/bootstrap || npm install @libp2p/bootstrap`
Expected: confirms `@libp2p/bootstrap` is available (it's a common libp2p package; install it if `npm ls` reports it missing).

- [ ] **Step 7: Build and run the test**

Run: `npm run build && node dist/tests/p2p-browser.js`
Expected: prints `Browser/Node p2p interop test passed`, exit code 0.

If the `webRTC()` transport throws at `createLibp2p` time in the Node test environment (WebRTC's Node support can be limited outside a real browser), the test as written only exercises the `webSockets()` path for the dial — that's sufficient to prove Node/browser-factory interop for this plan. Note in a code comment above the test's `dial` call that WebRTC-specific (browser-to-browser) dialing is exercised by a future browser-environment (e.g. Playwright) test, not this Node-side script.

- [ ] **Step 8: Add the npm script**

Edit `package.json`, add after `"test-storage-indexeddb"`:

```json
    "test-p2p-browser": "node dist/tests/p2p-browser.js",
```

And add `&& npm run test-p2p-browser` at the end of the `"test"` script chain.

- [ ] **Step 9: Run the full test script to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests plus all three new tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/core/p2p.ts src/core/p2p-browser.ts src/tests/p2p-browser.ts package.json package-lock.json
git commit -m "Split p2p node creation into Node and browser libp2p factories"
```

---

## Out of scope for this plan (follow-up work)

- Wiring `XmppNode`, `xmpp-persistence.ts`, `xmpp-uploads.ts`, `xmpp-openpgp.ts`, and `xmpp-omemo-state.ts` to consume `XmppStorage` instead of direct `fs`/`XmppSqliteStore` calls, and dropping the `*Path` constructor options. This is a large, mechanical, higher-risk migration across existing behavior and deserves its own plan and review cycle.
- A real browser-environment (Playwright) interop test exercising actual WebRTC browser-to-browser dialing — the Node-side `p2p-browser.ts` test in Task 4 only proves the websockets path, which is sufficient to validate the factory split but not full WebRTC behavior.
- `omemo-runtime.ts`'s `fs` usage is Node-specific WASM/CJS module-loading machinery (not state persistence) and is out of scope for the `XmppStorage` migration entirely; a browser build will need its own (separate) way to load `libomemo.js`.
- The browser entry point itself (constructing `IndexedDbStorage` + `createBrowserP2PNode()` and passing them into `XmppNode`) depends on the follow-up `XmppNode` wiring above, so it isn't part of this plan either.
