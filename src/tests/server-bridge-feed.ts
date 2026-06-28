import assert from 'node:assert/strict'
import { join } from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

async function run() {
  console.log('Starting server bridge feed integration test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'bridge-feed-test-'))

  let libp2p1: any
  let node1: XmppNode

  try {
    // Create a real P2P node
    console.log('  Creating libp2p node...')
    libp2p1 = await createP2PNode(9601, { host: '127.0.0.1', enableMdns: false, enableDht: false })
    await libp2p1.start()

    const dbPath = join(workDir, 'node1.sqlite')
    node1 = new XmppNode(libp2p1, new NodeSqliteStorage(dbPath))
    await node1.ready
    console.log('  XmppNode ready')

    // 1. Feed bridge configuration
    console.log('  Testing feed bridge config...')
    await node1.setFeedBridge('xmpp-feed:peer1', 'urn:xmpp:microblog:0')
    const feedBridge = node1.getFeedBridge('xmpp-feed:peer1')
    assert.equal(feedBridge, 'urn:xmpp:microblog:0')

    const feedBridges = node1.getAllFeedBridges()
    assert.equal(feedBridges.length, 1)
    assert.equal(feedBridges[0].feedTopic, 'xmpp-feed:peer1')
    assert.equal(feedBridges[0].pubsubNode, 'urn:xmpp:microblog:0')
    console.log('  Feed bridge config works')

    // 2. Multiple feed bridges
    console.log('  Testing multiple feed bridges...')
    await node1.setFeedBridge('xmpp-feed:peer2', 'urn:xmpp:microblog:1')
    const allBridges = node1.getAllFeedBridges()
    assert.equal(allBridges.length, 2)
    console.log('  Multiple feed bridges work')

    // 3. Remove feed bridge
    console.log('  Testing feed bridge removal...')
    await node1.removeFeedBridge('xmpp-feed:peer1')
    assert.equal(node1.getFeedBridge('xmpp-feed:peer1'), undefined)
    assert.equal(node1.getFeedBridge('xmpp-feed:peer2'), 'urn:xmpp:microblog:1')
    assert.equal(node1.getAllFeedBridges().length, 1)
    console.log('  Feed bridge removal works')

    // Clean up remaining
    await node1.removeFeedBridge('xmpp-feed:peer2')

    // 4. MUC bridge configuration
    console.log('  Testing MUC bridge config...')
    await node1.setMucBridge('room@conference.jabber.org', 'my-p2p-room')
    const mucBridge = node1.getMucBridge('room@conference.jabber.org')
    assert.equal(mucBridge, 'my-p2p-room')

    const mucBridges = node1.getAllMucBridges()
    assert.equal(mucBridges.length, 1)
    assert.equal(mucBridges[0].serverRoom, 'room@conference.jabber.org')
    assert.equal(mucBridges[0].p2pRoom, 'my-p2p-room')
    console.log('  MUC bridge config works')

    // 5. Remove MUC bridge
    console.log('  Testing MUC bridge removal...')
    await node1.removeMucBridge('room@conference.jabber.org')
    assert.equal(node1.getMucBridge('room@conference.jabber.org'), undefined)
    assert.equal(node1.getAllMucBridges().length, 0)
    console.log('  MUC bridge removal works')

    // 6. Federated JID detection
    console.log('  Testing federated JID detection...')
    assert.ok(node1.isFederatedJid('user@jabber.org'))
    assert.ok(!node1.isFederatedJid('user@p2p'))
    assert.ok(!node1.isFederatedJid(''))  // Must be non-empty
    assert.ok(!node1.isFederatedJid('barepeerid'))
    console.log('  Federated JID detection works')

    // 7. Server connections (should be 0 since no component/S2S)
    console.log('  Testing server connections...')
    const connections = node1.getServerConnections()
    assert.equal(connections.length, 0)
    console.log('  Server connections empty (expected - no component)')

    // 8. Component connected check
    console.log('  Testing component connected...')
    assert.ok(!node1.isComponentConnected())
    console.log('  Component not connected (expected)')

    // Cleanup
    await node1.close()
    await libp2p1.stop()

    console.log('\n>>> ALL FEED BRIDGE INTEGRATION TESTS PASSED <<<')
    process.exit(0)
  } catch (err) {
    console.error('Test error:', err)
    process.exit(1)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

run().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
