import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { xml } from '@xmpp/xml'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { CARBONS_XMLNS } from '../core/xmpp-xep-helpers.js'

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

async function runCarbonsTest() {
  console.log('Starting XMPP Message Carbons (XEP-0280) verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-carbons-'))
  const storage1 = new NodeSqliteStorage(join(workDir, 'node1-state.sqlite'))
  const storage2 = new NodeSqliteStorage(join(workDir, 'node2-state.sqlite'))

  const libp2p1 = await createP2PNode(9307)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1, storage1)

  const libp2p2 = await createP2PNode(9308)
  await libp2p2.start()
  const xmppNode2 = new XmppNode(libp2p2, storage2)

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

  // 1. Verify Service Discovery
  const discoInfo = await xmppNode1.getDiscoInfo(node2Address)
  assert.ok(discoInfo.features.includes(CARBONS_XMLNS), 'Peer should advertise XEP-0280 support')
  console.log('>>> TEST 1 SUCCESS: Service Discovery advertises carbons namespace.')

  // 2. Verify Carbons enabling/disabling IQ sets
  console.log('Enabling carbons on Node 2...')
  await xmppNode1.enableCarbons(node2Address)
  console.log('Carbons successfully enabled!')

  console.log('Disabling carbons on Node 2...')
  await xmppNode1.disableCarbons(node2Address)
  console.log('Carbons successfully disabled!')
  console.log('>>> TEST 2 SUCCESS: Carbons enabling/disabling set IQs successfully handled.')

  // 3. Verify parse incoming received/sent carbons wrappers
  let carbonMessageObserved = false
  let observedCarbonType: 'sent' | 'received' | undefined = undefined

  xmppNode1.on('message', (msg) => {
    if (msg.body === 'Carbon test message') {
      carbonMessageObserved = true
      observedCarbonType = msg.carbon?.type
      console.log(`[Node 1 Received Carbon] Type: ${msg.carbon?.type}, Body: ${msg.body}`)
    }
  })

  console.log('Simulating received carbon message...')
  const streamToNode1 = await (xmppNode2 as any).getOrCreateStream(node1Address)
  
  // Wrap message in received carbon
  const receivedCarbonStanza = xml('message', { from: xmppNode2.jid, to: xmppNode1.jid },
    xml('received', { xmlns: 'urn:xmpp:carbons:2' },
      xml('forwarded', { xmlns: 'urn:xmpp:forward:0' },
        xml('message', { from: 'bob@p2p', to: xmppNode1.jid, type: 'chat' },
          xml('body', {}, 'Carbon test message')
        )
      )
    )
  )

  await streamToNode1.send(receivedCarbonStanza)
  await waitFor(() => carbonMessageObserved, 5000, 'Timed out waiting for carbon message to arrive')
  assert.equal(observedCarbonType, 'received', 'Message should be parsed as a received carbon')
  console.log('>>> TEST 3 SUCCESS: Received Carbon parsed and emitted correctly.')

  // 4. Verify noCarbons option (Section 4: private elements)
  console.log('Sending message with noCarbons option from Node 1...')
  let privateTagObserved = false
  xmppNode2.on('message', (msg) => {
    if (msg.body === 'Private message' && msg.private === true) {
      privateTagObserved = true
    }
  })

  await xmppNode1.sendMessage(node2Address, 'Private message', { noCarbons: true })
  await waitFor(() => privateTagObserved, 5000, 'Timed out waiting for private message to arrive')
  console.log('>>> TEST 4 SUCCESS: private tag correctly included when noCarbons is specified.')

  console.log('\nStopping nodes...')
  await xmppNode1.close()
  await xmppNode2.close()
  await libp2p1.stop()
  await libp2p2.stop()
  await rm(workDir, { recursive: true, force: true }).catch(() => {})

  console.log('\nAll Carbons Test Results: SUCCESS!')
}

runCarbonsTest().catch((err) => {
  console.error('\nVerification failed:', err)
  process.exit(1)
})
