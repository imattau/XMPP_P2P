import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

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

async function runCollectionTest() {
  console.log('Starting XMPP collection verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-collection-'))
  const node3SqlitePath = join(workDir, 'node3-state.sqlite')

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined
  let libp2p3: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode3: XmppNode | undefined
  let libp2p4: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode4: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9401)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, new NodeSqliteStorage(join(workDir, 'node1-state.sqlite')))

    libp2p2 = await createP2PNode(9402)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'node2-state.sqlite')))

    libp2p3 = await createP2PNode(9403)
    await libp2p3.start()
    xmppNode3 = new XmppNode(libp2p3, new NodeSqliteStorage(node3SqlitePath))

    libp2p4 = await createP2PNode(9404)
    await libp2p4.start()
    xmppNode4 = new XmppNode(libp2p4, new NodeSqliteStorage(join(workDir, 'node4-state.sqlite')))

    await Promise.all([
      xmppNode1.ready,
      xmppNode2.ready,
      xmppNode3.ready,
      xmppNode4.ready
    ])

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    const node3Address = libp2p3.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p3.getMultiaddrs()[0]

    if (!node1Address || !node2Address || !node3Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    console.log(`Node 3 dialing Node 1 at: ${node1Address.toString()}...`)
    await libp2p3.dial(node1Address)
    console.log(`Node 3 dialing Node 2 at: ${node2Address.toString()}...`)
    await libp2p3.dial(node2Address)
    console.log(`Node 4 dialing Node 3 at: ${node3Address.toString()}...`)
    await libp2p4.dial(node3Address)

    const collectionId = 'garden'
    const collectionTopic = `xmpp-collection:${collectionId}`

    console.log('Creating collection on Node 3 and attaching two user feeds...')
    await xmppNode3.createCollection(collectionId, 'Garden Club')
    await xmppNode3.addFeedToCollection(collectionId, node1Address)
    await xmppNode3.addFeedToCollection(collectionId, node2Address)

    console.log('Subscribing Node 4 to the community collection...')
    await xmppNode4.subscribeCollection(collectionId)

    const pubsub1 = (libp2p1.services as any).pubsub
    const pubsub2 = (libp2p2.services as any).pubsub
    const pubsub3 = (libp2p3.services as any).pubsub
    const pubsub4 = (libp2p4.services as any).pubsub
    await waitFor(async () => {
      const feedSubscribers1 = pubsub1.getSubscribers(`xmpp-feed:${libp2p1.peerId.toString()}`).map((peer: any) => peer.toString())
      const feedSubscribers2 = pubsub2.getSubscribers(`xmpp-feed:${libp2p2.peerId.toString()}`).map((peer: any) => peer.toString())
      const feedSubscribers3 = pubsub3.getSubscribers(`xmpp-feed:${libp2p1.peerId.toString()}`).map((peer: any) => peer.toString())
      const feedSubscribers4 = pubsub3.getSubscribers(`xmpp-feed:${libp2p2.peerId.toString()}`).map((peer: any) => peer.toString())
      const subscribers3 = pubsub3.getSubscribers(collectionTopic).map((peer: any) => peer.toString())
      const subscribers4 = pubsub4.getSubscribers(collectionTopic).map((peer: any) => peer.toString())
      return (
        feedSubscribers1.includes(libp2p3.peerId.toString()) &&
        feedSubscribers2.includes(libp2p3.peerId.toString()) &&
        feedSubscribers3.includes(libp2p1.peerId.toString()) &&
        feedSubscribers4.includes(libp2p2.peerId.toString()) &&
        subscribers3.includes(libp2p4.peerId.toString()) &&
        subscribers4.includes(libp2p3.peerId.toString())
      )
    }, 10000, 'Timed out waiting for feed and collection subscriber propagation')

    console.log('Publishing posts from both source feeds...')
    const sourcePost1 = await xmppNode1.publishFeed('A note from source feed one')
    const sourcePost2 = await xmppNode2.publishFeed('A note from source feed two')
    const collectionSubscriber = xmppNode4
    const collectionHost = xmppNode3

    await waitFor(async () => {
      const hostFeedPosts = await collectionHost.getFeedPosts()
      return hostFeedPosts.some(post => post.id === sourcePost1) && hostFeedPosts.some(post => post.id === sourcePost2)
    }, 10000, 'Timed out waiting for the collection host to receive both feed posts')

    await waitFor(async () => {
      const posts = await collectionSubscriber.getCollectionPosts(collectionId)
      return posts.some(post => post.sourceTopic === `xmpp-feed:${libp2p1.peerId.toString()}` && post.body === 'A note from source feed one') &&
        posts.some(post => post.sourceTopic === `xmpp-feed:${libp2p2.peerId.toString()}` && post.body === 'A note from source feed two')
    }, 10000, 'Timed out waiting for Node 4 to receive aggregated collection posts')

    const node3Posts = await xmppNode3.getCollectionPosts(collectionId)
    const node4Posts = await collectionSubscriber.getCollectionPosts(collectionId)
    if (node3Posts.length < 2 || node4Posts.length < 2) {
      throw new Error('Expected both the collection host and subscriber to retain the aggregated posts')
    }

    console.log('Verifying collection persistence across restart...')
    await xmppNode3.close()
    await libp2p3.stop()

    const restartedLibp2p3 = await createP2PNode(9403)
    await restartedLibp2p3.start()
    const restartedXmppNode3 = new XmppNode(restartedLibp2p3, new NodeSqliteStorage(node3SqlitePath))
    await restartedXmppNode3.ready

    const persistedCollections = await restartedXmppNode3.getCollections()
    const persistedCollection = persistedCollections.find(collection => collection.id === collectionId)
    if (!persistedCollection || persistedCollection.members.length !== 2) {
      throw new Error('Collection membership did not persist across restart')
    }

    const persistedPosts = await restartedXmppNode3.getCollectionPosts(collectionId)
    if (!persistedPosts.some(post => post.id === `${collectionId}:${sourcePost1}`) || !persistedPosts.some(post => post.id === `${collectionId}:${sourcePost2}`)) {
      throw new Error('Collection history did not persist across restart')
    }

    await restartedXmppNode3.close()
    await restartedLibp2p3.stop()

    console.log('\nCollection Test Results:')
    console.log('  - Collection Subscribers Reached: SUCCESS')
    console.log('  - Multi-Feed Aggregation Delivered: SUCCESS')
    console.log('  - Collection Membership Persisted: SUCCESS')
    console.log('  - Collection History Persisted: SUCCESS')
    console.log('\n>>> COLLECTION VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await xmppNode3?.close().catch(() => {})
    await xmppNode4?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await libp2p3?.stop().catch(() => {})
    await libp2p4?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runCollectionTest().catch((err) => {
  console.error('Collection test error:', err)
  process.exit(1)
})
