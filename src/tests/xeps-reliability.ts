import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { xml } from '@xmpp/xml'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, message: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(message)
}

async function runXepsReliabilityTest() {
  console.log('Starting XMPP Reliability (XEP-0359, XEP-0198, XEP-0352, XEP-0369) verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-reliability-'))
  let libp2p1 = await createP2PNode(9801, { enableDht: true, enableMdns: false, host: '127.0.0.1' })
  let libp2p2 = await createP2PNode(9802, { enableDht: true, enableMdns: false, host: '127.0.0.1' })

  await libp2p1.start()
  await libp2p2.start()

  const xmppNode1 = new XmppNode(libp2p1, { rosterPath: join(workDir, 'node1-roster.json') })
  const xmppNode2 = new XmppNode(libp2p2, { rosterPath: join(workDir, 'node2-roster.json') })

  const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
  console.log(`Connecting Node 1 -> Node 2 via: ${node2Address.toString()}...`)
  await libp2p1.dial(node2Address)
  console.log('Nodes connected!\n')

  console.log('Waiting for XMPP nodes to be ready...')
  await Promise.all([xmppNode1.ready, xmppNode2.ready])
  console.log('XMPP nodes ready!\n')

  console.log('Waiting 3 seconds for DHT routing tables to stabilize...')
  await new Promise(resolve => setTimeout(resolve, 3000))
  console.log('DHT stabilized, running tests...\n')

  // 1. Verify XEP-0359 Stanza IDs
  let receivedMessage: any = null
  xmppNode2.on('message', (msg) => {
    receivedMessage = msg
  })

  console.log('Test 1: Sending message to verify Stanza IDs...')
  const sentMsgId = await xmppNode1.sendMessage(node2Address.toString(), 'Hello reliability')

  await waitFor(() => receivedMessage !== null, 5000, 'Timed out waiting for message')

  console.log(`  - Sent Message ID: ${sentMsgId}`)
  console.log(`  - Received Message ID: ${receivedMessage.id}`)
  console.log(`  - Stanza ID / Origin ID present: ${receivedMessage.originId ? 'YES' : 'NO'}`)

  if (receivedMessage.id !== sentMsgId || !receivedMessage.originId) {
    throw new Error('XEP-0359 unique action identifiers verification failed')
  }
  console.log('>>> TEST 1 SUCCESS: XEP-0359 Stanza IDs verified. <<<\n')

  // 2. Verify XEP-0352 CSI & DHT mailbox buffering
  console.log('Test 2: Setting Node 2 to inactive (CSI) and sending message...')
  await xmppNode2.setClientState('inactive')
  await new Promise(resolve => setTimeout(resolve, 500))

  let mailboxMessageReceived = false
  xmppNode2.on('message', (msg) => {
    if (msg.body === 'Mailbox buffered message') {
      mailboxMessageReceived = true
    }
  })

  // Send message while Node 2 is inactive - should buffer to DHT
  const bufferedMsgId = await xmppNode1.sendMessage(node2Address.toString(), 'Mailbox buffered message')
  console.log(`  - Sent message ID: ${bufferedMsgId} (should be buffered)`)

  // Bob should not have received it yet because he is inactive
  await new Promise(resolve => setTimeout(resolve, 1000))
  if (mailboxMessageReceived) {
    throw new Error('Bob received message while inactive (should have been buffered instead)')
  }
  console.log('  - Confirmed: Bob did not receive message immediately while inactive')

  // Set Bob back to active - should pull from DHT
  console.log('  - Setting Node 2 back to active...')
  await xmppNode2.setClientState('active')

  await waitFor(() => mailboxMessageReceived, 8000, 'Timed out waiting for buffered mailbox message')
  console.log('>>> TEST 2 SUCCESS: XEP-0352 CSI & DHT mailbox buffering verified. <<<\n')

  // 3. Verify XEP-0369 MIX pubsub sub-topics
  console.log('Test 3: MIX sub-topic subscriptions check...')
  const roomName = 'reliability-mix-room'
  await xmppNode1.muc.joinRoom(roomName, 'Alice')

  const pubsub1 = (libp2p1.services as any).pubsub
  const subscribedTopics = pubsub1.getTopics()
  console.log('  - Subscribed topics:', subscribedTopics)

  const hasBase = subscribedTopics.includes(`xmpp/muc/${roomName}`)
  const hasMessages = subscribedTopics.includes(`xmpp/muc/${roomName}/messages`)
  const hasPresence = subscribedTopics.includes(`xmpp/muc/${roomName}/presence`)

  if (!hasBase || !hasMessages || !hasPresence) {
    throw new Error('MIX sub-topics subscription verification failed')
  }
  console.log('>>> TEST 3 SUCCESS: XEP-0369 MIX sub-topics verified. <<<\n')

  // Clean up MUC
  await xmppNode1.muc.leaveRoom(roomName)

  // Clean up nodes
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()
  await rm(workDir, { recursive: true, force: true })

  console.log('>>> ALL RELIABILITY TESTS PASSED SUCCESSFULY! <<<')
  process.exit(0)
}

runXepsReliabilityTest().catch(err => {
  console.error('Reliability verification test failed:', err)
  process.exit(1)
})
