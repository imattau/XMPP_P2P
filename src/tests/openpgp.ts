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

async function runOpenPgpTest() {
  console.log('Starting XMPP OpenPGP verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-openpgp-'))
  const node1SqlitePath = join(workDir, 'node1-state.sqlite')

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9801)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, new NodeSqliteStorage(node1SqlitePath))

    libp2p2 = await createP2PNode(9802)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'node2-state.sqlite')))

    await Promise.all([xmppNode1.ready, xmppNode2.ready])

    const node1 = xmppNode1 as XmppNode
    const node2 = xmppNode2 as XmppNode

    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]

    if (!node1Address || !node2Address) {
      throw new Error('One or more nodes have no listening addresses')
    }

    await libp2p1.dial(node2Address)

    const node1FingerprintBefore = await node1.getOpenPgpFingerprint()

    const node1KeyViaNode2 = await node2.fetchOpenPgpPublicKey(node1Address)
    await node2.registerPeerOpenPgpPublicKey(node1Address, node1KeyViaNode2.publicKey)

    const node2KeyViaNode1 = await node1.fetchOpenPgpPublicKey(node2Address)
    await node1.registerPeerOpenPgpPublicKey(node2Address, node2KeyViaNode1.publicKey)

    let encryptedChatReceived = false
    node2.on('message', (msg) => {
      if (msg.encrypted && msg.encryption === 'openpgp' && msg.body === 'Keep this between us') {
        encryptedChatReceived = true
      }
    })

    console.log('Sending encrypted one-to-one chat message...')
    await node1.sendEncryptedMessage(node2Address, 'Keep this between us')

    await waitFor(() => encryptedChatReceived, 10000, 'Timed out waiting for encrypted chat delivery')

    const secretTopic = 'xmpp-openpgp-secret'
    const secretKeyId = 'shared-secret-1'
    const secret = 'correct horse battery staple'
    await node1.setEncryptedPubSubSecret(secretTopic, secretKeyId, secret)
    await node2.setEncryptedPubSubSecret(secretTopic, secretKeyId, secret)
    await node1.subscribe(secretTopic)
    await node2.subscribe(secretTopic)

    const pubsub1 = (libp2p1.services as any).pubsub
    const pubsub2 = (libp2p2.services as any).pubsub
    await waitFor(async () => {
      const subscribers1 = pubsub1.getSubscribers(secretTopic).map((peer: any) => peer.toString())
      const subscribers2 = pubsub2.getSubscribers(secretTopic).map((peer: any) => peer.toString())
      return (
        subscribers1.includes(libp2p2.peerId.toString()) &&
        subscribers2.includes(libp2p1.peerId.toString())
      )
    }, 10000, 'Timed out waiting for encrypted pubsub subscribers to connect')

    let encryptedPubSubReceived = false
    node2.on('pubsub:message', (msg) => {
      if (msg.topic === secretTopic && msg.encrypted && msg.encryption === 'openpgp' && msg.body === 'Private pubsub item') {
        encryptedPubSubReceived = true
      }
    })

    console.log('Publishing encrypted pubsub item...')
    await node1.publishEncrypted(secretTopic, 'Private pubsub item', { keyId: secretKeyId, secret })
    await waitFor(() => encryptedPubSubReceived, 10000, 'Timed out waiting for encrypted pubsub delivery')

    console.log('Verifying OpenPGP key persistence across restart...')
    const node1PublicKey = await node1.getOpenPgpPublicKey()
    const node1FingerprintAfter = await node1.getOpenPgpFingerprint()
    if (node1FingerprintBefore !== node1FingerprintAfter) {
      throw new Error('OpenPGP fingerprint changed before restart check')
    }

    await node1.close()
    await libp2p1.stop()

    const restartedLibp2p1 = await createP2PNode(9801)
    await restartedLibp2p1.start()
    const restartedNode1 = new XmppNode(restartedLibp2p1, new NodeSqliteStorage(node1SqlitePath))
    await restartedNode1.ready

    const restartedFingerprint = await restartedNode1.getOpenPgpFingerprint()
    const restartedPublicKey = await restartedNode1.getOpenPgpPublicKey()
    if (restartedFingerprint !== node1FingerprintBefore) {
      throw new Error('OpenPGP fingerprint did not persist across restart')
    }
    if (restartedPublicKey !== node1PublicKey) {
      throw new Error('OpenPGP public key did not persist across restart')
    }

    await restartedNode1.close()
    await restartedLibp2p1.stop()

    console.log('\nOpenPGP Test Results:')
    console.log('  - Encrypted Chat Delivered: SUCCESS')
    console.log('  - Encrypted PubSub Delivered: SUCCESS')
    console.log('  - OpenPGP Key Persistence Across Restart: SUCCESS')
    console.log('\n>>> OPENPGP VERIFICATION SUCCESSFUL! <<<')
    return
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runOpenPgpTest().catch((err) => {
  console.error('OpenPGP test error:', err)
  process.exit(1)
})
