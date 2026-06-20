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
