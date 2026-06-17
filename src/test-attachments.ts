import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from './p2p.js'
import { XmppNode } from './xmpp-node.js'

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

async function runAttachmentTest() {
  console.log('Starting XMPP attachment verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-attachments-'))
  const node1FeedPath = join(workDir, 'node1-feed.json')
  const node1AttachmentPath = join(workDir, 'node1-attachments.json')
  const node2FeedPath = join(workDir, 'node2-feed.json')
  const node2AttachmentPath = join(workDir, 'node2-attachments.json')

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9501)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, { feedPath: node1FeedPath, attachmentPath: node1AttachmentPath })

    libp2p2 = await createP2PNode(9502)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, { feedPath: node2FeedPath, attachmentPath: node2AttachmentPath })

    await Promise.all([
      xmppNode1.ready,
      xmppNode2.ready
    ])

    const node1 = xmppNode1 as XmppNode
    const node2 = xmppNode2 as XmppNode

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]

    if (!node1Address || !node2Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    console.log(`Node 1 dialing Node 2 at: ${node2Address.toString()}...`)
    await libp2p1.dial(node2Address)

    const expectedTopic = `xmpp-feed:${libp2p1.peerId.toString()}`

    console.log('Subscribing Node 2 to Node 1 feed...')
    await node2.subscribeFeed(node1Address)

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

    console.log('Publishing feed item from Node 1...')
    const itemId = await node1.publishFeed('Attachment target post')

    await waitFor(async () => {
      const posts = await node2.getFeedPosts()
      return posts.some(post => post.id === itemId && post.body === 'Attachment target post')
    }, 10000, 'Timed out waiting for Node 2 to receive the feed post')

    console.log('Publishing noticed attachment from Node 2...')
    await node2.notice(expectedTopic, itemId, 'Seen')

    await waitFor(async () => {
      const attachments = await node1.getAttachments(expectedTopic, itemId)
      return attachments.length === 1 && attachments[0].kind === 'noticed' && attachments[0].value === 'Seen'
    }, 10000, 'Timed out waiting for noticed attachment delivery')

    let summaries = await node1.getAttachmentSummaries(expectedTopic)
    let summary = summaries.find(entry => entry.targetId === itemId)
    if (!summary || summary.total !== 1 || summary.noticed !== 1 || summary.reactions !== 0) {
      throw new Error('Noticed attachment summary did not match expected counts')
    }

    console.log('Replacing notice with a reaction from the same JID...')
    await node2.react(expectedTopic, itemId, '❤️')

    await waitFor(async () => {
      const attachments = await node1.getAttachments(expectedTopic, itemId)
      return attachments.length === 1 && attachments[0].kind === 'reaction' && attachments[0].value === '❤️'
    }, 10000, 'Timed out waiting for reaction replacement delivery')

    summaries = await node1.getAttachmentSummaries(expectedTopic)
    summary = summaries.find(entry => entry.targetId === itemId)
    if (!summary || summary.total !== 1 || summary.noticed !== 0 || summary.reactions !== 1 || summary.reactionCounts['❤️'] !== 1) {
      throw new Error('Reaction summary did not reflect one attachment per JID')
    }

    console.log('Sending malformed attachment payload to verify parser resilience...')
    await pubsub1.publish(expectedTopic, new TextEncoder().encode('<not-xml'))
    await new Promise(resolve => setTimeout(resolve, 1000))

    const attachmentsBeforeRestart = await node1.getAttachments(expectedTopic, itemId)
    if (attachmentsBeforeRestart.length !== 1) {
      throw new Error('Expected attachment cache to contain exactly one replacement entry before restart')
    }

    console.log('Verifying attachment persistence across restart...')
    await node1.close()
    await libp2p1.stop()

    const restartedLibp2p1 = await createP2PNode(9501)
    await restartedLibp2p1.start()
    const restartedXmppNode1 = new XmppNode(restartedLibp2p1, { feedPath: node1FeedPath, attachmentPath: node1AttachmentPath })
    await restartedXmppNode1.ready

    const persistedAttachments = await restartedXmppNode1.getAttachments(expectedTopic, itemId)
    if (persistedAttachments.length !== 1 || persistedAttachments[0].kind !== 'reaction' || persistedAttachments[0].value !== '❤️') {
      throw new Error('Attachment history did not persist across restart')
    }

    const persistedSummaries = await restartedXmppNode1.getAttachmentSummaries(expectedTopic)
    const persistedSummary = persistedSummaries.find(entry => entry.targetId === itemId)
    if (!persistedSummary || persistedSummary.total !== 1 || persistedSummary.reactions !== 1) {
      throw new Error('Attachment summary did not persist across restart')
    }

    await restartedXmppNode1.close()
    await restartedLibp2p1.stop()

    console.log('\nAttachment Test Results:')
    console.log('  - Noticed Attachment Delivered: SUCCESS')
    console.log('  - Reaction Replacement Enforced: SUCCESS')
    console.log('  - Attachment Summary Counts Correct: SUCCESS')
    console.log('  - Malformed Attachment Payload Ignored: SUCCESS')
    console.log('  - Attachment Persistence Across Restart: SUCCESS')
    console.log('\n>>> ATTACHMENT VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runAttachmentTest().catch((err) => {
  console.error('Attachment test error:', err)
  process.exit(1)
})
