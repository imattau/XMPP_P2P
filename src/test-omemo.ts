import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from './p2p.js'
import { XmppNode } from './xmpp-node.js'

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

async function runOmemoTest() {
  console.log('Starting XMPP OMEMO verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-omemo-'))

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9801)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, { rosterPath: join(workDir, 'node1-roster.json') })

    libp2p2 = await createP2PNode(9802)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, { rosterPath: join(workDir, 'node2-roster.json') })

    await Promise.all([xmppNode1.ready, xmppNode2.ready])

    const node1 = xmppNode1 as XmppNode
    const node2 = xmppNode2 as XmppNode

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]

    if (!node1Address || !node2Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    await libp2p1.dial(node2Address)

    const node1DeviceId = await node1.getOmemoDeviceId()
    const node1IdentityKeyBefore = await node1.getOmemoIdentityKey()
    const node2DeviceId = await node2.getOmemoDeviceId()

    const node2Devices = await node1.fetchOmemoDeviceList(node2Address)
    if (!node2Devices.includes(node2DeviceId)) {
      throw new Error('Node 2 device list did not include its own device id')
    }

    const node2Bundle = await node1.fetchOmemoBundle(node2Address, node2DeviceId)
    if (node2Bundle.deviceId !== node2DeviceId) {
      throw new Error('Node 2 bundle fetch returned the wrong device id')
    }

    const node1Devices = await node2.fetchOmemoDeviceList(node1Address)
    if (!node1Devices.includes(node1DeviceId)) {
      throw new Error('Node 1 device list did not include its own device id')
    }

    await node2.fetchOmemoBundle(node1Address, node1DeviceId)

    let encryptedChatReceived = false
    node2.on('message', (msg) => {
      if (msg.encrypted && msg.encryption === 'omemo' && msg.body === 'Keep this between us') {
        encryptedChatReceived = true
      }
    })

    console.log('Sending encrypted one-to-one chat message...')
    await node1.sendEncryptedMessage(node2Address, 'Keep this between us')

    await waitFor(() => encryptedChatReceived, 10000, 'Timed out waiting for encrypted chat delivery')

    console.log('Verifying OMEMO key persistence across restart...')
    await node1.close()
    await libp2p1.stop()

    const restartedLibp2p1 = await createP2PNode(9801)
    await restartedLibp2p1.start()
    const restartedNode1 = new XmppNode(restartedLibp2p1, { rosterPath: join(workDir, 'node1-roster.json') })
    await restartedNode1.ready

    const restartedDeviceId = await restartedNode1.getOmemoDeviceId()
    const restartedIdentityKey = await restartedNode1.getOmemoIdentityKey()
    if (restartedDeviceId !== node1DeviceId) {
      throw new Error('OMEMO device id did not persist across restart')
    }
    if (restartedIdentityKey !== node1IdentityKeyBefore) {
      throw new Error('OMEMO identity key did not persist across restart')
    }

    await restartedNode1.close()
    await restartedLibp2p1.stop()

    console.log('\nOMEMO Test Results:')
    console.log('  - Encrypted Chat Delivered: SUCCESS')
    console.log('  - Device List Discovery: SUCCESS')
    console.log('  - Bundle Discovery: SUCCESS')
    console.log('  - OMEMO Key Persistence Across Restart: SUCCESS')
    console.log('\n>>> OMEMO VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runOmemoTest().catch((err) => {
  console.error('OMEMO test error:', err)
  process.exit(1)
})
