import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

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

async function runMamTest() {
  console.log('Starting XMPP 1-to-1 MAM History (XEP-0313 + DHT Store) verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-mam-'))
  const storage1 = new NodeSqliteStorage(join(workDir, 'node1-state.sqlite'))
  const storage2 = new NodeSqliteStorage(join(workDir, 'node2-state.sqlite'))

  const libp2p1 = await createP2PNode(9309)
  await libp2p1.start()
  const xmppNode1 = new XmppNode(libp2p1, storage1)
  xmppNode1.on('error', (err) => console.log('[Node 1 Error Log]:', err.message || err))

  const libp2p2 = await createP2PNode(9310)
  await libp2p2.start()
  const xmppNode2 = new XmppNode(libp2p2, storage2)
  xmppNode2.on('error', (err) => console.log('[Node 2 Error Log]:', err.message || err))

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

  // Send some messages
  console.log('Sending message 1 from Node 1 -> Node 2...')
  await xmppNode1.sendMessage(node2Address, 'MAM test message 1')

  console.log('Sending message 2 from Node 2 -> Node 1...')
  await xmppNode2.sendMessage(node1Address, 'MAM test message 2')

  // Register message listener on Node 1 to collect MAM query results
  const receivedMamMessages: any[] = []
  xmppNode1.on('message', (msg) => {
    if (msg.mam) {
      receivedMamMessages.push(msg)
      console.log(`[Node 1 MAM Query Result] From: ${msg.from}, Body: ${msg.body}`)
    }
  })

  // 1. Verify MAM Query
  console.log('\nQuerying Node 2 for MAM history...')
  await xmppNode1.queryChatHistory(node2Address)

  await waitFor(() => receivedMamMessages.length >= 2, 5000, 'Timed out waiting for MAM history results')
  assert.ok(receivedMamMessages.some(m => m.body === 'MAM test message 1'), 'History should include message 1')
  assert.ok(receivedMamMessages.some(m => m.body === 'MAM test message 2'), 'History should include message 2')
  console.log('>>> TEST 1 SUCCESS: MAM history queried and correctly retrieved over stream.')

  // 2. Verify DHT network store & local persistence reload
  console.log('\nRecreating Node 2 to verify SQLite + DHT storage synchronization...')
  await xmppNode2.close()
  await libp2p2.stop()

  const libp2p2Reloaded = await createP2PNode(9310)
  await libp2p2Reloaded.start()
  
  const xmppNode2Reloaded = new XmppNode(libp2p2Reloaded, storage2)
  xmppNode2Reloaded.on('error', (err) => console.log('[Node 2 Reloaded Error Log]:', err.message || err))
  await xmppNode2Reloaded.ready

  const activeHistory = Array.from((xmppNode2Reloaded as any).chatHistory.values())
  assert.ok(activeHistory.some((m: any) => m.body === 'MAM test message 1'), 'Reloaded Node 2 should have restored message 1 from store/DHT')
  assert.ok(activeHistory.some((m: any) => m.body === 'MAM test message 2'), 'Reloaded Node 2 should have restored message 2 from store/DHT')
  console.log('>>> TEST 2 SUCCESS: 1-to-1 chat history correctly reloaded from persistent/DHT store.')

  console.log('\nStopping nodes...')
  await xmppNode1.close()
  await xmppNode2Reloaded.close()
  await libp2p1.stop()
  await libp2p2Reloaded.stop()
  await rm(workDir, { recursive: true, force: true }).catch(() => {})

  console.log('\nAll MAM Test Results: SUCCESS!')
}

runMamTest().catch((err) => {
  console.error('\nVerification failed:', err)
  process.exit(1)
})
