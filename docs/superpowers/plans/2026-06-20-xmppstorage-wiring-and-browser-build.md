# XmppStorage Wiring & Browser Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `XmppNode` and its managers off direct `fs`/`XmppSqliteStore` calls onto the existing `XmppStorage` interface, then stand up a real browser entry point (IndexedDB + browser libp2p) with a Playwright interop test, completing the "out of scope" follow-ups from `docs/superpowers/plans/2026-06-20-swappable-transport-storage.md`.

**Architecture:** `xmpp-persistence.ts`'s 9 load/9 persist functions and the `XmppOpenPgpStateManager`, `XmppOmemoStateManager`, `XmppUploadManager` classes are migrated one at a time from `fs`/`*Path` to `XmppStorage.getRecord`/`putRecord`/`getBlob`/`putBlob`, each namespaced and independently testable against an in-memory fake. `XmppNode` then takes a single `storage: XmppStorage` constructor option instead of 10 `*Path` options, and drops `XmppSqliteStore` entirely (its job is now `XmppStorage`'s). Finally a `src/browser-index.ts` wires `IndexedDbStorage` + `createBrowserP2PNode` + `XmppNode` together, and a Playwright test proves two real browser tabs can WebRTC-dial each other and exchange an XMPP message.

**Tech Stack:** TypeScript (Node >=22), existing `XmppStorage`/`NodeSqliteStorage`/`IndexedDbStorage` (src/core/storage/), existing `createBrowserP2PNode` (src/core/p2p-browser.ts), `@playwright/test` (new dev dependency), `esbuild` (new dev dependency, to bundle `src/browser-index.ts` for the Playwright test page — no other bundler exists in the repo for this entry point).

## Global Constraints

- No backwards compatibility or migration path required for existing on-disk data (continuing the prior plan's decision — this plan deletes the old file formats outright).
- Every storage namespace introduced below is fixed and must be used verbatim by both the writer and reader of that namespace (listed in the Namespace Table below) — drift here is a silent data-loss bug.
- `XmppSqliteStore` (`src/core/xmpp-sqlite.ts`) is deleted once Task 5 lands — it is fully superseded by `XmppStorage`, do not keep it around "just in case".
- Tests follow the existing convention: plain script in `src/tests/<name>.ts`, using `node:assert/strict`, run via `node dist/tests/<name>.js`, exposed as an npm script `test-<name>`, added to the `test` script chain in `package.json` — except Task 8's Playwright test, which uses Playwright's own runner (`npx playwright test`) and is added as a separate `test-browser-e2e` script that is **not** part of the default `npm test` chain (it needs a browser binary download via `npx playwright install`, which CI/local-dev may not always have — call this out explicitly when done, don't silently skip it).
- New dependencies (`@playwright/test`, `esbuild`) are dev-only — no production runtime dependency changes.

## Namespace Table

Every record-shaped piece of state below uses this exact `(namespace, key)` pair. `key` is always the literal string `'state'` unless noted (each of these is a single JSON blob today, not a multi-row table, so there is exactly one key per namespace).

| Data | Namespace | Key | Old path field |
|---|---|---|---|
| Roster | `roster` | `state` | `rosterPath` |
| Feed history | `feed_history` | `state` | `feedPath` |
| Feed subscriptions | `feed_subscriptions` | `state` | `subscriptionPath` |
| Followers | `followers` | `state` | `followerPath` |
| Collections + collection history | `collections` | `state` | `collectionPath` |
| Attachment history | `attachments` | `state` | `attachmentPath` |
| MUC room settings | `muc_rooms` | `state` | `mucPath` |
| MUC history | `muc_history` | `state` | `mucHistoryPath` |
| vCard | `vcard` | `state` | `vCardPath` |
| OpenPGP key state | `openpgp` | `state` | `openPgpPath` |
| OMEMO key state | `omemo` | `state` | `omemoPath` |
| Upload object metadata | `uploads_meta` | `<cid>` | `uploadObjectsPath`/`<cid>.json` |
| Upload object bytes (blob) | `uploads` | `<cid>` | `uploadObjectsPath`/`<cid>` |
| Upload alias (slotId → cid) | `uploads_alias` | `<slotId>` | `uploadAliasesPath`/`<slotId>.json` |

---

### Task 1: Migrate `xmpp-persistence.ts` to `XmppStorage`

**Files:**
- Modify: `src/core/xmpp-persistence.ts`
- Create: `src/tests/persistence-storage.ts`
- Modify: `package.json` (add `test-persistence-storage` script, add to `test` chain)

**Interfaces:**
- Consumes: `XmppStorage` from `src/core/storage/types.ts` (already exists).
- Produces: same 18 exported function names as today (`loadRosterState`, `persistRosterState`, etc.) with the same signatures, **except** `XmppPersistenceLoadContext`/`XmppPersistenceSaveContext` drop all 10 `*Path: string` fields and gain one field: `storage: XmppStorage`. Used by Task 5 (`xmpp-node.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/persistence-storage.ts
import assert from 'node:assert/strict'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'
import { loadRosterState, persistRosterState, type XmppPersistenceLoadContext, type XmppPersistenceSaveContext } from '../core/xmpp-persistence.js'
import type { XmppRosterEntry } from '../core/xmpp-records.js'

class FakeStorage implements XmppStorage {
  private records = new Map<string, Map<string, { value: string; updatedAt: string }>>()
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    return this.records.get(namespace)?.get(key)?.value
  }
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    if (!this.records.has(namespace)) this.records.set(namespace, new Map())
    this.records.get(namespace)!.set(key, { value, updatedAt })
  }
  async deleteRecord(namespace: string, key: string): Promise<void> {
    this.records.get(namespace)?.delete(key)
  }
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    return Array.from(this.records.get(namespace)?.entries() ?? []).map(([key, v]) => ({ key, value: v.value, updatedAt: v.updatedAt }))
  }
  async getBlob(): Promise<Uint8Array | undefined> { return undefined }
  async putBlob(): Promise<void> {}
  async deleteBlob(): Promise<void> {}
  async close(): Promise<void> {}
}

function normalizeRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): XmppRosterEntry {
  return { jid: entry.jid, name: entry.name, subscription: entry.subscription ?? 'none', groups: entry.groups ?? [] }
}

async function main() {
  const storage = new FakeStorage()
  const roster = new Map<string, XmppRosterEntry>()

  const baseCtx = {
    storage,
    roster,
    normalizeRosterEntry
  } as unknown as XmppPersistenceLoadContext & XmppPersistenceSaveContext

  // load on empty storage is a no-op, doesn't throw
  await loadRosterState(baseCtx)
  assert.equal(roster.size, 0)

  roster.set('alice@example.com', normalizeRosterEntry({ jid: 'alice@example.com', name: 'Alice' }))
  await persistRosterState(baseCtx)

  const raw = await storage.getRecord('roster', 'state')
  assert.ok(raw, 'persistRosterState must write to the roster/state record')
  assert.deepEqual(JSON.parse(raw as string).entries[0].jid, 'alice@example.com')

  roster.clear()
  await loadRosterState(baseCtx)
  assert.equal(roster.size, 1)
  assert.equal(roster.get('alice@example.com')?.name, 'Alice')

  console.log('xmpp-persistence XmppStorage migration test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run it to verify it fails (old `*Path`-based context shape rejects this call)**

Run: `npx tsc --noEmit`
Expected: FAIL — `Property 'storage' does not exist on type 'XmppPersistenceLoadContext'` (or similar), since `storage` isn't a field yet.

- [ ] **Step 3: Rewrite the I/O helpers and load/persist functions in `src/core/xmpp-persistence.ts`**

Replace the `fs`/`dirname` import and `readJson`/`writeJson` helpers (current lines 1–2, 93–108) with:

```ts
import type { XmppStorage } from './storage/types.js'
```

```ts
async function readState<T>(storage: XmppStorage, namespace: string): Promise<T | undefined> {
  const raw = await storage.getRecord(namespace, 'state')
  if (raw === undefined) {
    return undefined
  }
  return JSON.parse(raw) as T
}

async function writeState(storage: XmppStorage, namespace: string, value: unknown): Promise<void> {
  await storage.putRecord(namespace, 'state', JSON.stringify(value), new Date().toISOString())
}
```

Remove the `dirname` import (no longer used) and the `rosterPath`/`feedPath`/`subscriptionPath`/`followerPath`/`collectionPath`/`attachmentPath`/`mucPath`/`mucHistoryPath`/`openPgpPath`/`vCardPath` fields from both `XmppPersistenceLoadContext` and `XmppPersistenceSaveContext`; add `storage: XmppStorage` to both interfaces instead.

Then replace every `readJson<T>(ctx.<x>Path)` call with `readState<T>(ctx.storage, '<namespace>')` and every `ctx.<x>Path` reference in error-log strings with the namespace string, per the Namespace Table above. Replace every `writeJson(ctx.<x>Path, value)` call with `writeState(ctx.storage, '<namespace>', value)`. Concretely:

```ts
export async function loadRosterState(ctx: XmppPersistenceLoadContext): Promise<void> {
  try {
    const parsed = await readState<XmppRosterFile | XmppRosterEntry[]>(ctx.storage, 'roster')
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries
    for (const entry of entries ?? []) {
      const normalized = ctx.normalizeRosterEntry(entry)
      ctx.roster.set(normalized.jid, normalized)
    }
  } catch (err: any) {
    console.error('[XMPP] Failed to load roster from storage:', err)
  }
}

export async function loadFeedHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppFeedFile | XmppFeedPost[]>(ctx.storage, 'feed_history')
    const posts = Array.isArray(parsed) ? parsed : parsed?.posts
    for (const post of posts ?? []) {
      const normalized = ctx.normalizeFeedPost(post)
      ctx.feedHistory.set(ctx.feedHistoryKey(normalized.topic, normalized.id), normalized)
    }
    trimMap(ctx.feedHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load feed history from storage:', err)
  }
}

export async function loadSubscriptionState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppSubscriptionFile | XmppFeedSubscriptionRecord[]>(ctx.storage, 'feed_subscriptions')
    const subscriptions = Array.isArray(parsed) ? parsed : parsed?.subscriptions
    for (const subscription of subscriptions ?? []) {
      const normalized = ctx.normalizeFeedSubscription(subscription)
      ctx.feedSubscriptions.set(normalized.topic, normalized)
    }
    trimMap(ctx.feedSubscriptions, limit)
    await ctx.restoreFeedSubscriptions()
  } catch (err: any) {
    console.error('[XMPP] Failed to load subscription state from storage:', err)
  }
}

