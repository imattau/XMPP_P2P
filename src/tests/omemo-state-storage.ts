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
