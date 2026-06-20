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

async function waitForPeerViaDht(observer: Awaited<ReturnType<typeof createP2PNode>>, peerId: any, timeoutMs: number) {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const peerInfo = await observer.peerRouting.findPeer(peerId)
      if (peerInfo.multiaddrs.length > 0) {
        return peerInfo
      }
    } catch (err) {
      lastError = err
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for DHT peer discovery${lastError ? `: ${(lastError as Error).message}` : ''}`)
}

async function runDhtTest() {
  console.log('Starting XMPP DHT routing verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-dht-'))

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined
  let libp2p3: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode3: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9701, { enableDht: true, enableMdns: false })
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, new NodeSqliteStorage(join(workDir, 'node1-state.sqlite')))

    libp2p2 = await createP2PNode(9702, { enableDht: true, enableMdns: false })
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'node2-state.sqlite')))

    libp2p3 = await createP2PNode(9703, { enableDht: true, enableMdns: false })
    await libp2p3.start()
    xmppNode3 = new XmppNode(libp2p3, new NodeSqliteStorage(join(workDir, 'node3-state.sqlite')))

    await Promise.all([xmppNode1.ready, xmppNode2.ready, xmppNode3.ready])

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    const node3Address = libp2p3.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p3.getMultiaddrs()[0]

    if (!node1Address || !node2Address || !node3Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    console.log(`Node 2 dialing bootstrap node at: ${node1Address.toString()}...`)
    await libp2p2.dial(node1Address)
    console.log(`Node 3 dialing bootstrap node at: ${node1Address.toString()}...`)
    await libp2p3.dial(node1Address)

    console.log('Waiting for Node 3 to discover Node 2 via the DHT...')
    const discoveredPeer = await waitForPeerViaDht(libp2p3, libp2p2.peerId, 15000)
    if (discoveredPeer.id.toString() !== libp2p2.peerId.toString()) {
      throw new Error('DHT discovery returned the wrong peer')
    }

    const discoveredAddress = discoveredPeer.multiaddrs.find((ma: any) => ma.toString().includes('127.0.0.1')) || discoveredPeer.multiaddrs[0]
    if (!discoveredAddress) {
      throw new Error('DHT discovery did not return a dialable address for Node 2')
    }

    console.log(`Node 3 dialing Node 2 via DHT-discovered address: ${discoveredAddress.toString()}...`)
    await libp2p3.dial(discoveredAddress)

    const pubsub2 = (libp2p2.services as any).pubsub
    const pubsub3 = (libp2p3.services as any).pubsub
    const topic = 'xmpp-dht-propagation'

    console.log(`Subscribing Node 2 and Node 3 to topic: ${topic}`)
    await xmppNode2.subscribe(topic)
    await xmppNode3.subscribe(topic)

    await waitFor(async () => {
      const subscribers2 = pubsub2.getSubscribers(topic).map((peer: any) => peer.toString())
      const subscribers3 = pubsub3.getSubscribers(topic).map((peer: any) => peer.toString())
      return (
        subscribers2.includes(libp2p3.peerId.toString()) &&
        subscribers3.includes(libp2p2.peerId.toString())
      )
    }, 10000, 'Timed out waiting for gossipsub subscribers to connect over the DHT-discovered route')

    let node3Received = false
    xmppNode3.on('pubsub:message', (msg) => {
      if (msg.topic === topic && msg.body === 'DHT routed propagation works') {
        node3Received = true
      }
    })

    console.log('Publishing message from Node 2 to Node 3...')
    await xmppNode2.publish(topic, 'DHT routed propagation works')

    await waitFor(() => node3Received, 10000, 'Timed out waiting for pubsub delivery after DHT discovery')

    console.log('\nDHT Test Results:')
    console.log('  - Peer Discovery Completed via DHT: SUCCESS')
    console.log('  - DHT-Discovered Address Dialed: SUCCESS')
    console.log('  - PubSub Delivery Over Routed Topology: SUCCESS')
    console.log('\n>>> DHT VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await xmppNode3?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await libp2p3?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runDhtTest().catch((err) => {
  console.error('DHT test error:', err)
  process.exit(1)
})