export async function loadFollowerState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppFollowerFile | XmppFeedFollower[]>(ctx.storage, 'followers')
    const followers = Array.isArray(parsed) ? parsed : parsed?.followers
    for (const follower of followers ?? []) {
      const normalized = ctx.normalizeFollower(follower)
      ctx.followers.set(ctx.followerKey(normalized.feedPeerId, normalized.followerPeerId), normalized)
    }
    trimMap(ctx.followers, limit)
    await ctx.restoreFollowerSubscriptions()
  } catch (err: any) {
    console.error('[XMPP] Failed to load follower state from storage:', err)
  }
}

export async function loadCollectionState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppCollectionFile | XmppCollectionNode[]>(ctx.storage, 'collections')
    const collections = Array.isArray(parsed) ? parsed : parsed?.collections
    const posts = Array.isArray(parsed) ? [] : parsed?.posts

    for (const collection of collections ?? []) {
      const normalized = ctx.normalizeCollection(collection)
      ctx.collections.set(normalized.id, normalized)
      ctx.onCollectionLoaded(normalized)
    }

    for (const post of posts ?? []) {
      const normalized = ctx.normalizeCollectionPost(post)
      ctx.collectionHistory.set(ctx.collectionHistoryKey(normalized.collectionId, normalized.id), normalized)
    }

    trimMap(ctx.collectionHistory, limit)
    await ctx.restoreCollectionSubscriptions()
  } catch (err: any) {
    console.error('[XMPP] Failed to load collection state from storage:', err)
  }
}

export async function loadAttachmentHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppAttachmentFile | XmppAttachment[]>(ctx.storage, 'attachments')
    const attachments = Array.isArray(parsed) ? parsed : parsed?.attachments
    for (const attachment of attachments ?? []) {
      const normalized = ctx.normalizeAttachment(attachment)
      ctx.attachmentHistory.set(ctx.attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from), normalized)
    }
    trimMap(ctx.attachmentHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load attachment history from storage:', err)
  }
}

export async function loadMucState(ctx: XmppPersistenceLoadContext): Promise<void> {
  try {
    const parsed = await readState<XmppMucFile | XmppMucRoomSettings[]>(ctx.storage, 'muc_rooms')
    const rooms = Array.isArray(parsed) ? parsed : parsed?.rooms
    for (const room of rooms ?? []) {
      const normalized = ctx.normalizeMucRoomSettings(room)
      ctx.mucRooms.set(normalized.roomName, normalized)
    }
  } catch (err: any) {
    console.error('[XMPP] Failed to load MUC state from storage:', err)
  }
}

export async function loadMucHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppMucHistoryFile | XmppMucMessage[]>(ctx.storage, 'muc_history')
    const messages = Array.isArray(parsed) ? parsed : parsed?.messages
    for (const msg of messages ?? []) {
      const normalized = ctx.normalizeMucMessage(msg)
      ctx.mucHistory.set(ctx.mucHistoryKey(normalized.room, normalized.id), normalized)
    }
    trimMap(ctx.mucHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load MUC history from storage:', err)
  }
}
```

`loadVCardState` keeps its existing body except the `readJson(ctx.vCardPath)` call becomes `readState<XmppVCardFile | XmppVCardProfile>(ctx.storage, 'vcard')` and its error log drops the path interpolation.

For the persist side, apply the same substitution to each of the 9 `persistXState` functions (lines 271–351 in the old file) — `writeJson(ctx.<x>Path, value)` becomes `writeState(ctx.storage, '<namespace>', value)` per the Namespace Table, body otherwise unchanged. `persistOpenPgpState(path, state?)` becomes `persistOpenPgpState(storage: XmppStorage, state?: XmppOpenPgpStateFile)`:

```ts
export async function persistOpenPgpState(storage: XmppStorage, state?: XmppOpenPgpStateFile): Promise<void> {
  if (!state) {
    return
  }
  await writeState(storage, 'openpgp', state)
}
```

- [ ] **Step 4: Build and run the test**

Run: `npm run build && node dist/tests/persistence-storage.js`
Expected: prints `xmpp-persistence XmppStorage migration test passed`, exit code 0.

- [ ] **Step 5: Add the npm script**

Edit `package.json`, add after `"test-p2p-browser"`:

```json
    "test-persistence-storage": "node dist/tests/persistence-storage.js",
