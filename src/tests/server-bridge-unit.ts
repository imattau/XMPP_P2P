import assert from 'node:assert/strict'
import { XmppServerBridge } from '../core/xmpp-server-bridge.js'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'

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
    const map = this.records.get(namespace)
    if (!map) return []
    return Array.from(map.entries()).map(([key, val]) => ({ key, value: val.value, updatedAt: val.updatedAt }))
  }

  async getBlob(_namespace: string, _key: string): Promise<Uint8Array | undefined> { return undefined }
  async putBlob(_namespace: string, _key: string, _data: Uint8Array): Promise<void> {}
  async deleteBlob(_namespace: string, _key: string): Promise<void> {}
  async close(): Promise<void> {}
}

async function run() {
  console.log('Starting server bridge unit tests...\n')

  const storage = new FakeStorage()
  const bridge = new XmppServerBridge(storage as XmppStorage, 'test-passphrase')

  // 1. isFederatedJid
  console.log('  Testing isFederatedJid...')
  assert.ok(bridge.isFederatedJid('user@jabber.org'), 'user@jabber.org should be federated')
  assert.ok(bridge.isFederatedJid('user@server.com'), 'user@server.com should be federated')
  assert.ok(!bridge.isFederatedJid('user@p2p'), 'user@p2p should NOT be federated')
  assert.ok(!bridge.isFederatedJid('barepeerid'), 'bare peer ID should NOT be federated')
  assert.ok(!bridge.isFederatedJid(''), 'empty string should NOT be federated')

  // 2. Feed bridge mapping
  console.log('  Testing feed bridge mapping...')
  await bridge.setFeedBridge('xmpp-feed:testPeer', 'urn:xmpp:microblog:0')
  assert.equal(bridge.getFeedBridge('xmpp-feed:testPeer'), 'urn:xmpp:microblog:0')
  assert.equal(bridge.getPubsubFeedBridge('urn:xmpp:microblog:0'), 'xmpp-feed:testPeer')

  let feedBridges = bridge.getAllFeedBridges()
  assert.equal(feedBridges.length, 1)
  assert.equal(feedBridges[0].feedTopic, 'xmpp-feed:testPeer')
  assert.equal(feedBridges[0].pubsubNode, 'urn:xmpp:microblog:0')

  await bridge.removeFeedBridge('xmpp-feed:testPeer')
  assert.equal(bridge.getFeedBridge('xmpp-feed:testPeer'), undefined)
  assert.equal(bridge.getPubsubFeedBridge('urn:xmpp:microblog:0'), undefined)
  assert.equal(bridge.getAllFeedBridges().length, 0)

  // 3. MUC bridge mapping
  console.log('  Testing MUC bridge mapping...')
  await bridge.setMucBridge('room@conference.server', 'myroom')
  assert.equal(bridge.getMucBridge('room@conference.server'), 'myroom')

  let mucBridges = bridge.getAllMucBridges()
  assert.equal(mucBridges.length, 1)
  assert.equal(mucBridges[0].serverRoom, 'room@conference.server')
  assert.equal(mucBridges[0].p2pRoom, 'myroom')

  await bridge.removeMucBridge('room@conference.server')
  assert.equal(bridge.getMucBridge('room@conference.server'), undefined)
  assert.equal(bridge.getAllMucBridges().length, 0)

  // 4. Connection info (no component, no S2S)
  console.log('  Testing connection info...')
  assert.equal(bridge.getConnectionInfo().length, 0)

  // 5. IQ error when no connection configured
  console.log('  Testing IQ error handling...')
  try {
    await bridge.discoInfo('example.com')
    assert.fail('Should have thrown without component or S2S')
  } catch (err: any) {
    assert.ok(err.message.includes('No federation connection'), `Expected connection error, got: ${err.message}`)
  }

  // 6. S2S domain
  console.log('  Testing S2S domain...')
  bridge.setS2SDomain('my-node.p2p')
  assert.equal(bridge.getS2SDomain(), 'my-node.p2p')
  let infos = bridge.getConnectionInfo()
  assert.equal(infos.length, 1)
  assert.equal(infos[0].type, 's2s')
  assert.equal(infos[0].domain, 'my-node.p2p')

  bridge.setS2SDomain('other-node.p2p')
  assert.equal(bridge.getS2SDomain(), 'other-node.p2p')

  // Reset S2S domain to avoid side effects
  bridge.setS2SDomain('')

  // 7. Component config store
  console.log('  Testing component config store...')
  const config = bridge.configStore
  await config.save('p2p.test.com', 'secret123', 'xmpp.test.com', 5347)
  const loaded = await config.load('p2p.test.com')
  assert.ok(loaded !== undefined)
  assert.equal(loaded.secret, 'secret123')
  assert.equal(loaded.host, 'xmpp.test.com')
  assert.equal(loaded.port, 5347)

  const list = await config.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].domain, 'p2p.test.com')

  await config.remove('p2p.test.com')
  assert.equal(await config.load('p2p.test.com'), undefined)
  assert.equal((await config.list()).length, 0)

  console.log('\n>>> ALL SERVER BRIDGE UNIT TESTS PASSED <<<')
  process.exit(0)
}

run().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
