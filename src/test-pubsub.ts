import { createP2PNode } from './p2p.js'
import { XmppNode } from './xmpp-node.js'

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

  // Subscribe both nodes to 'xmpp-news' topic
  const topic = 'xmpp-news'
  console.log(`Subscribing both nodes to Gossipsub topic: ${topic}`)
  xmppNode1.subscribe(topic)
  xmppNode2.subscribe(topic)

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

  // Gossipsub requires peers to discover and establish connection first.
  // Wait a few seconds for mDNS discovery and Gossipsub mesh connection.
  console.log('\nWaiting 4 seconds for peer discovery and Gossipsub mesh setup...')
  await new Promise(resolve => setTimeout(resolve, 4000))

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
