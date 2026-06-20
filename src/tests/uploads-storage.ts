import assert from 'node:assert/strict'
import { createHash } from 'crypto'
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

  const http = await import('http')
  // Manually register a slot the way createUploadSlot would (testing storage wiring, not slot creation logic)
  ;(manager as any).uploadSlots.set('slot-1', { slotId: 'slot-1', filename: 'a.txt', contentType: 'text/plain', size: 5, createdAt: new Date().toISOString() })

  const payload = Buffer.from('hello')
  await new Promise<void>((resolve, reject) => {
    const req = http.request(`${baseUrl}/upload/slot-1`, { method: 'PUT' }, (res) => {
      res.on('data', () => {})
      res.on('end', resolve)
    })
    req.on('error', reject)
    req.end(payload)
  })

  const cid = createHash('sha256').update(payload).digest('hex')
  const storedBlob = await storage.getBlob('uploads', cid)
  assert.ok(storedBlob, 'uploaded bytes must be stored via XmppStorage.putBlob under namespace "uploads"')
  assert.deepEqual(Array.from(storedBlob as Uint8Array), Array.from(payload))

  const storedMeta = await storage.getRecord('uploads_meta', cid)
  assert.ok(storedMeta, 'upload metadata must be stored via XmppStorage.putRecord under namespace "uploads_meta"')

  await manager.close()

  console.log('XmppUploadManager XmppStorage migration test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