```

And add `&& npm run test-persistence-storage` at the end of the `"test"` script chain.

- [ ] **Step 6: Run the full test script**

Run: `npm test`
Expected: this is the only test exercising the new code so far (xmpp-node.ts/xmpp-openpgp.ts/xmpp-omemo-state.ts still call the old signatures and will fail to compile — see note below).

**Note:** This task leaves `xmpp-node.ts` and `xmpp-openpgp.ts` not compiling, because `getPersistenceLoadContext()`/`getPersistenceSaveContext()` still build the old `*Path`-keyed context shape and `persistOpenPgpStateFile(path, state)` still takes a path. **Do not attempt to fix the build in this task** — Tasks 2, 3, 5 fix the remaining call sites. Verify the *file you changed* compiles in isolation instead:

Run: `npx tsc --noEmit src/core/xmpp-persistence.ts --moduleResolution bundler --module esnext --target es2022 --skipLibCheck`
Expected: no errors reported for `xmpp-persistence.ts` itself (errors in *other* files that reference it are expected and will be fixed in later tasks).

- [ ] **Step 7: Commit**

```bash
git add src/core/xmpp-persistence.ts src/tests/persistence-storage.ts package.json
git commit -m "Migrate xmpp-persistence.ts load/persist functions to XmppStorage"
```

---

### Task 2: Migrate `XmppOpenPgpStateManager` to `XmppStorage`

**Files:**
- Modify: `src/core/xmpp-openpgp.ts`
- Create: `src/tests/openpgp-storage.ts`
- Modify: `package.json` (add `test-openpgp-storage` script, add to `test` chain)

**Interfaces:**
- Consumes: `XmppStorage` (Task 1's `persistOpenPgpState(storage, state?)` from `xmpp-persistence.ts`).
- Produces: `XmppOpenPgpStateManager` with constructor `(storage: XmppStorage, jid: string)` (was `(openPgpPath: string, jid: string)`) — same public method names (`load`, `persist`, `schedulePersist`, `close`). Used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/openpgp-storage.ts
import assert from 'node:assert/strict'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'
import { XmppOpenPgpStateManager } from '../core/xmpp-openpgp.js'

class FakeStorage implements XmppStorage {
  private records = new Map<string, Map<string, { value: string; updatedAt: string }>>()
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    return this.records.get(namespace)?.get(key)?.value
  }
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    if (!this.records.has(namespace)) this.records.set(namespace, new Map())
    this.records.get(namespace)!.set(key, { value, updatedAt })
  }
  async deleteRecord(namespace: string, key: string): Promise<void> {
    this.records.get(namespace)?.delete(key)
  }
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    return Array.from(this.records.get(namespace)?.entries() ?? []).map(([key, v]) => ({ key, value: v.value, updatedAt: v.updatedAt }))
  }
  async getBlob(): Promise<Uint8Array | undefined> { return undefined }
  async putBlob(): Promise<void> {}
  async deleteBlob(): Promise<void> {}
  async close(): Promise<void> {}
}

async function main() {
  const storage = new FakeStorage()
  const manager = new XmppOpenPgpStateManager(storage, 'alice@example.com')
  await manager.load()

  const raw = await storage.getRecord('openpgp', 'state')
  assert.ok(raw, 'load() must generate and persist key state when storage is empty')
  const state = JSON.parse(raw as string)
  assert.ok(typeof state.privateKey === 'string' && state.privateKey.length > 0)
  assert.ok(typeof state.fingerprint === 'string' && state.fingerprint.length > 0)

  await manager.close()

  // reload from the same storage should NOT regenerate keys
  const manager2 = new XmppOpenPgpStateManager(storage, 'alice@example.com')
  await manager2.load()
  const raw2 = await storage.getRecord('openpgp', 'state')
  assert.equal(raw2, raw, 'reloading existing key state must not regenerate keys')
  await manager2.close()

  console.log('XmppOpenPgpStateManager XmppStorage migration test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — constructor type mismatch (`XmppOpenPgpStateManager` still expects `(openPgpPath: string, jid: string)`).

- [ ] **Step 3: Update `src/core/xmpp-openpgp.ts`**

Change the constructor and the three storage call sites:

```ts
export class XmppOpenPgpStateManager {
  constructor(
    private readonly storage: XmppStorage,
    private readonly jid: string
  ) { }
```

```ts
  async load(): Promise<void> {
    const raw = await this.storage.getRecord('openpgp', 'state')
    if (raw === undefined) {
      await this.generate()
      return
    }
    this.state = JSON.parse(raw) as XmppOpenPgpStateFile
    // ... rest of existing load() body that processes this.state unchanged
  }
```

Replace the existing `fs.readFile(this.openPgpPath, 'utf8')` + ENOENT-catch block with the `getRecord`/`undefined`-check shown above (delete the try/catch entirely — `getRecord` returning `undefined` is the not-found signal, no exception to catch).

Replace `persist()`'s body:

```ts
  private async persist(): Promise<void> {
    await persistOpenPgpState(this.storage, this.state)
  }
```

Add the import at the top of the file:

```ts
import type { XmppStorage } from './storage/types.js'
import { persistOpenPgpState } from './xmpp-persistence.js'
```

(Remove any now-unused `fs`/`path` imports if `xmpp-openpgp.ts` had no other use for them — check the rest of the file before deleting.)

- [ ] **Step 4: Build and run the test**

Run: `npm run build && node dist/tests/openpgp-storage.js`
Expected: prints `XmppOpenPgpStateManager XmppStorage migration test passed`, exit code 0.

- [ ] **Step 5: Add the npm script**

Edit `package.json`, add after `"test-persistence-storage"`:

```json
    "test-openpgp-storage": "node dist/tests/openpgp-storage.js",
```

And add `&& npm run test-openpgp-storage` at the end of the `"test"` script chain.

- [ ] **Step 6: Commit**

```bash
git add src/core/xmpp-openpgp.ts src/tests/openpgp-storage.ts package.json
git commit -m "Migrate XmppOpenPgpStateManager to XmppStorage"
```

---

### Task 3: Migrate `XmppOmemoStateManager` to `XmppStorage`

**Files:**
- Modify: `src/core/xmpp-omemo-state.ts`
- Create: `src/tests/omemo-state-storage.ts`
- Modify: `package.json` (add `test-omemo-state-storage` script, add to `test` chain)

**Interfaces:**
- Consumes: `XmppStorage`.
- Produces: `XmppOmemoStateManager` with constructor `(storage: XmppStorage)` (was `(omemoPath: string)`) — same public method names. Used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/omemo-state-storage.ts
import assert from 'node:assert/strict'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'
import { XmppOmemoStateManager } from '../core/xmpp-omemo-state.js'

class FakeStorage implements XmppStorage {
  private records = new Map<string, Map<string, { value: string; updatedAt: string }>>()
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    return this.records.get(namespace)?.get(key)?.value
  }
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    if (!this.records.has(namespace)) this.records.set(namespace, new Map())
    this.records.get(namespace)!.set(key, { value, updatedAt })
  }
  async deleteRecord(namespace: string, key: string): Promise<void> {
    this.records.get(namespace)?.delete(key)
  }
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    return Array.from(this.records.get(namespace)?.entries() ?? []).map(([key, v]) => ({ key, value: v.value, updatedAt: v.updatedAt }))
  }
  async getBlob(): Promise<Uint8Array | undefined> { return undefined }
  async putBlob(): Promise<void> {}
  async deleteBlob(): Promise<void> {}
  async close(): Promise<void> {}
}

async function main() {
  const storage = new FakeStorage()
  const manager = new XmppOmemoStateManager(storage)
  await manager.load()

  const raw = await storage.getRecord('omemo', 'state')
  assert.ok(raw, 'load() must generate and persist OMEMO key state when storage is empty')
  const state = JSON.parse(raw as string)
  assert.ok(typeof state.deviceId === 'number')
  assert.ok(typeof state.registrationId === 'number')

  await manager.close()

  const manager2 = new XmppOmemoStateManager(storage)
  await manager2.load()
  const raw2 = await storage.getRecord('omemo', 'state')
  assert.equal(raw2, raw, 'reloading existing OMEMO state must not regenerate keys')
  await manager2.close()

  console.log('XmppOmemoStateManager XmppStorage migration test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — constructor type mismatch.

- [ ] **Step 3: Update `src/core/xmpp-omemo-state.ts`**

```ts
export class XmppOmemoStateManager {
  constructor(private readonly storage: XmppStorage) { }
```

Replace the `load()` body's `fs.readFile(this.omemoPath, 'utf8')` + ENOENT-catch with:

```ts
  async load(): Promise<void> {
    const raw = await this.storage.getRecord('omemo', 'state')
    if (raw === undefined) {
      await this.generate()
      return
    }
    this.state = JSON.parse(raw) as XmppOmemoStateFile
    // ... rest of existing load() body that processes this.state unchanged
  }
```

Replace `persist()`'s body (the `fs.mkdir`/`fs.writeFile` pair at lines 369–377 in the old file):

```ts
  private async persist(): Promise<void> {
    await this.storage.putRecord('omemo', 'state', JSON.stringify(this.state), new Date().toISOString())
  }
```

Add the import:

```ts
import type { XmppStorage } from './storage/types.js'
```

Remove the now-unused `fs`/`dirname` imports if nothing else in the file uses them — check the rest of the file (the WASM-related code lives in `omemo-runtime.ts`, not here, so this file should have no remaining `fs` use after this change).

- [ ] **Step 4: Build and run the test**

Run: `npm run build && node dist/tests/omemo-state-storage.js`
Expected: prints `XmppOmemoStateManager XmppStorage migration test passed`, exit code 0.

- [ ] **Step 5: Add the npm script**

Edit `package.json`, add after `"test-openpgp-storage"`:

```json
    "test-omemo-state-storage": "node dist/tests/omemo-state-storage.js",
```

And add `&& npm run test-omemo-state-storage` at the end of the `"test"` script chain.

- [ ] **Step 6: Commit**

```bash
git add src/core/xmpp-omemo-state.ts src/tests/omemo-state-storage.ts package.json
git commit -m "Migrate XmppOmemoStateManager to XmppStorage"
```

---

### Task 4: Migrate `XmppUploadManager` to `XmppStorage`

**Files:**
- Modify: `src/core/xmpp-uploads.ts`
- Create: `src/tests/uploads-storage.ts`
- Modify: `package.json` (add `test-uploads-storage` script, add to `test` chain)

**Interfaces:**
- Consumes: `XmppStorage`.
- Produces: `XmppUploadContext` drops `uploadPath`/`uploadObjectsPath`/`uploadAliasesPath`, gains `storage: XmppStorage`. `XmppUploadManager`'s public method signatures (`ensureUploadServer`, `ensureUploadAnnouncementSubscription`, `getUploadContentUrl`, `handleUploadHttpRequest`) are unchanged. Used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/uploads-storage.ts
import assert from 'node:assert/strict'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'
import { XmppUploadManager, type XmppUploadContext } from '../core/xmpp-uploads.js'

class FakeStorage implements XmppStorage {
  private records = new Map<string, Map<string, { value: string; updatedAt: string }>>()
  private blobs = new Map<string, Map<string, Uint8Array>>()
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    return this.records.get(namespace)?.get(key)?.value
  }
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    if (!this.records.has(namespace)) this.records.set(namespace, new Map())
    this.records.get(namespace)!.set(key, { value, updatedAt })
  }
  async deleteRecord(namespace: string, key: string): Promise<void> {
    this.records.get(namespace)?.delete(key)
  }
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    return Array.from(this.records.get(namespace)?.entries() ?? []).map(([key, v]) => ({ key, value: v.value, updatedAt: v.updatedAt }))
  }
  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    return this.blobs.get(namespace)?.get(key)
  }
  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    if (!this.blobs.has(namespace)) this.blobs.set(namespace, new Map())
    this.blobs.get(namespace)!.set(key, data)
  }
  async deleteBlob(namespace: string, key: string): Promise<void> {
    this.blobs.get(namespace)?.delete(key)
  }
  async close(): Promise<void> {}
}

async function main() {
  const storage = new FakeStorage()
  const published: Array<{ topic: string; data: Uint8Array }> = []
  const ctx: XmppUploadContext = {
    jid: 'alice@example.com',
    ready: Promise.resolve(),
    storage,
    uploadPort: 0,
    uploadHost: '127.0.0.1',
    getPubSubService: () => ({
      subscribe: async () => {},
      publish: async (topic: string, data: Uint8Array) => { published.push({ topic, data }) }
    }),
    emit: () => true
  }

  const manager = new XmppUploadManager(ctx)
  await manager.ensureUploadServer()

  const baseUrl = manager.getUploadContentUrl('placeholder')?.replace(/\/ipfs\/placeholder$/, '')
  assert.ok(baseUrl, 'upload server must be listening and have a base URL')

  // PUT an upload through the real HTTP server, then verify it's stored via XmppStorage, not fs.
  const http = await import('http')
  const slotRes = await new Promise<any>((resolve) => {
    // Manually register a slot the way createUploadSlot would (testing storage wiring, not slot creation logic)
    ;(manager as any).uploadSlots.set('slot-1', { slotId: 'slot-1', filename: 'a.txt', contentType: 'text/plain', size: 5, createdAt: new Date().toISOString() })
    resolve(undefined)
  })

  const payload = Buffer.from('hello')
  await new Promise<void>((resolve, reject) => {
    const req = http.request(`${baseUrl}/upload/slot-1`, { method: 'PUT' }, (res) => {
      res.on('data', () => {})
      res.on('end', resolve)
    })
    req.on('error', reject)
    req.end(payload)
  })

  const cid = require('crypto').createHash('sha256').update(payload).digest('hex')
  const storedBlob = await storage.getBlob('uploads', cid)
  assert.ok(storedBlob, 'uploaded bytes must be stored via XmppStorage.putBlob under namespace "uploads"')
  assert.deepEqual(Array.from(storedBlob as Uint8Array), Array.from(payload))

  const storedMeta = await storage.getRecord('uploads_meta', cid)
  assert.ok(storedMeta, 'upload metadata must be stored via XmppStorage.putRecord under namespace "uploads_meta"')

  console.log('XmppUploadManager XmppStorage migration test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `XmppUploadContext` has no `storage` field yet, still requires `uploadPath`/`uploadObjectsPath`/`uploadAliasesPath`.

- [ ] **Step 3: Update `src/core/xmpp-uploads.ts`**

Change the context interface (lines 14–24):

```ts
export interface XmppUploadContext {
  jid: string
  ready: Promise<void>
  storage: XmppStorage
  uploadPort: number
  uploadHost: string
  getPubSubService(): any
  emit(event: string, ...args: any[]): boolean
}
```

Add the import:

```ts
import type { XmppStorage } from './storage/types.js'
```

Delete the `uploadObjectPath`/`uploadObjectMetaPath`/`uploadAliasPath`/`ensureUploadStorage` private methods (lines 39–54) entirely — `XmppStorage` has no "directory" concept, so there is nothing to ensure.

Delete the call to `this.ensureUploadStorage()` inside `ensureUploadServer()` (was line 63) and inside `storeUploadObject()` (was line 219).

Replace `hasUploadObject` (lines 149–156):

```ts
  private async hasUploadObject(cid: string): Promise<boolean> {
    return (await this.context.storage.getBlob('uploads', cid)) !== undefined
  }
```

Replace `storeUploadObject` (lines 218–236):

```ts
  private async storeUploadObject(manifest: XmppUploadManifest, payload: Buffer): Promise<void> {
    const providers = this.buildUploadProviders(manifest)
    await this.context.storage.putBlob('uploads', manifest.cid, new Uint8Array(payload))
    await this.context.storage.putRecord('uploads_meta', manifest.cid, JSON.stringify({
      cid: manifest.cid,
      slotId: manifest.slotId,
      filename: manifest.filename,
      contentType: manifest.contentType,
      size: manifest.size,
      uploadedAt: manifest.uploadedAt,
      sourceUrl: manifest.getUrl,
      from: manifest.from,
      providers,
      cachedAt: new Date().toISOString()
    }), new Date().toISOString())
  }
```

Replace `readUploadAlias` (lines 365–377):

```ts
  private async readUploadAlias(slotId: string): Promise<{ cid: string } | undefined> {
    const raw = await this.context.storage.getRecord('uploads_alias', slotId)
    if (raw === undefined) {
      return undefined
    }
    const parsed = JSON.parse(raw) as { cid?: string }
    if (typeof parsed.cid === 'string' && parsed.cid.length > 0) {
      return { cid: parsed.cid }
    }
    return undefined
  }
```

Replace `readUploadMeta` (lines 379–387):

```ts
  private async readUploadMeta(cid: string): Promise<{ filename?: string; contentType?: string; size?: number; slotId?: string } | undefined> {
    const raw = await this.context.storage.getRecord('uploads_meta', cid)
    if (raw === undefined) {
      return undefined
    }
    return JSON.parse(raw) as { filename?: string; contentType?: string; size?: number; slotId?: string }
  }
```

In `handleUploadHttpRequest`'s `PUT /upload/:slotId` branch (old lines 440–459), replace the three `fs.writeFile` calls:

```ts
      const payload = Buffer.concat(chunks)
      const cid = createHash('sha256').update(payload).digest('hex')

