import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
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

async function runMucOmemoTest() {
  console.log('Starting XMPP OMEMO MUC End-to-End Encryption verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-muc-omemo-'))

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9301)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, { rosterPath: join(workDir, 'node1-roster.json') })

    libp2p2 = await createP2PNode(9302)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, { rosterPath: join(workDir, 'node2-roster.json') })

    await Promise.all([xmppNode1.ready, xmppNode2.ready])

    const node1 = xmppNode1 as XmppNode
    const node2 = xmppNode2 as XmppNode

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]

    await libp2p1.dial(node2Address)

    // Wait for Gossipsub peers connection
    const pubsub1 = (libp2p1.services as any).pubsub
    const pubsub2 = (libp2p2.services as any).pubsub
    await waitFor(() => pubsub1.getPeers().length > 0 && pubsub2.getPeers().length > 0, 10000, 'Timed out waiting for pubsub peers')

    // Exchange OMEMO keys/devices lists to establish Double Ratchet sessions
    const node1DeviceId = await node1.getOmemoDeviceId()
    const node2DeviceId = await node2.getOmemoDeviceId()

    await node1.fetchOmemoDeviceList(node2Address)
    await node1.fetchOmemoBundle(node2Address, node2DeviceId)

    await node2.fetchOmemoDeviceList(node1Address)
    await node2.fetchOmemoBundle(node1Address, node1DeviceId)

    const roomName = 'secure-room'

    let secureMessageReceived = false
    let receivedPayload: any = null

    node2.on('muc:message', (evt) => {
      console.log(`[Bob Received MUC Message] Encrypted: ${evt.encrypted}, Body: ${evt.body}`)
      if (evt.room === roomName && evt.roomJid === `${roomName}@muc.p2p` && evt.occupantJid === `${roomName}@muc.p2p/Alice` && evt.peerJid === node1.jid && evt.encrypted && evt.encryption === 'omemo' && evt.body === 'Super secret group chat!') {
        secureMessageReceived = true
        receivedPayload = evt
      }
    })

    // Join room from both nodes
    console.log('Alice joining room...')
    await node1.joinMucRoom(roomName, 'Alice')

    console.log('Bob joining room...')
    await node2.joinMucRoom(roomName, 'Bob')

    // Wait for presence/roster sync in the MUC room
    console.log('Waiting for MUC roster sync...')
    await waitFor(() => {
      const state1 = node1.muc.getRoomState(roomName)
      const state2 = node2.muc.getRoomState(roomName)
      return (state1?.occupants.has('Bob') ?? false) && (state2?.occupants.has('Alice') ?? false)
    }, 10000, 'Timed out waiting for MUC roster sync')

    console.log('MUC rosters sync completed!')

    // Alice sends OMEMO encrypted message to the room
    console.log('Alice sending end-to-end OMEMO encrypted MUC message...')
    await node1.muc.sendGroupMessageSecure(roomName, 'Super secret group chat!')

    // Wait for Bob to receive and decrypt it
    await waitFor(() => secureMessageReceived, 10000, 'Timed out waiting for secure message delivery')

    console.log('\nOMEMO MUC Test Results:')
    console.log('  - Group End-to-End OMEMO Encryption: SUCCESS')
    console.log('  - Secure Roster Key Exchange: SUCCESS')
    console.log('\n>>> OMEMO MUC VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runMucOmemoTest().catch((err) => {
  console.error('OMEMO MUC test error:', err)
  process.exit(1)
})
