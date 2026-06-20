/**
 * @packageDocumentation End-to-end feed verification script covering Atom helpers,
 * feed subscription delivery, deduplication, malformed payload handling, and
 * persistence across restart.
 */

import assert from 'node:assert/strict'
import { xml } from '@xmpp/xml'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildMicroblogEntry, parseMicroblogEntry } from '../core/xmpp-atom.js'
import { ATOM_XMLNS, MICROBLOG_XMLNS } from '../core/xmpp-discovery.js'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

/**
 * Polls until the supplied condition becomes true or the timeout expires.
 */
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

/**
 * Verifies the Atom helpers produce and parse the expected feed entry shape.
 */
function verifyAtomMicroblogHelpers() {
  const post = {
    id: 'post-1',
    topic: 'xmpp-feed:test-peer',
    from: 'alice@p2p',
    body: 'Hello microblog',
    publishedAt: '2026-06-19T00:00:00.000Z',
    receivedAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
    title: 'Hello microblog',
    summary: 'Hello microblog summary',
    categories: ['news', 'updates'],
    author: 'Alice'
  }

  const entry = buildMicroblogEntry(post, {
    title: post.title,
    summary: post.summary,
    categories: post.categories,
    author: post.author,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt
  })

  assert.equal(entry.attrs.xmlns, ATOM_XMLNS)
  assert.match(entry.toString(), /<title type="text">Hello microblog<\/title>/)
  assert.match(entry.toString(), /<summary type="text">Hello microblog summary<\/summary>/)
  assert.match(entry.toString(), /<category term="news"/)
  assert.match(entry.toString(), /<content type="text">Hello microblog<\/content>/)

  const parsed = parseMicroblogEntry(post.topic, xml('item', { id: post.id }, entry), post.from)
  assert.equal(parsed?.title, post.title)
  assert.equal(parsed?.summary, post.summary)
  assert.deepEqual(parsed?.categories, post.categories)
  assert.equal(parsed?.body, post.body)

  const microblogEntry = xml('entry', { xmlns: MICROBLOG_XMLNS }, xml('title', {}, 'Microblog'))
  const microblogParsed = parseMicroblogEntry(post.topic, xml('item', { id: 'microblog' }, microblogEntry), post.from)
  assert.equal(microblogParsed, undefined)
}

/**
 * Executes the feed verification scenario.
 */
async function runFeedTest() {
  console.log('Starting XMPP feed verification test...\n')
  verifyAtomMicroblogHelpers()

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-feed-'))
  const node1SqlitePath = join(workDir, 'node1-state.sqlite')

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9301)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, new NodeSqliteStorage(node1SqlitePath))

    libp2p2 = await createP2PNode(9302)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'node2-state.sqlite')))

    await xmppNode1.ready
    await xmppNode2.ready

    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    if (!node2Address) {
      throw new Error('Node 2 has no listening addresses')
    }

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    if (!node1Address) {
      throw new Error('Node 1 has no listening addresses')
    }

    console.log(`Node 1 dialing Node 2 at: ${node2Address.toString()}...`)
    await libp2p1.dial(node2Address)

    const expectedTopic = `xmpp-feed:${libp2p1.peerId.toString()}`

    xmppNode2.on('feed:post', (post) => {
      if (post.topic === expectedTopic) {
        console.log(`[Node 2 Feed Event] ${post.id} -> ${post.body}`)
      }
    })

    console.log('Subscribing Node 2 to Node 1 feed...')
    const feedSubscriber = xmppNode2
    const subscription = await feedSubscriber.subscribeFeed(node1Address)
    if (subscription.topic !== expectedTopic) {
      throw new Error(`Unexpected feed topic mapping: expected ${expectedTopic}, got ${subscription.topic}`)
    }

    await waitFor(async () => {
      const subscriptions = await feedSubscriber.getFeedSubscriptions()
      return subscriptions.some(entry => entry.topic === expectedTopic)
    }, 10000, 'Timed out waiting for Node 2 feed subscription to register')

    const pubsub1 = (libp2p1.services as any).pubsub
    const pubsub2 = (libp2p2.services as any).pubsub
    await waitFor(async () => {
      const subscribers1 = pubsub1.getSubscribers(expectedTopic).map((peer: any) => peer.toString())
      const subscribers2 = pubsub2.getSubscribers(expectedTopic).map((peer: any) => peer.toString())
      return (
        subscribers1.includes(libp2p2.peerId.toString()) &&
        subscribers2.includes(libp2p1.peerId.toString())
      )
    }, 10000, `Timed out waiting for gossipsub subscribers on topic "${expectedTopic}"`)

    console.log('Publishing first feed post from Node 1...')
    const itemId = await xmppNode1.publishFeed('Feed delivery verification message')

    await waitFor(async () => {
      const posts = await feedSubscriber.getFeedPosts()
      return posts.some(post => post.id === itemId && post.body === 'Feed delivery verification message')
    }, 10000, 'Timed out waiting for Node 2 to receive the feed post')

    const firstPostCount = (await feedSubscriber.getFeedPosts()).filter(post => post.id === itemId).length

    console.log('Replaying the same feed item to verify deduplication...')
    await xmppNode1.publishFeed('Feed delivery verification message', { itemId })

    await new Promise(resolve => setTimeout(resolve, 2000))

    const postCountAfterDuplicate = (await feedSubscriber.getFeedPosts()).filter(post => post.id === itemId).length
    if (postCountAfterDuplicate !== firstPostCount) {
      throw new Error('Duplicate feed item was not deduplicated deterministically')
    }

    console.log('Sending malformed feed payload to verify parser resilience...')
    await pubsub1.publish(expectedTopic, new TextEncoder().encode('<not-xml'))

    await new Promise(resolve => setTimeout(resolve, 1000))

    const postsBeforeRestart = await xmppNode1.getFeedPosts()
    if (!postsBeforeRestart.some(post => post.id === itemId)) {
      throw new Error('Expected feed post to be cached locally before restart')
    }

    console.log('Verifying feed persistence across restart...')
    await xmppNode1.close()
    await libp2p1.stop()

    const restartedLibp2p1 = await createP2PNode(9301)
    await restartedLibp2p1.start()
    const restartedXmppNode1 = new XmppNode(restartedLibp2p1, new NodeSqliteStorage(node1SqlitePath))
    await restartedXmppNode1.ready

    const persistedPosts = await restartedXmppNode1.getFeedPosts()
    if (!persistedPosts.some(post => post.id === itemId && post.body === 'Feed delivery verification message')) {
      throw new Error('Feed post did not persist across restart')
    }

    await restartedXmppNode1.close()
    await restartedLibp2p1.stop()

    console.log('\nFeed Test Results:')
    console.log('  - Feed Subscription Registered: SUCCESS')
    console.log('  - Feed Delivery Received: SUCCESS')
    console.log('  - Duplicate Feed Item Deduplicated: SUCCESS')
    console.log('  - Malformed Feed Payload Ignored: SUCCESS')
    console.log('  - Feed Persistence Across Restart: SUCCESS')
    console.log('\n>>> FEED VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runFeedTest().catch((err) => {
  console.error('Feed test error:', err)
  process.exit(1)
})
