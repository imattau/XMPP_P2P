import assert from 'node:assert/strict'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'

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

async function runThreadsTest() {
  console.log('Starting XMPP Message Threads verification test...\n')

  const libp2p1 = await createP2PNode(9310)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1)

  const libp2p2 = await createP2PNode(9311)
  await libp2p2.start()
  const xmppNode2 = new XmppNode(libp2p2)

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

  let directThreadObserved = false
  xmppNode1.on('message', (msg) => {
    if (msg.body === 'Threaded follow-up' && msg.thread === 'direct-thread-1') {
      directThreadObserved = true
      console.log(`[Node 1 Received Threaded Message] From: ${msg.from}, Thread: ${msg.thread}`)
    }
  })

  console.log('Sending threaded direct message from Node 2 -> Node 1...')
  await xmppNode2.sendMessage(node1Address, 'Threaded follow-up', {
    thread: 'direct-thread-1'
  })

  await waitFor(() => directThreadObserved, 5000, 'Timed out waiting for direct thread metadata to arrive')

  const roomName = 'threads-room'
  let liveRoomThreadObserved = false
  let mamRoomThreadObserved = false

  xmppNode2.on('muc:message', (evt) => {
    if (evt.room === roomName && evt.body === 'Threaded room message' && evt.thread === 'room-thread-1' && !evt.mam) {
      liveRoomThreadObserved = true
      console.log(`[Node 2 Received MUC Thread] Room: ${evt.room}, Thread: ${evt.thread}`)
    }
  })

  xmppNode1.on('muc:message', (evt) => {
    if (evt.room === roomName && evt.body === 'Threaded room message' && evt.thread === 'room-thread-1' && evt.mam) {
      mamRoomThreadObserved = true
      console.log(`[Node 1 Received MAM Thread] Room: ${evt.room}, Thread: ${evt.thread}`)
    }
  })

  console.log(`\nNode 1 joining room "${roomName}"...`)
  await xmppNode1.joinMucRoom(roomName, 'Alice')
  console.log(`Node 2 joining room "${roomName}"...`)
  await xmppNode2.joinMucRoom(roomName, 'Bob')

  await waitFor(() => {
    const state1 = xmppNode1.muc.getRoomState(roomName)
    const state2 = xmppNode2.muc.getRoomState(roomName)
    return !!state1?.occupants.has('Bob') && !!state2?.occupants.has('Alice')
  }, 10000, 'Timed out waiting for MUC occupant presence synchronization')

  console.log('Sending threaded group message from Node 1 -> room...')
  await xmppNode1.muc.sendGroupMessage(roomName, 'Threaded room message', undefined, 'thread-msg-1', undefined, 'room-thread-1')

  await waitFor(() => liveRoomThreadObserved, 5000, 'Timed out waiting for live MUC thread metadata to arrive')

  console.log('Querying Bob MAM history for threaded room message...')
  await xmppNode1.muc.queryHistory(roomName, xmppNode2.jid, 'thread-query-1')
  await waitFor(() => mamRoomThreadObserved, 5000, 'Timed out waiting for threaded MAM history to arrive')

  await xmppNode1.muc.leaveRoom(roomName)
  await xmppNode2.muc.leaveRoom(roomName)
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()

  assert.ok(directThreadObserved, 'Direct message thread metadata should arrive')
  assert.ok(liveRoomThreadObserved, 'Live MUC message thread metadata should arrive')
  assert.ok(mamRoomThreadObserved, 'MUC MAM history should preserve thread metadata')

  console.log('\nThread Test Results:')
  console.log('  - Direct message thread metadata delivered: SUCCESS')
  console.log('  - Live MUC thread metadata delivered: SUCCESS')
  console.log('  - MAM history preserved thread metadata: SUCCESS')
  console.log('\n>>> THREAD VERIFICATION SUCCESSFUL! <<<')
}

runThreadsTest().catch((err) => {
  console.error('Threads test error:', err)
  process.exit(1)
})
