import { createP2PNode } from './p2p.js'
import { XmppNode } from './xmpp-node.js'

async function runTest() {
  console.log('Starting XMPP-over-libp2p verification test...\n')

  // Create Node 1
  console.log('Launching Node 1 on port 9001...')
  const libp2p1 = await createP2PNode(9001)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1)
  console.log(`Node 1 Peer ID: ${libp2p1.peerId.toString()}`)
  console.log(`Node 1 JID:     ${xmppNode1.jid}\n`)

  // Create Node 2
  console.log('Launching Node 2 on port 9002...')
  const libp2p2 = await createP2PNode(9002)
  await libp2p2.start()
  const xmppNode2 = new XmppNode(libp2p2)
  console.log(`Node 2 Peer ID: ${libp2p2.peerId.toString()}`)
  console.log(`Node 2 JID:     ${xmppNode2.jid}\n`)

  let msg1Received = false
  let msg2Received = false

  // Listener on Node 2 for incoming messages
  xmppNode2.on('message', (msg) => {
    console.log(`[Node 2 Received Message]`)
    console.log(`  From: ${msg.from}`)
    console.log(`  To:   ${msg.to}`)
    console.log(`  Body: ${msg.body}`)
    if (msg.body === 'Hello Node 2! Greetings from Node 1.') {
      msg1Received = true
    }
  })

  // Listener on Node 1 for incoming messages
  xmppNode1.on('message', (msg) => {
    console.log(`[Node 1 Received Message]`)
    console.log(`  From: ${msg.from}`)
    console.log(`  To:   ${msg.to}`)
    console.log(`  Body: ${msg.body}`)
    if (msg.body === 'Hello Node 1! Received loud and clear.') {
      msg2Received = true
    }
  })

  // Node 1 dials Node 2 using multiaddr
  const node2Addresses = libp2p2.getMultiaddrs()
  if (node2Addresses.length === 0) {
    throw new Error('Node 2 has no listening addresses')
  }
  
  // Use loopback address for reliable testing
  const loopbackAddr = node2Addresses.find((ma: any) => ma.toString().includes('127.0.0.1')) || node2Addresses[0]
  console.log(`Node 1 dialing Node 2 at: ${loopbackAddr.toString()}...`)
  
  // Wait a moment for network initialization
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Send message from Node 1 -> Node 2
  console.log('\nSending message from Node 1 -> Node 2...')
  await xmppNode1.sendMessage(loopbackAddr, 'Hello Node 2! Greetings from Node 1.')

  // Wait for delivery
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Send reply from Node 2 -> Node 1 (using Node 1's peer ID)
  console.log('\nSending reply from Node 2 -> Node 1...')
  const node1Addr = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
  await xmppNode2.sendMessage(node1Addr, 'Hello Node 1! Received loud and clear.')

  // Wait for delivery
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Close connections
  console.log('\nStopping nodes...')
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()

  console.log('\nTest Results:')
  console.log(`  - Node 1 -> Node 2 Message Delivered: ${msg1Received ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Node 2 -> Node 1 Message Delivered: ${msg2Received ? 'SUCCESS' : 'FAILED'}`)

  if (msg1Received && msg2Received) {
    console.log('\n>>> VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } else {
    console.log('\n>>> VERIFICATION FAILED! <<<')
    process.exit(1)
  }
}

runTest().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
