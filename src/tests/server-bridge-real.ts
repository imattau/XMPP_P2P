import assert from 'node:assert/strict'
import { XmppServerBridge } from '../core/xmpp-server-bridge.js'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'

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
    const map = this.records.get(namespace)
    if (!map) return []
    return Array.from(map.entries()).map(([key, val]) => ({ key, value: val.value, updatedAt: val.updatedAt }))
  }
  async getBlob(_namespace: string, _key: string): Promise<Uint8Array | undefined> { return undefined }
  async putBlob(_namespace: string, _key: string, _data: Uint8Array): Promise<void> {}
  async deleteBlob(_namespace: string, _key: string): Promise<void> {}
  async close(): Promise<void> {}
}

function waitForEvent(emitter: XmppServerBridge, event: string, predicate: (data: any) => boolean, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off(event, handler)
      reject(new Error(`Timed out waiting for event "${event}"`))
    }, timeoutMs)
    const handler = (data: any) => {
      if (predicate(data)) {
        clearTimeout(timer)
        emitter.off(event, handler)
        resolve(data)
      }
    }
    emitter.on(event, handler)
  })
}

const ENV_HOST = process.env.XMPP_SERVER_HOST
const ENV_PORT = process.env.XMPP_SERVER_PORT ? Number(process.env.XMPP_SERVER_PORT) : undefined
const ENV_SECRET = process.env.XMPP_COMPONENT_SECRET
const ENV_DOMAIN = process.env.XMPP_COMPONENT_DOMAIN

