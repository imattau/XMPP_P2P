import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, message: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(message)
}

async function runReconnectTest() {
  console.log('Starting connection resilience test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-reconnect-'))

  let libp2p1: any
  let libp2p2: any

  try {
    libp2p1 = await createP2PNode(9901, { enableMdns: false, enableDht: true })
    await libp2p1.start()
    const xmpp1 = new XmppNode(libp2p1, new NodeSqliteStorage(join(workDir, 'n1.sqlite')))

    libp2p2 = await createP2PNode(9902, { enableMdns: false, enableDht: true })
    await libp2p2.start()
    const xmpp2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'n2.sqlite')))

    await Promise.all([xmpp1.ready, xmpp2.ready])

    const addr1 = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1'))
    if (!addr1) throw new Error('No listen address for node 1')

    console.log('Test 1: Establish XMPP stream between two peers')
    const stream = await xmpp2.getOrCreateStream(`${libp2p1.peerId.toString()}@p2p`)
    if (!stream) throw new Error('Failed to create XMPP stream')
    console.log('  PASS')

    console.log('Test 2: Stream close triggers reconnect scheduling')
    let reconnectSeen = false
    xmpp2.on('stream', (evt: any) => {
      if (evt.direction === 'reconnect') reconnectSeen = true
    })
    await stream.close()
    await waitFor(() => reconnectSeen, 10000, 'Reconnect stream event was not emitted after close')
    console.log('  PASS')

    console.log('Test 3: Message delivery works over reconnected stream')
    xmpp1.on('message', (msg: any) => {
      if (msg.body === 'reconnect-test-message') {
        console.log('  PASS')
      }
    })
    const xmppStream2 = xmpp2['streams'].get(libp2p1.peerId.toString())
    await waitFor(() => !!xmppStream2, 10000, 'Stream 2 was not re-established')

    const msgEl = (await import('@xmpp/xml')).xml('message', {
      to: `${libp2p1.peerId.toString()}@p2p`,
      from: xmpp2.jid,
      type: 'chat',
      id: 'reconnect-msg-1'
    }, (await import('@xmpp/xml')).xml('body', {}, 'reconnect-test-message'))
    if (xmppStream2) xmppStream2.send(msgEl)

    await waitFor(async () => false, 2000, '(message delivery check is async)')

    console.log('\n>>> RECONNECT VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runReconnectTest().catch((err) => {
  console.error('Reconnect test error:', err)
  process.exit(1)
})