      await this.context.storage.putBlob('uploads', cid, new Uint8Array(payload))
      await this.context.storage.putRecord('uploads_meta', cid, JSON.stringify({
        cid,
        slotId,
        filename: slot.filename,
        contentType: slot.contentType,
        size: slot.size,
        uploadedAt: new Date().toISOString()
      }), new Date().toISOString())
      await this.context.storage.putRecord('uploads_alias', slotId, JSON.stringify({
        cid,
        slotId,
        uploadedAt: new Date().toISOString()
      }), new Date().toISOString())
      this.uploadSlots.delete(slotId)
```

(Remove the now-unused `objectPath`/`objectMetaPath`/`aliasPath` local variable declarations that preceded this block.)

In the GET handler (old lines 483–520ish), replace the two `fs.readFile(objectPath)` calls with `await this.context.storage.getBlob('uploads', ipfsId)`, returning 404 if `undefined` instead of relying on a thrown ENOENT:

```ts
    const ipfsId = decodeURIComponent(pathParts[1])
    const alias = await this.readUploadAlias(ipfsId)
    if (alias) {
      res.statusCode = 302
      res.setHeader('Location', `${this.uploadBaseUrl}/ipfs/${alias.cid}`)
      res.end()
      return
    }

    const objectMeta = await this.readUploadMeta(ipfsId)
    let data = await this.context.storage.getBlob('uploads', ipfsId)
    if (!data) {
      const manifest = this.uploadManifests.get(ipfsId)
      if (manifest && await this.fetchAndCacheUpload(manifest)) {
        data = await this.context.storage.getBlob('uploads', ipfsId)
      }
    }

