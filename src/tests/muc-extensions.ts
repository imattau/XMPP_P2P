import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { xml } from '@xmpp/xml'

async function runMucExtensionsTest() {
  console.log('Starting XMPP MUC Extensions (MAM, Markers, Chat States, Correction) verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-muc-extensions-'))
  const storage1 = new NodeSqliteStorage(join(workDir, 'node1-state.sqlite'))
  const storage2 = new NodeSqliteStorage(join(workDir, 'node2-state.sqlite'))

  // Create Node 1 (Alice)
  const libp2p1 = await createP2PNode(9203)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1, storage1)
  console.log(`Node 1 JID: ${xmppNode1.jid}`)

  // Create Node 2 (Bob)
  const libp2p2 = await createP2PNode(9204)
  await libp2p2.start()
  const xmppNode2 = new XmppNode(libp2p2, storage2)
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

  // Establish a direct XmppStream between Alice and Bob by querying disco info
  console.log('Establishing direct XMPP stream between Alice and Bob...')
  await xmppNode1.getDiscoInfo(loopbackAddr)
  console.log('Direct XMPP stream established!')

  const roomName = 'extensions-room'
  const roomJid = `${roomName}@muc.p2p`

  let aliceReceivedChatState = false
  let aliceReceivedMarker = false
  let aliceReceivedOriginal = false
  let aliceReceivedCorrection = false
  let aliceReceivedMamHistory: any[] = []

  // Setup listeners for Alice
  xmppNode1.on('muc:chatstate', (evt) => {
    console.log(`[Alice MUC ChatState] Room: ${evt.room}, From: ${evt.from}, State: ${evt.chatState}`)
    if (evt.room === roomName && evt.from === 'Bob' && evt.chatState === 'composing') {
      aliceReceivedChatState = true
    }
  })

  xmppNode1.on('muc:marker', (evt) => {
    console.log(`[Alice MUC Marker] Room: ${evt.room}, From: ${evt.from}, Marker: ${evt.type}, Target ID: ${evt.id}`)
    if (evt.room === roomName && evt.from === 'Bob' && evt.type === 'displayed' && evt.id === 'msg-1') {
      aliceReceivedMarker = true
    }
  })

  xmppNode1.on('muc:message', (evt) => {
    if (evt.mam) {
      console.log(`[Alice MUC MAM History Msg] Room: ${evt.room}, From: ${evt.from}, Body: ${evt.body}, Timestamp: ${evt.timestamp}`)
      aliceReceivedMamHistory.push(evt)
    } else {
      console.log(`[Alice MUC Message] Room: ${evt.room}, From: ${evt.from}, Body: ${evt.body}, ID: ${evt.id}, Replace: ${evt.replace}`)
      if (evt.id === 'msg-1' && evt.body === 'First message' && !evt.replace) {
        aliceReceivedOriginal = true
      }
      if (evt.replace === 'msg-1' && evt.body === 'First message corrected') {
        aliceReceivedCorrection = true
      }
    }
  })

  // Join MUC room from Alice
  console.log(`\nAlice joining room "${roomName}"...`)
  await xmppNode1.joinMucRoom(roomName, 'Alice')

  // Join MUC room from Bob
  console.log(`Bob joining room "${roomName}"...`)
  await xmppNode2.joinMucRoom(roomName, 'Bob')

  // Wait for presence exchange
  console.log('Waiting for MUC occupant presence synchronization...')
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

  // Bob sends composing chat state
  console.log('\nBob sending composing chat state...')
  await xmppNode2.muc.sendGroupChatState(roomName, 'composing')

  // Bob sends original message
  console.log('Bob sending message ID msg-1: "First message"...')
  await xmppNode2.muc.sendGroupMessage(roomName, 'First message', undefined, 'msg-1')

  // Bob sends displayed chat marker for msg-1
  console.log('Bob sending chat marker displayed for ID msg-1...')
  await xmppNode2.muc.sendGroupChatMarker(roomName, 'displayed', 'msg-1')

  // Bob sends corrected message replacing msg-1
  console.log('Bob sending corrected message: "First message corrected"...')
  await xmppNode2.muc.sendGroupMessage(roomName, 'First message corrected', 'msg-1', 'msg-2')

  // Wait for propagation
  const waitForEvents = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (aliceReceivedChatState && aliceReceivedOriginal && aliceReceivedMarker && aliceReceivedCorrection) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for MUC extensions events propagation')
  }
  await waitForEvents(5000)
  console.log('All real-time MUC extensions events verified successfully!')

  // Alice queries Bob's MAM archive
  console.log(`\nAlice querying Bob's MAM history for room "${roomName}"...`)
  await xmppNode1.muc.queryHistory(roomName, xmppNode2.jid, 'mam-query-1')

  // Wait for history to arrive
  const waitForMamHistory = async (timeoutMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (aliceReceivedMamHistory.length >= 2) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Timed out waiting for MAM history query response')
  }
  await waitForMamHistory(5000)
  console.log('MAM History query completed successfully!')

  // Clean up
  console.log('\nStopping nodes...')
  await xmppNode1.muc.leaveRoom(roomName)
  await xmppNode2.muc.leaveRoom(roomName)
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()
  await rm(workDir, { recursive: true, force: true }).catch(() => {})

  console.log('\nMUC Extensions Test Results:')
  console.log(`  - Alice received chat state composing: ${aliceReceivedChatState ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Alice received original message msg-1: ${aliceReceivedOriginal ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Alice received chat marker displayed: ${aliceReceivedMarker ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Alice received message correction: ${aliceReceivedCorrection ? 'SUCCESS' : 'FAILED'}`)
  console.log(`  - Alice fetched MAM history (2 messages): ${aliceReceivedMamHistory.length >= 2 ? 'SUCCESS' : 'FAILED'}`)

  if (
    aliceReceivedChatState &&
    aliceReceivedOriginal &&
    aliceReceivedMarker &&
    aliceReceivedCorrection &&
    aliceReceivedMamHistory.length >= 2
  ) {
    console.log('\n>>> MUC EXTENSIONS VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } else {
    console.log('\n>>> MUC EXTENSIONS VERIFICATION FAILED! <<<')
    process.exit(1)
  }
}

runMucExtensionsTest().catch((err) => {
  console.error('MUC extensions verification test error:', err)
  process.exit(1)
})
