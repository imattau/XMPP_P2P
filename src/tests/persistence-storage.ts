/**
 * @fileoverview Persistence smoke test covering roster state round-tripping
 * through the storage abstraction.
 */

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
  return {
    jid: entry.jid,
    name: entry.name,
    subscription: entry.subscription ?? 'none',
    groups: entry.groups ?? [],
    updatedAt: entry.updatedAt ?? new Date().toISOString()
  }
}

/**
 * Executes the persistence round-trip verification script.
 */
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