async function run() {
  if (!ENV_HOST || !ENV_PORT || !ENV_SECRET || !ENV_DOMAIN) {
    console.log('')
    console.log('================================================================')
    console.log('  SKIPPED: Real XMPP server integration test')
    console.log('  Set these env vars to run:')
    console.log('    XMPP_SERVER_HOST       (e.g. "xmpp.example.com")')
    console.log('    XMPP_SERVER_PORT       (e.g. "5347")')
    console.log('    XMPP_COMPONENT_SECRET  (component secret)')
    console.log('    XMPP_COMPONENT_DOMAIN  (e.g. "p2p.example.com")')
    console.log('================================================================')
    console.log('')
    process.exit(0)
  }

  console.log('Starting real XMPP server integration test...\n')
  console.log(`  Server: ${ENV_HOST}:${ENV_PORT}`)
  console.log(`  Domain: ${ENV_DOMAIN}`)
  console.log('')

  const storage = new FakeStorage()
  const bridge = new XmppServerBridge(storage, 'test-passphrase')

  const events: any[] = []
  bridge.on('connection', (info: any) => events.push({ type: 'connection', info }))
  bridge.on('message', (msg: any) => events.push({ type: 'message', msg }))
  bridge.on('presence', (p: any) => events.push({ type: 'presence', presence: p }))
  bridge.on('pubsub:event', (evt: any) => events.push({ type: 'pubsub:event', evt }))
  bridge.on('muc:message', (msg: any) => events.push({ type: 'muc:message', msg }))

  try {
    // ── 1. Connect ──
    console.log('━━━ 1. Component connection ━━━')
    await bridge.connectComponent(ENV_HOST, ENV_PORT, ENV_SECRET, ENV_DOMAIN)
    const infos = bridge.getConnectionInfo()
    assert.equal(infos.length, 1)
    assert.equal(infos[0].type, 'component')
    assert.equal(infos[0].domain, ENV_DOMAIN)
    assert.equal(infos[0].status, 'connected')
    console.log('  PASS: Component connected successfully\n')

    // ── 2. Disco#info on component domain (self) ──
    console.log('━━━ 2. Disco#info on own component domain ━━━')
    const selfDisco = await bridge.discoInfo(ENV_DOMAIN)
    assert.ok(Array.isArray(selfDisco.identities))
    assert.ok(Array.isArray(selfDisco.features))
    assert.ok(selfDisco.identities.length > 0)
    assert.ok(selfDisco.features.length > 0)
    console.log(`  Identities: ${selfDisco.identities.length}, Features: ${selfDisco.features.length}`)
    console.log(`  Sample: ${selfDisco.features.slice(0, 4).join(', ')}`)
    console.log('  PASS: disco#info on self works\n')

    // ── 3. Disco#info on server domain ──
    console.log('━━━ 3. Disco#info on server domain ━━━')
    const serverDomain = 'localhost'
    const serverDisco = await bridge.discoInfo(serverDomain)
    assert.ok(serverDisco.identities.length > 0, 'Server should advertise identities')
    assert.ok(serverDisco.features.length > 0, 'Server should advertise features')
    console.log(`  Server: ${serverDomain}`)
    console.log(`  Identities: ${serverDisco.identities.map((i: any) => `${i.category}/${i.type}`).join(', ')}`)
    console.log(`  Features include pubsub: ${serverDisco.features.some((f: string) => f.includes('pubsub'))}`)
    console.log('  PASS: disco#info on server works\n')

    // ── 4. Disco#items on server (list components) ──
    console.log('━━━ 4. Disco#items on server (component listing) ━━━')
    const items = await bridge.discoItems(serverDomain)
    assert.ok(items.items.length > 0, 'Server should list at least one item')
    console.log(`  Items found: ${items.items.length}`)
    for (const item of items.items) {
      console.log(`    ${item.jid}${item.name ? ` (${item.name})` : ''}`)
    }
    const mucComponent = items.items.find((i: any) => i.jid === 'conference.localhost')
    assert.ok(mucComponent, 'Server disco items should include conference.localhost')
    console.log('  PASS: disco#items on server works\n')

    // ── 5. Send a chat message ──
    console.log('━━━ 5. Send chat message ─━━')
    const msgId = await bridge.sendMessage('user@localhost', 'Hello from P2P component!', undefined, 'bot')
    assert.ok(msgId, 'sendMessage should return a message ID')
    console.log(`  Sent message id=${msgId} to user@localhost`)
    console.log('  PASS: Chat message sent without error\n')

    // ── 6. Presence: join MUC triggers presence from room ──
    // Presence is covered in the MUC section below via the room join presence.
    console.log('━━━ 6. (covered by MUC presence below) ━━━\n')

    // ── 7. MUC operations ──
    console.log('━━━ 7. MUC join and message ━━━')
    const mucServer = 'conference.localhost'
    const roomName = `testroom-${Date.now()}`
    const roomJid = `${roomName}@${mucServer}`

    // Join the MUC room
    await bridge.joinMuc(roomJid, 'p2p-bot', 'bot')
    console.log(`  Joined MUC room: ${roomJid}`)

    // Wait for a presence from the room confirming join
    const presenceEvent = await waitForEvent(bridge, 'presence', (p: any) =>
      p.from && p.from.includes(roomJid)
    )
    assert.ok(presenceEvent, 'Should receive presence from MUC room after join')
    console.log(`  Received room presence from: ${presenceEvent.from}`)

    // Send a groupchat message to the room
    const mucMsgId = await bridge.sendMucMessage(roomJid, 'Hello from P2P component!', 'bot')
    assert.ok(mucMsgId, 'sendMucMessage should return a message ID')
    console.log(`  Sent MUC message id=${mucMsgId}`)

    // Leave the room
    await bridge.leaveMuc(roomJid, 'bot')
    console.log('  Left MUC room')
    console.log('  PASS: MUC join, message, and leave work\n')

    // ── 8. Service discovery on MUC component ──
    console.log('━━━ 8. Disco#info on MUC component ━━━')
    const mucDisco = await bridge.discoInfo(mucServer)
    assert.ok(mucDisco.identities.length > 0)
    const mucIdentity = mucDisco.identities.find((i: any) => i.category === 'conference')
    assert.ok(mucIdentity, 'MUC component should advertise conference identity')
    console.log(`  Identity: ${mucDisco.identities.map((i: any) => `${i.category}/${i.type}`).join(', ')}`)
    console.log('  PASS: MUC component disco#info works\n')

    // ── 9. Verify connection events ──
    console.log('━━━ 9. Connection lifecycle events ━━━')
    const connectionEvents = events.filter(e => e.type === 'connection')
    assert.ok(connectionEvents.length > 0)
    const connectedEvent = connectionEvents.find((e: any) => e.info.status === 'connected')
    assert.ok(connectedEvent)
    console.log(`  Total connection events: ${connectionEvents.length}`)
    console.log(`  Status transitions: ${connectionEvents.map((e: any) => e.info.status).join(' -> ')}`)
    console.log('  PASS: Connection events verified\n')

    // ── 10. Disconnect ──
    console.log('━━━ 10. Disconnect ━━━')
    await bridge.disconnectComponent()
    const postInfos = bridge.getConnectionInfo()
    assert.equal(postInfos.length, 0)
    console.log('  PASS: Disconnect verified\n')

    console.log('>>> ALL REAL XMPP SERVER INTEGRATION TESTS PASSED <<<')
    process.exit(0)
  } catch (err) {
    console.error('Test error:', err)
    process.exit(1)
  } finally {
    if (bridge.isComponentConnected()) {
      await bridge.disconnectComponent().catch(() => {})
    }
  }
}

run().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