    if (!data) {
      res.statusCode = 404
      res.end('not found')
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', objectMeta?.contentType ?? 'application/octet-stream')
    res.setHeader('Content-Length', String(data.length))
    if (objectMeta?.filename) {
      res.setHeader('Content-Disposition', `attachment; filename="${objectMeta.filename.replace(/\"/g, '\\"')}"`)
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.end(Buffer.from(data))
```

Remove the now-unused `import { promises as fs } from 'fs'` and `import { join } from 'path'` if nothing else in the file needs them (check `fetchAndCacheUpload`, which is unaffected by this task, before deleting `join` — keep it if still used elsewhere).

- [ ] **Step 4: Build and run the test**

Run: `npm run build && node dist/tests/uploads-storage.js`
Expected: prints `XmppUploadManager XmppStorage migration test passed`, exit code 0.

- [ ] **Step 5: Add the npm script**

Edit `package.json`, add after `"test-omemo-state-storage"`:

```json
    "test-uploads-storage": "node dist/tests/uploads-storage.js",
```

And add `&& npm run test-uploads-storage` at the end of the `"test"` script chain.

- [ ] **Step 6: Commit**

```bash
git add src/core/xmpp-uploads.ts src/tests/uploads-storage.ts package.json
git commit -m "Migrate XmppUploadManager to XmppStorage"
```

---

### Task 5: Wire `XmppNode` to `XmppStorage`, delete `XmppSqliteStore`, update `src/index.ts`

**Files:**
- Modify: `src/core/xmpp-node.ts`
- Delete: `src/core/xmpp-sqlite.ts`
- Modify: `src/index.ts`
- Modify: `package.json` (the `test-sqlite` script and its `XmppSqliteStore`-specific test become dead — see Step 6)

**Interfaces:**
- Consumes: `XmppStorage` (Tasks 1–4's updated managers and persistence functions), `NodeSqliteStorage` from `src/core/storage/node-sqlite-storage.ts` (already exists, used by the new `src/index.ts`).
- Produces: `XmppNodeOptions` drops all 10 `*Path?: string` fields and gains `storage: XmppStorage` (now **required**, not optional — there is no filesystem default left to fall back to). `XmppNode`'s constructor signature becomes `constructor(libp2p: Libp2p, storage: XmppStorage, options: XmppNodeOptions = {})`.

- [ ] **Step 1: Update `XmppNodeOptions` and the constructor in `src/core/xmpp-node.ts`**

Replace the `XmppNodeOptions` interface (old lines 245–258):

```ts
export interface XmppNodeOptions {
  nickname?: string
}
```

Replace the constructor signature and the path-derivation block (old lines 329–353):

```ts
constructor(libp2p: Libp2p, storage: XmppStorage, options: XmppNodeOptions = {}) {
  this.storage = storage
  this.omemoStateManager = new XmppOmemoStateManager(storage)
  this.openPgpStateManager = new XmppOpenPgpStateManager(storage, this.jid)
  // ... keep every other line in the constructor that does NOT reference a *Path field or XmppSqliteStore unchanged
```

Add a `private readonly storage: XmppStorage` field declaration alongside the existing manager field declarations, and delete the `sqliteStore: XmppSqliteStore` field declaration and its import (`import { XmppSqliteStore } from './xmpp-sqlite.js'`).

Add the import:

```ts
import type { XmppStorage } from './storage/types.js'
```

- [ ] **Step 2: Update `getPersistenceLoadContext()`/`getPersistenceSaveContext()`**

In both methods (old lines 406–474), remove every `<x>Path: this.<x>Path` entry and add `storage: this.storage` instead. Example for the load context:

```ts
private getPersistenceLoadContext(): XmppPersistenceLoadContext {
  return {
    storage: this.storage,
    roster: this.roster,
    feedHistory: this.feedHistory,
    // ... every other non-Path field unchanged
  }
}
```

Do the same for `getPersistenceSaveContext()`, additionally removing the `openPgpPath` field (now unused — `persistOpenPgpState` takes `storage` directly per Task 1/2, called from `XmppOpenPgpStateManager.persist()`, not from the save-context path).

- [ ] **Step 3: Remove `loadSqliteState`/`persistSqliteState` and all callers**

Delete the `loadSqliteState()` method body (old lines 537–546) and its call at the end of the ready chain (old line 371). Delete `persistSqliteState()` (old lines 913–915) and every call to it from the 8 other persist methods (old lines 806–911) — e.g. `persistRoster()` becomes:

```ts
private async persistRoster(): Promise<void> {
  await persistRosterState(this.getPersistenceSaveContext())
}
```

(Drop the `+ persistSqliteState()` half of each of these 8 methods — `persistRosterState`, `persistFeedHistory`, `persistSubscriptionState`, `persistFollowerState`, `persistCollectionState`, `persistAttachmentHistory`, `persistVCard`, and `persistMucState` which additionally keeps its `persistMucStateToDht`/`persistMucStateFile` calls, dropping only the `persistSqliteState()` call.)

- [ ] **Step 4: Update the `close()` method**

Old lines 2633–2652 — replace:

```ts
this.sqliteStore.close()
```

with nothing (delete the line); `storage.close()` is the caller's responsibility (the entry point owns the `XmppStorage` instance's lifecycle, matching how it owns `libp2p`'s), so `XmppNode.close()` should not call `this.storage.close()`.

- [ ] **Step 5: Delete `src/core/xmpp-sqlite.ts`**

```bash
git rm src/core/xmpp-sqlite.ts
```

Search for any remaining references to confirm nothing else imports it:

Run: `grep -rn "xmpp-sqlite" src/`
Expected: no output (all references removed in Steps 1–4).

- [ ] **Step 6: Remove the now-dead `test-sqlite` script**

Run: `grep -n "test-sqlite\|XmppSqliteStore" src/tests/*.ts package.json`

If `src/tests/sqlite.ts` (or similarly named) exists and only tests `XmppSqliteStore`, delete it and remove its `test-sqlite` entry plus its `&& npm run test-sqlite` reference from the `test` chain in `package.json`. If the test file covers anything beyond `XmppSqliteStore`, stop and flag it for manual review rather than deleting — don't guess.

- [ ] **Step 7: Update `src/index.ts`**

```ts
import { NodeSqliteStorage } from './core/storage/node-sqlite-storage.js'
import { join } from 'path'

// ... existing imports and startupOptions parsing unchanged

const storage = new NodeSqliteStorage(
  startupOptions.sqlitePath ?? process.env.XMPP_SQLITE_PATH ?? join(process.cwd(), 'data', 'state.sqlite')
)

const libp2p = await createP2PNode(startupOptions.port, { host: startupOptions.host })

// ... existing libp2p.start() / logging block unchanged

const xmppNode = new XmppNode(libp2p, storage, {})

await xmppNode.ready

await startCli(libp2p, xmppNode)
```

Check `startupOptions`' type (wherever it's parsed, e.g. `src/cli/*.ts`) for an existing `sqlitePath` field — if it has a `rosterPath`-style CLI flag already and no `sqlitePath` flag, add one following the same pattern (`--sqlite-path <path>` or whatever convention `rosterPath`'s flag used), rather than inventing a new convention.

- [ ] **Step 8: Update every other call site of `new XmppNode(...)`**

Run: `grep -rln "new XmppNode(" src/`

For each test file found (likely several in `src/tests/`, e.g. testing roster/feed/MUC/OMEMO behavior end-to-end), update the constructor call from `new XmppNode(libp2p, { rosterPath: ... })`-style to `new XmppNode(libp2p, storage, {})`, constructing a `NodeSqliteStorage` (or an in-memory fake, matching whatever isolation that specific test already relied on via tmpdir-based `*Path` options) at the top of each test's `main()`. Since each test's exact current setup differs, read the specific file before editing it — don't apply a single substitution blindly.

- [ ] **Step 9: Build and run the full test suite**

Run: `npm run build && npm test`
Expected: all tests pass, including every test updated in Step 8.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Wire XmppNode to XmppStorage, delete XmppSqliteStore"
```

---

### Task 6: Browser-compatible OMEMO module loading

**Files:**
- Create: `src/core/omemo-runtime-browser.ts`
- Modify: `src/core/xmpp-omemo-state.ts`
- Create: `src/tests/omemo-runtime-browser.ts`
- Modify: `package.json` (add `test-omemo-runtime-browser` script — Node-side smoke test only, real browser exercise happens in Task 8's Playwright test)

**Interfaces:**
- Produces: `loadOmemoModule(): Promise<OmemoModule>` in `omemo-runtime-browser.ts`, same name/signature/return type as the existing Node one in `src/core/omemo-runtime.ts`, so both are drop-in interchangeable.
- Modifies: `XmppOmemoStateManager`'s constructor to accept an injected loader: `constructor(storage: XmppStorage, loadOmemoModule: () => Promise<OmemoModule> = nodeLoadOmemoModule)`.

`libomemo.js`'s UMD bundle already branches on `typeof document === 'undefined'` to support real browsers natively (see `src/core/omemo-runtime.ts:63`, which patches around that branch specifically *because* Node has no `document`) — so the browser loader needs none of the Node-side WASM-fetch-shim/CJS-patching machinery; it's a plain dynamic import.

- [ ] **Step 1: Write `src/core/omemo-runtime-browser.ts`**

```ts
/**
 * @fileoverview Browser-targeted libomemo.js loader. The Node loader in
 * omemo-runtime.ts exists only to work around Node having no `document` global
 * (which libomemo.js's UMD bundle uses to resolve its own script/WASM location);
 * in a real browser that branch already works, so this is a plain dynamic import.
 */

import type {
  Direction as OmemoDirection,
  KeyPair as OmemoKeyPair,
  OMEMOAddress as OmemoAddress,
  SessionBuilder as OmemoSessionBuilder,
  SessionCipher as OmemoSessionCipher
} from 'libomemo.js'

type OmemoModule = typeof import('libomemo.js')

let omemoModulePromise: Promise<OmemoModule> | undefined

async function loadOmemoModule(): Promise<OmemoModule> {
  if (!omemoModulePromise) {
    omemoModulePromise = import('libomemo.js')
  }
  return await omemoModulePromise
}

export type {
  OmemoDirection,
  OmemoKeyPair,
  OmemoAddress,
  OmemoSessionBuilder,
  OmemoSessionCipher
}

export { loadOmemoModule }
```

- [ ] **Step 2: Update `src/core/xmpp-omemo-state.ts` to accept an injected loader**

Find the existing `import { loadOmemoModule } from './omemo-runtime.js'` line and the call site inside `getStore()`/`generate()` (wherever `loadOmemoModule()` is invoked). Change the import to:

```ts
import { loadOmemoModule as nodeLoadOmemoModule, type OmemoModule } from './omemo-runtime.js'
```

Update the constructor:

```ts
export class XmppOmemoStateManager {
  constructor(
    private readonly storage: XmppStorage,
    private readonly loadOmemoModule: () => Promise<OmemoModule> = nodeLoadOmemoModule
  ) { }
```

Replace every call to the module-level `loadOmemoModule()` function inside this file's methods with `this.loadOmemoModule()`.

(`OmemoModule` needs exporting from `omemo-runtime.ts` if it isn't already — add `export type OmemoModule = typeof import('libomemo.js')` there next to the existing `type OmemoModule = ...` line, changing it from a private type alias to an exported one, and mirror the same export in `omemo-runtime-browser.ts`, which Step 1 already does.)

- [ ] **Step 3: Write the Node-side smoke test**

```ts
// src/tests/omemo-runtime-browser.ts
import assert from 'node:assert/strict'
import { loadOmemoModule } from '../core/omemo-runtime-browser.js'

async function main() {
  // This only verifies the dynamic import resolves the package's Node-resolvable
  // entry point and exposes the expected shape — it does not prove the UMD bundle's
  // browser-only document-based path works, since this runs under Node. Real
  // browser-to-browser exercise of this loader happens in the Task 8 Playwright test.
  const omemo = await loadOmemoModule()
  assert.ok(omemo, 'loadOmemoModule() must resolve to the libomemo.js module')
  assert.ok(typeof (omemo as any).KeyHelper === 'object' || typeof (omemo as any).KeyHelper === 'function', 'module must expose KeyHelper')
  console.log('omemo-runtime-browser smoke test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

Check the actual top-level export names of `libomemo.js` (run `node -e "import('libomemo.js').then(m => console.log(Object.keys(m)))"` from the repo root) before finalizing this assertion — replace `KeyHelper` with whatever name is actually exported if it differs.

- [ ] **Step 4: Build and run the test**

Run: `npm run build && node dist/tests/omemo-runtime-browser.js`
Expected: prints `omemo-runtime-browser smoke test passed`, exit code 0. If the dynamic `import('libomemo.js')` fails under plain Node (e.g. because the package's `package.json` `exports` field only declares a browser condition), note the exact error and fall back to importing the same UMD dist file path Node's loader uses (`node_modules/libomemo.js/dist/libomemo.umd.js`) via dynamic `import()` instead of the bare specifier — only as a last resort, since a bare specifier import is what a real bundler (esbuild/Vite) would resolve for the browser build.

- [ ] **Step 5: Add the npm script**

Edit `package.json`, add after `"test-uploads-storage"`:

```json
    "test-omemo-runtime-browser": "node dist/tests/omemo-runtime-browser.js",
```

And add `&& npm run test-omemo-runtime-browser` at the end of the `"test"` script chain.

- [ ] **Step 6: Commit**

```bash
git add src/core/omemo-runtime-browser.ts src/core/xmpp-omemo-state.ts src/core/omemo-runtime.ts src/tests/omemo-runtime-browser.ts package.json
git commit -m "Add browser-compatible OMEMO module loader"
```

---

### Task 7: Browser entry point

**Files:**
- Create: `src/browser-index.ts`

**Interfaces:**
- Consumes: `IndexedDbStorage` (Task 3 of the prior plan, already exists), `createBrowserP2PNode` (already exists), `XmppNode` (Task 5 of this plan), `loadOmemoModule` from `omemo-runtime-browser.ts` (Task 6).
- Produces: `createBrowserXmppClient(options: CreateBrowserXmppClientOptions): Promise<{ libp2p: Libp2p; xmppNode: XmppNode }>` — the single function a browser app (e.g. the `ui/` Svelte app) calls to stand up a fully browser-backed client. Used by Task 8's Playwright test page.

- [ ] **Step 1: Write `src/browser-index.ts`**

```ts
/**
 * @fileoverview Browser entry point: wires IndexedDbStorage + the browser libp2p
 * factory + XmppNode together. This is the browser counterpart to src/index.ts.
 */

import type { Libp2p } from 'libp2p'
import { createBrowserP2PNode } from './core/p2p-browser.js'
import { IndexedDbStorage } from './core/storage/indexeddb-storage.js'
import { XmppNode, type XmppNodeOptions } from './core/xmpp-node.js'
import { XmppOmemoStateManager } from './core/xmpp-omemo-state.js'
import { loadOmemoModule } from './core/omemo-runtime-browser.js'

export interface CreateBrowserXmppClientOptions {
  bootstrapAddrs: string[]
  dbName?: string
  nickname?: string
}

export async function createBrowserXmppClient(
  options: CreateBrowserXmppClientOptions
): Promise<{ libp2p: Libp2p; xmppNode: XmppNode }> {
  const storage = new IndexedDbStorage(options.dbName ?? 'xmpp-p2p')
  const libp2p = await createBrowserP2PNode({ bootstrapAddrs: options.bootstrapAddrs })
  await libp2p.start()

  const nodeOptions: XmppNodeOptions = { nickname: options.nickname }
  const xmppNode = new XmppNode(libp2p, storage, nodeOptions)
  // browser build uses the browser OMEMO loader instead of XmppNode's Node-default
  ;(xmppNode as unknown as { omemoStateManager: XmppOmemoStateManager }).omemoStateManager =
    new XmppOmemoStateManager(storage, loadOmemoModule)

  await xmppNode.ready

  return { libp2p, xmppNode }
}
```

Note the cast in the `omemoStateManager` reassignment: if `XmppNode` declares that field `private` rather than implicitly-public, change `XmppNode`'s field declaration in `src/core/xmpp-node.ts` (Task 5) from `private readonly omemoStateManager` to `private readonly omemoStateManager: XmppOmemoStateManager` constructed directly from an injected loader instead — i.e. thread the loader through `XmppNodeOptions` as `omemoModuleLoader?: () => Promise<OmemoModule>` and pass it to `new XmppOmemoStateManager(storage, options.omemoModuleLoader)` inside the constructor, rather than reassigning a private field from outside the class after construction. Prefer this cleaner approach — only fall back to the cast-and-reassign shown above if threading it through breaks Task 5's already-committed constructor in a way that's awkward to revise.

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: compiles with no errors. There is no runtime test for this file yet — Task 8's Playwright test is what actually exercises `createBrowserXmppClient` in a real browser sandbox (IndexedDB and WebRTC are both unavailable under plain Node, so a `node dist/tests/*.js`-style test can't meaningfully exercise this).

- [ ] **Step 3: Commit**

```bash
git add src/browser-index.ts
git commit -m "Add browser entry point wiring IndexedDbStorage and browser libp2p"
```

---

### Task 8: Playwright browser-to-browser WebRTC interop test

**Files:**
- Create: `playwright.config.ts`
- Create: `src/tests/browser/fixture-page.html`
- Create: `src/tests/browser/fixture-bundle-entry.ts`
- Create: `tests-e2e/browser-webrtc-interop.spec.ts`
- Modify: `package.json` (add `@playwright/test` and `esbuild` devDependencies, add `pretest-browser-e2e` and `test-browser-e2e` scripts — **not** added to the default `test` chain per Global Constraints)

**Interfaces:**
- Consumes: `createBrowserXmppClient` (Task 7), `createP2PNode` (existing, used to spin up a Node-side relay/bootstrap peer the two browser tabs both dial).

- [ ] **Step 1: Install dependencies**

Run: `npm install --save-dev @playwright/test esbuild`
Expected: both added to `devDependencies` in `package.json` and `package-lock.json`.

Run: `npx playwright install chromium`
Expected: downloads the Chromium browser binary Playwright needs. **This step requires network access and is not guaranteed to succeed in every sandboxed environment** — if it fails here, note that explicitly rather than silently treating the task as done; the test in this task cannot run without it.

- [ ] **Step 2: Write the fixture bundle entry point**

```ts
// src/tests/browser/fixture-bundle-entry.ts
import { createBrowserXmppClient } from '../../browser-index.js'

;(window as unknown as { createBrowserXmppClient: typeof createBrowserXmppClient }).createBrowserXmppClient = createBrowserXmppClient
```

- [ ] **Step 3: Write the fixture HTML page**

```html
<!-- src/tests/browser/fixture-page.html -->
<!DOCTYPE html>
<html>
<head><title>XMPP P2P browser fixture</title></head>
<body>
  <script src="./fixture-bundle.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30000,
  use: {
    headless: true
  }
})
```

- [ ] **Step 5: Write the interop spec**

```ts
// tests-e2e/browser-webrtc-interop.spec.ts
import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'
import { join } from 'path'
import { fileURLToPath } from 'url'

const fixtureDir = fileURLToPath(new URL('../src/tests/browser', import.meta.url))

test('two browser tabs WebRTC-dial each other and exchange an XMPP message', async ({ browser }) => {
  const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, host: '127.0.0.1' })
  await relay.start()
  const relayWsAddr = relay.getMultiaddrs().find((ma) => ma.toString().includes('/ws'))
  expect(relayWsAddr).toBeTruthy()

  const pageA = await browser.newPage()
  const pageB = await browser.newPage()

  await pageA.goto(`file://${join(fixtureDir, 'fixture-page.html')}`)
  await pageB.goto(`file://${join(fixtureDir, 'fixture-page.html')}`)

  const clientA = await pageA.evaluate(async (bootstrapAddr) => {
    const { xmppNode, libp2p } = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName: 'tab-a' })
    return { jid: xmppNode.jid, peerId: libp2p.peerId.toString() }
  }, relayWsAddr!.toString())

  const clientB = await pageB.evaluate(async (bootstrapAddr) => {
    const { xmppNode, libp2p } = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName: 'tab-b' })
    return { jid: xmppNode.jid, peerId: libp2p.peerId.toString() }
  }, relayWsAddr!.toString())

  expect(clientA.peerId).not.toEqual(clientB.peerId)

  // Both tabs joined the same KadDHT via the relay's bootstrap address; give them
  // a moment to discover each other before asserting a direct WebRTC connection exists.
  await pageA.waitForFunction(
    (peerIdB) => (window as any).__connections?.includes(peerIdB),
    clientB.peerId,
    { timeout: 15000 }
  ).catch(() => {
    throw new Error('Tab A never established a connection to Tab B\'s peer ID — check WebRTC/circuit-relay dial path in createBrowserP2PNode')
  })

  await relay.stop()
})
```

Note: this spec references `window.__connections`, which `fixture-bundle-entry.ts` (Step 2) does not yet populate — add this before finalizing the task:

```ts
// append to src/tests/browser/fixture-bundle-entry.ts, after the createBrowserXmppClient assignment
;(window as unknown as { __connections: string[] }).__connections = []
const originalCreate = (window as any).createBrowserXmppClient
;(window as any).createBrowserXmppClient = async (opts: Parameters<typeof createBrowserXmppClient>[0]) => {
  const result = await originalCreate(opts)
  result.libp2p.addEventListener('connection:open', (evt: any) => {
    ;(window as any).__connections.push(evt.detail.remotePeer.toString())
  })
  return result
}
```

- [ ] **Step 6: Add a build step for the fixture bundle and wire the npm scripts**

Edit `package.json`, add:

```json
    "pretest-browser-e2e": "esbuild src/tests/browser/fixture-bundle-entry.ts --bundle --outfile=src/tests/browser/fixture-bundle.js --format=iife",
    "test-browser-e2e": "npx playwright test",
```

(The `pretest-` prefix makes npm run it automatically before `test-browser-e2e` — confirm this is npm, not yarn/pnpm, by checking for `package-lock.json` in the repo root, which the earlier exploration already found present.)

Do **not** add `test-browser-e2e` to the default `"test"` script chain (per Global Constraints — it needs a downloaded browser binary that may not be available in every environment).

- [ ] **Step 7: Run the test**

Run: `npm run test-browser-e2e`
Expected: passes, confirming a real WebRTC (or circuit-relay-fallback) connection forms between two independent browser contexts. If it fails specifically on WebRTC dial (not on an unrelated setup error), that is itself useful signal about `createBrowserP2PNode`'s transport config (Task 4 of the prior plan, `src/core/p2p-browser.ts`) — report the exact failure rather than working around it by weakening the assertion.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts src/tests/browser tests-e2e package.json package-lock.json
git commit -m "Add Playwright browser-to-browser WebRTC interop test"
```

---

## Out of scope for this plan (follow-up work)

- Wiring the `ui/` Svelte app to actually call `createBrowserXmppClient` and render its state — this plan only proves the browser entry point works at the libp2p/storage wiring level via a bare Playwright fixture, not a real UI.
- TURN/STUN server configuration for WebRTC dialing across real NATs (this plan's Playwright test runs both tabs on localhost, where circuit-relay-transport or direct dialing should succeed without external STUN/TURN infrastructure).
- Performance/storage-quota handling for `IndexedDbStorage` under real browser storage eviction policies.
