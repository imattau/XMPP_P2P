# Swappable Transport & Storage for src/core

## Goal

Enable a future browser-only PWA build of the XMPP/P2P node that interoperates with
the existing Node build, without duplicating XMPP/MUC/feed/OMEMO protocol logic.

## Decisions

- Browser peers must interop with Node peers (not an isolated browser-only network).
- Discovery: KadDHT for both builds (already present, `enableDht` option becomes
  always-on rather than optional).
- Browser-to-browser: direct WebRTC connections allowed (not just relay-through-Node).
- Storage: one unified `XmppStorage` interface (records + blobs), not split interfaces.
- No backwards compatibility / migration path required for the Node build's on-disk
  layout — collapsing existing per-concern JSON files into the existing sqlite file
  behind the new interface is acceptable.

## Storage interface

```ts
interface XmppStorage {
  getRecord(namespace: string, key: string): Promise<string | undefined>
  putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void>
  deleteRecord(namespace: string, key: string): Promise<void>
  listRecords(namespace: string): Promise<Array<{ key: string; value: string; updatedAt: string }>>

  getBlob(namespace: string, key: string): Promise<Uint8Array | undefined>
  putBlob(namespace: string, key: string, data: Uint8Array): Promise<void>
  deleteBlob(namespace: string, key: string): Promise<void>
}
```

- `namespace` replaces today's per-concern file paths (roster, feed, muc, vcard,
  omemo-keys, openpgp-keys, uploads-meta, uploads-objects, etc.).
- Records are JSON-serialized strings; callers `JSON.parse`/`stringify`.
- `NodeSqliteStorage` implements this on top of the existing `DatabaseSync` sqlite
  file, replacing `XmppSqliteStore` and the scattered `fs.readFile`/`writeFile` calls
  in `xmpp-persistence.ts`, `xmpp-uploads.ts`, `xmpp-openpgp.ts`,
  `xmpp-omemo-state.ts`, `omemo-runtime.ts`.
- `IndexedDbStorage` implements the same interface for the browser build (one DB,
  one object store for records, one for blobs).

## Transport & discovery

```ts
interface P2PNodeFactory {
  createP2PNode(options: P2PNodeOptions): Promise<Libp2p>
}
```

- Shared base config (both builds): `noise()`, `yamux()`, `identify()`, `gossipsub()`,
  `kadDHT()` (same params as today's `enableDht: true` path; no longer optional).
- `createNodeP2PNode` (replaces `p2p.ts`'s `createP2PNode`): transports
  `tcp() + webSockets()`, discovery `mdns()` + DHT.
- `createBrowserP2PNode` (new): transports `webSockets() + webRTC()` +
  `circuitRelayTransport()` (needed for WebRTC SDP signaling bootstrap), discovery
  DHT only (no mdns — no browser equivalent).
- Browser nodes require at least one configurable bootstrap multiaddr (a known Node
  peer's `/ws` address) to join the DHT initially.
- New deps for browser build only: `@libp2p/webrtc`, `@libp2p/circuit-relay-transport`.
- `xmpp-dht.ts`'s custom validators/selectors for `xmpp` DHT records are unchanged —
  protocol logic, not transport, and already shared.

## Migration impact on src/core

| File | Change |
|---|---|
| `xmpp-sqlite.ts` | Replaced by `storage/node-sqlite-storage.ts` implementing `XmppStorage` |
| `xmpp-persistence.ts` | Drop direct `fs` JSON helpers; use `XmppStorage.getRecord`/`putRecord` |
| `xmpp-uploads.ts` | Drop direct `fs` calls; use `getBlob`/`putBlob`/`getRecord`/`putRecord` |
| `xmpp-openpgp.ts`, `xmpp-omemo-state.ts`, `omemo-runtime.ts` | Drop direct `fs` key-file I/O; keys stored as records (`openpgp-keys`, `omemo-keys` namespaces) |
| `xmpp-node.ts` | Constructor takes `(libp2p, storage: XmppStorage, options)`; remove all `*Path` options and `XMPP_*_PATH` env fallbacks |
| `p2p.ts` | Split into `createNodeP2PNode` + new `createBrowserP2PNode`, sharing `createBaseLibp2pConfig` |
| All other `xmpp-*.ts` (dht, router, feed, muc, collection, roster, atom, pubsub, secure, reliability, discovery, records, stream, vcard, xep-helpers, utils, omemo) | No changes — pure protocol logic, confirms no duplication needed |
| `src/index.ts` | Construct `NodeSqliteStorage` + `createNodeP2PNode()` result, pass both into `XmppNode` |
| New browser entry point (for future PWA work) | Construct `IndexedDbStorage` + `createBrowserP2PNode()` result, same pattern |

## Testing

- Shared contract test suite for `XmppStorage` (record/blob CRUD, namespace
  isolation), run against both `NodeSqliteStorage` and `IndexedDbStorage` (via
  `fake-indexeddb` in the Node test runner).
- Existing tests (`test-sqlite`, `test-feed`, `test-roster`, `test-muc`, etc.) should
  pass unchanged — `XmppNode`'s public behavior doesn't change, only constructor
  signature and internal storage calls.
- New `test-browser-p2p`: verifies a `createBrowserP2PNode()` instance can
  DHT-discover and dial a `createNodeP2PNode()` instance over websockets — the core
  interop claim of this design.
