import assert from 'node:assert/strict'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { REPLY_XMLNS } from '../core/xmpp-xep-helpers.js'

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

async function runRepliesTest() {
  console.log('Starting XMPP Message Replies verification test...\n')

  const libp2p1 = await createP2PNode(9305)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1)

  const libp2p2 = await createP2PNode(9306)
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

  const discoInfo = await xmppNode1.getDiscoInfo(node2Address)
  assert.ok(discoInfo.features.includes(REPLY_XMLNS), 'Peer should advertise XEP-0461 support')

  let repliedMessageId = ''
  let replyObserved = false

  xmppNode2.on('message', (msg) => {
    if (!repliedMessageId && msg.body === 'Reply target') {
      repliedMessageId = msg.id ?? ''
    }
  })

  xmppNode1.on('message', (msg) => {
    if (msg.body === 'Reply body' && msg.reply?.id === repliedMessageId) {
      replyObserved = true
      console.log(`[Node 1 Received Reply] From: ${msg.from}, Reply ID: ${msg.reply.id}`)
    }
  })

  console.log('Sending reply target from Node 1 -> Node 2...')
  const targetId = await xmppNode1.sendMessage(node2Address, 'Reply target')

  await waitFor(() => repliedMessageId.length > 0, 5000, 'Timed out waiting for reply target to arrive')
  assert.equal(repliedMessageId, targetId, 'Incoming message id should match the sent id')

  console.log('Sending reply from Node 2 -> Node 1...')
  await xmppNode2.sendMessage(node1Address, 'Reply body', {
    reply: {
      id: repliedMessageId,
      to: xmppNode1.jid
    }
  })

  await waitFor(() => replyObserved, 5000, 'Timed out waiting for reply metadata to arrive')

  console.log('\nStopping nodes...')
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()

  console.log('\nReply Test Results:')
  console.log(`  - Disco advertises urn:xmpp:reply:0: SUCCESS`)
  console.log(`  - Reply metadata delivered with message: SUCCESS`)
  console.log('\n>>> REPLY VERIFICATION SUCCESSFUL! <<<')
}

runRepliesTest().catch((err) => {
  console.error('Replies test error:', err)
  process.exit(1)
})
