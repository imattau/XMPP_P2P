import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, message: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(message)
}

async function runDiscoTest() {
  console.log('Starting XMPP service discovery verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-disco-'))

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9901)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, { rosterPath: join(workDir, 'node1-roster.json') })

    libp2p2 = await createP2PNode(9902)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, { rosterPath: join(workDir, 'node2-roster.json') })

    await Promise.all([xmppNode1.ready, xmppNode2.ready])
    const node1 = xmppNode1 as XmppNode
    const node2 = xmppNode2 as XmppNode

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]

    if (!node1Address || !node2Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    const capsPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        node2.off('caps:discovered', onCapsDiscovered)
        reject(new Error('Timed out waiting for entity capabilities discovery'))
      }, 10000)

      const onCapsDiscovered = (caps: any) => {
        if (caps?.peerId !== libp2p1.peerId.toString()) {
          return
        }
        clearTimeout(timeout)
        node2.off('caps:discovered', onCapsDiscovered)
        resolve()
      }

      node2.on('caps:discovered', onCapsDiscovered)
    })

    await libp2p2.dial(node1Address)

    console.log('Creating a community collection on Node 1...')
    await node1.createCollection('community-1', 'Community One')
    await node1.addFeedToCollection('community-1', node2Address)

    console.log('Querying disco#info from Node 2 against Node 1...')
    const info = await node2.getDiscoInfo(node1Address)
    const expectedFeatures = [
      'http://jabber.org/protocol/disco#info',
      'http://jabber.org/protocol/disco#items',
      'http://jabber.org/protocol/pubsub#event',
      'urn:xmpp:collection:0',
      'urn:xmpp:feed:0',
      'urn:xmpp:http:upload:0',
      'urn:xmpp:pubsub:account-management:0',
      'urn:xmpp:pubsub:attachments:0',
      'urn:xmpp:pubsub:followers:0'
    ]

    for (const feature of expectedFeatures) {
      if (!info.features.includes(feature)) {
        throw new Error(`Disco info missing feature: ${feature}`)
      }
    }

    console.log('Querying disco#items from Node 2 against Node 1...')
    const rootItems = await node2.getDiscoItems(node1Address)
    if (!rootItems.some(item => item.node === 'community-1')) {
      throw new Error('Disco items did not expose the community collection')
    }

    const collectionInfo = await node2.getDiscoInfo(node1Address, 'community-1')
    if (!collectionInfo.identities.some(identity => identity.category === 'conference')) {
      throw new Error('Collection disco info did not advertise a conference identity')
    }
    if (!collectionInfo.features.includes('urn:xmpp:collection:0')) {
      throw new Error('Collection disco info did not advertise collection support')
    }

    const collectionItems = await node2.getDiscoItems(node1Address, 'community-1')
    if (!collectionItems.some(item => item.jid === `${libp2p2.peerId.toString()}@p2p`)) {
      throw new Error('Collection disco items did not include the attached feed member')
    }

    await capsPromise
    const caps = await node2.getEntityCapabilities(node1Address)
    if (!caps) {
      throw new Error('Entity capabilities were not cached')
    }
    if (!caps.info.features.includes('urn:xmpp:pubsub:attachments:0')) {
      throw new Error('Cached capabilities did not include attachment support')
    }

    console.log('\nDisco Test Results:')
    console.log('  - Disco Info Advertised Expected Features: SUCCESS')
    console.log('  - Disco Items Exposed Community Collections: SUCCESS')
    console.log('  - Collection Disco Info Advertised Conference Identity: SUCCESS')
    console.log('  - Collection Disco Items Exposed Feed Members: SUCCESS')
    console.log('  - Entity Capabilities Cached From Presence: SUCCESS')
    console.log('\n>>> SERVICE DISCOVERY VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runDiscoTest().catch((err) => {
  console.error('Disco test error:', err)
  process.exit(1)
})
