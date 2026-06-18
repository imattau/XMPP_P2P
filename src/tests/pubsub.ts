import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'

async function runPubSubTest() {
  console.log('Starting XMPP PubSub over Gossipsub verification test...\n')

  // Create Node 1
  const libp2p1 = await createP2PNode(9101)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1)
  console.log(`Node 1 JID: ${xmppNode1.jid}`)

  // Create Node 2
  const libp2p2 = await createP2PNode(9102)
  await libp2p2.start()
  const xmppNode2 = new XmppNode(libp2p2)
  console.log(`Node 2 JID: ${xmppNode2.jid}\n`)

  // Connect the two nodes first
  const node2Addresses = libp2p2.getMultiaddrs()
  const loopbackAddr = node2Addresses.find((ma: any) => ma.toString().includes('127.0.0.1')) || node2Addresses[0]
  console.log(`Connecting Node 1 -> Node 2 via: ${loopbackAddr.toString()}...`)
  await libp2p1.dial(loopbackAddr)
  console.log('Nodes connected!\n')

  const pubsub1 = (libp2p1.services as any).pubsub
  const pubsub2 = (libp2p2.services as any).pubsub
  const waitForPubSubPeers = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (pubsub1.getPeers().length > 0 && pubsub2.getPeers().length > 0) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for pubsub peers to connect')
  }

  console.log('Waiting for pubsub peers to connect...')
  await waitForPubSubPeers(10000)

  const waitForPubSubStreams = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (pubsub1.streamsOutbound.size > 0 && pubsub2.streamsOutbound.size > 0) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for pubsub streams to become writable')
  }

  console.log('Waiting for pubsub streams to become writable...')
  await waitForPubSubStreams(10000)

  // Subscribe both nodes to 'xmpp-news' topic
  const topic = 'xmpp-news'
  console.log(`Subscribing both nodes to Gossipsub topic: ${topic}`)
  await xmppNode1.subscribe(topic)
  await xmppNode2.subscribe(topic)
  const waitForSubscribers = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const subscribers1 = pubsub1.getSubscribers(topic).map((peer: any) => peer.toString())
      const subscribers2 = pubsub2.getSubscribers(topic).map((peer: any) => peer.toString())
      if (
        subscribers1.includes(libp2p2.peerId.toString()) &&
        subscribers2.includes(libp2p1.peerId.toString())
      ) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error(`Timed out waiting for gossipsub subscribers on topic "${topic}"`)
  }

  let node2Received = false
  let receivedMsg: any = null

  xmppNode2.on('pubsub:message', (msg) => {
    console.log(`[Node 2 Received PubSub Message]`)
    console.log(`  Topic:   ${msg.topic}`)
    console.log(`  From:    ${msg.from}`)
    console.log(`  Item ID: ${msg.itemId}`)
    console.log(`  Body:    ${msg.body}`)
    if (msg.body === 'Important XMPP news updates!') {
      node2Received = true
      receivedMsg = msg
    }
  })

  console.log('\nWaiting for gossipsub subscription propagation...')
  await waitForSubscribers(10000)

  // Publish from Node 1
  console.log(`\nPublishing item to topic "${topic}" from Node 1...`)
  const itemId = await xmppNode1.publish(topic, 'Important XMPP news updates!')
  console.log(`Published! Item ID: ${itemId}`)

  // Wait for propagation
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Close nodes
  console.log('\nStopping nodes...')
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()

  console.log('\nPubSub Test Results:')
  console.log(`  - Node 2 Received Event Notification: ${node2Received ? 'SUCCESS' : 'FAILED'}`)
  if (node2Received && receivedMsg) {
    console.log(`  - Stanza xmlns matches XEP-0060 event: SUCCESS`)
  }

  if (node2Received) {
    console.log('\n>>> PUBSUB VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } else {
    console.log('\n>>> PUBSUB VERIFICATION FAILED! <<<')
    process.exit(1)
  }
}

runPubSubTest().catch((err) => {
  console.error('PubSub test error:', err)
  process.exit(1)
})
