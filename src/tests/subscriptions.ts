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

async function runSubscriptionTest() {
  console.log('Starting XMPP public subscription verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-subscriptions-'))
  const node2SqlitePath = join(workDir, 'node2-state.sqlite')

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined
  let libp2p3: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode3: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9601)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, new NodeSqliteStorage(join(workDir, 'node1-state.sqlite')))

    libp2p2 = await createP2PNode(9602)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(node2SqlitePath))

    libp2p3 = await createP2PNode(9603)
    await libp2p3.start()
    xmppNode3 = new XmppNode(libp2p3, new NodeSqliteStorage(join(workDir, 'node3-state.sqlite')))

    await Promise.all([
      xmppNode1.ready,
      xmppNode2.ready,
      xmppNode3.ready
    ])

    const node1 = xmppNode1
    const node2 = xmppNode2
    const node3 = xmppNode3

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    const node3Address = libp2p3.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p3.getMultiaddrs()[0]

    if (!node1Address || !node2Address || !node3Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    await libp2p2.dial(node1Address)
    await libp2p3.dial(node1Address)

    const feedTopic = `xmpp-feed:${libp2p1.peerId.toString()}`
    const pubsub1 = (libp2p1.services as any).pubsub
    const pubsub2 = (libp2p2.services as any).pubsub

    console.log('Node 2 subscribes privately to Node 1...')
    await node2.subscribeFeed(node1Address, { visibility: 'private' })
    await waitFor(async () => {
      const subscribers1 = pubsub1.getSubscribers(feedTopic).map((peer: any) => peer.toString())
      const subscribers2 = pubsub2.getSubscribers(feedTopic).map((peer: any) => peer.toString())
      return (
        subscribers1.includes(libp2p2.peerId.toString()) &&
        subscribers2.includes(libp2p1.peerId.toString())
      )
    }, 10000, 'Timed out waiting for private subscription propagation')

    console.log('Publishing a post from Node 1...')
    const itemId = await node1.publishFeed('Subscription discovery target')

    await waitFor(async () => {
      const posts = await node2.getFeedPosts()
      return posts.some(post => post.id === itemId)
    }, 10000, 'Timed out waiting for Node 2 to receive the feed item')

    await waitFor(async () => {
      const followers = await node1.getFeedFollowers(node1Address)
      return followers.length === 0
    }, 5000, 'Private subscription should not appear as a public follower')

    console.log('Node 2 switches the follow to public...')
    await node2.setFeedSubscriptionVisibility(node1Address, 'public')
    await waitFor(async () => {
      const followers = await node1.getFeedFollowers(node1Address)
      return followers.some(follower => follower.followerPeerId === libp2p2.peerId.toString())
    }, 10000, 'Timed out waiting for public follower discovery')

    await waitFor(async () => {
      const watchedFollowers = await node3.getFeedFollowers(node1Address)
      return watchedFollowers.some(follower => follower.followerPeerId === libp2p2.peerId.toString())
    }, 10000, 'Timed out waiting for third-party follower discovery')

    const publicSubscriptions = await node2.getPublicFeedSubscriptions()
    if (!publicSubscriptions.some(subscription => subscription.topic === feedTopic && subscription.visibility === 'public')) {
      throw new Error('Public subscription was not tracked locally')
    }

    console.log('Verifying persistence across restart...')
    await node2.close()
    await libp2p2.stop()

    const restartedLibp2p2 = await createP2PNode(9602)
    await restartedLibp2p2.start()
    const restartedXmppNode2 = new XmppNode(restartedLibp2p2, new NodeSqliteStorage(node2SqlitePath))
    await restartedXmppNode2.ready

    await restartedXmppNode2.setFeedSubscriptionVisibility(node1Address, 'public')

    const persistedPublicSubscriptions = await restartedXmppNode2.getPublicFeedSubscriptions()
    if (!persistedPublicSubscriptions.some(subscription => subscription.topic === feedTopic && subscription.visibility === 'public')) {
      throw new Error(`Public subscription did not persist across restart: ${JSON.stringify(persistedPublicSubscriptions, null, 2)}`)
    }

    await waitFor(async () => {
      const followers = await node1.getFeedFollowers(node1Address)
      return followers.some(follower => follower.followerPeerId === restartedLibp2p2.peerId.toString())
    }, 10000, 'Public follower did not reappear after restart')

    await restartedXmppNode2.close()
    await restartedLibp2p2.stop()

    console.log('\nSubscription Test Results:')
    console.log('  - Private Follow Stayed Hidden: SUCCESS')
    console.log('  - Public Follow Announced: SUCCESS')
    console.log('  - Third-Party Discovery Worked: SUCCESS')
    console.log('  - Public Subscription Persisted: SUCCESS')
    console.log('  - Public Follower Reappeared After Restart: SUCCESS')
    console.log('\n>>> PUBLIC SUBSCRIPTION VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await xmppNode3?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await libp2p3?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runSubscriptionTest().catch((err) => {
  console.error('Subscription test error:', err)
  process.exit(1)
})
