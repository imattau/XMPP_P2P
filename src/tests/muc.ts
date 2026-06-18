import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'

async function runMucTest() {
  console.log('Starting XMPP Multi-User Chat (MUC) over Gossipsub verification test...\n')

  // Create Node 1 (Alice)
  const libp2p1 = await createP2PNode(9201)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1)
  console.log(`Node 1 JID: ${xmppNode1.jid}`)

  // Create Node 2 (Bob)
  const libp2p2 = await createP2PNode(9202)
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

  const roomName = 'test-room'
  const roomJid = `${roomName}@muc.p2p`
  const topic = `xmpp/muc/${roomName}`

  let bobReceivedMessage = false
  let aliceReceivedJoin = false
  let aliceReceivedLeave = false

  xmppNode2.on('muc:message', (evt) => {
    console.log(`[Bob Received MUC Message] Room: ${evt.room}, From: ${evt.from}, Body: ${evt.body}`)
    if (evt.room === roomName && evt.roomJid === roomJid && evt.from === 'Alice' && evt.occupantJid === `${roomJid}/Alice` && evt.peerJid === xmppNode1.jid && evt.body === 'Hello world from Alice!') {
      bobReceivedMessage = true
    }
  })

  xmppNode1.on('muc:join', (evt) => {
    console.log(`[Alice Received MUC Join] Room: ${evt.room}, Occupant: ${evt.nick}, JID: ${evt.occupantJid}`)
    if (evt.room === roomName && evt.roomJid === roomJid && evt.nick === 'Bob' && evt.occupantJid === `${roomJid}/Bob` && evt.peerJid === xmppNode2.jid) {
      aliceReceivedJoin = true
    }
  })

  xmppNode1.on('muc:leave', (evt) => {
    console.log(`[Alice Received MUC Leave] Room: ${evt.room}, Occupant: ${evt.nick}, JID: ${evt.occupantJid}`)
    if (evt.room === roomName && evt.roomJid === roomJid && evt.nick === 'Bob' && evt.occupantJid === `${roomJid}/Bob` && evt.peerJid === xmppNode2.jid) {
      aliceReceivedLeave = true
    }
  })

  // Join MUC room from Alice
  console.log(`\nAlice joining room "${roomName}"...`)
  await xmppNode1.joinMucRoom(roomName, 'Alice')

  // Join MUC room from Bob
  console.log(`Bob joining room "${roomName}"...`)
  await xmppNode2.joinMucRoom(roomName, 'Bob')

  // Wait for rosters to sync (presence exchanges)
  console.log('Waiting for presence exchanges and subscription propagation...')
  const waitForRosterSync = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const state1 = xmppNode1.muc.getRoomState(roomName)
      const state2 = xmppNode2.muc.getRoomState(roomName)
      if (state1?.occupants.has('Bob') && state2?.occupants.has('Alice')) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for MUC occupant presence synchronization')
  }

  await waitForRosterSync(10000)
  console.log('MUC rosters synchronized successfully!')

  // Alice sends a groupchat message
  console.log('\nAlice sending message: "Hello world from Alice!"...')
  await xmppNode1.muc.sendGroupMessage(roomName, 'Hello world from Alice!')

  // Wait for Bob to receive message
  const waitForMessage = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (bobReceivedMessage) return
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for groupchat message propagation')
  }
  await waitForMessage(5000)

  // Bob leaves the room
  console.log('\nBob leaving room...')
  await xmppNode2.muc.leaveRoom(roomName)

  // Wait for Alice to detect Bob's leave
  const waitForLeave = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (aliceReceivedLeave) return
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for leave presence propagation')
  }
  await waitForLeave(5000)

  // Clean up
  console.log('\nStopping nodes...')
  await xmppNode1.muc.leaveRoom(roomName)
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()

  console.log('\nMUC Test Results:')
  console.log(`  - Alice discovered Bob's join: ${aliceReceivedJoin ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Bob received Alice's group message: ${bobReceivedMessage ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Alice discovered Bob's leave: ${aliceReceivedLeave ? 'SUCCESS' : 'FAILED'}`)

  if (aliceReceivedJoin && bobReceivedMessage && aliceReceivedLeave) {
    console.log('\n>>> MUC VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } else {
    console.log('\n>>> MUC VERIFICATION FAILED! <<<')
    process.exit(1)
  }
}

runMucTest().catch((err) => {
  console.error('MUC verification test error:', err)
  process.exit(1)
})
