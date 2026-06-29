import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { readDhtJson, writeDhtJson, mailboxKey, removeDhtKey } from '../core/xmpp-dht.js'

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, message: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(message)
}

async function runDhtMailboxTest() {
  console.log('Starting DHT mailbox + TTL verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-dht-mailbox-'))

  let libp2p1: any
  let libp2p2: any

  try {
    libp2p1 = await createP2PNode(9801, { enableDht: true, enableMdns: false })
    await libp2p1.start()
    const xmpp1 = new XmppNode(libp2p1, new NodeSqliteStorage(join(workDir, 'n1.sqlite')))

    libp2p2 = await createP2PNode(9802, { enableDht: true, enableMdns: false })
    await libp2p2.start()
    const xmpp2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'n2.sqlite')))

    await Promise.all([xmpp1.ready, xmpp2.ready])

    const addr1 = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1'))
    await libp2p2.dial(addr1)

    await waitFor(async () => {
      try { await libp2p2.peerRouting.findPeer(libp2p1.peerId); return true }
      catch { return false }
    }, 8000, 'DHT discovery failed')

    const peer2Id = libp2p2.peerId.toString()
    const testPayload = { test: 'mailbox-data', ts: Date.now() }
    const key = mailboxKey(peer2Id)

    console.log('Test 1: DHT write + read round-trip')
    await writeDhtJson(libp2p2, key, testPayload, 5000)
    const readBack: any = await readDhtJson(libp2p2, key)
    if (readBack?.test !== 'mailbox-data') throw new Error('DHT write/read round-trip failed')
    console.log('  PASS')

    console.log('Test 2: DHT TTL expiry')
    await new Promise(resolve => setTimeout(resolve, 6000))
    const expired: any = await readDhtJson(libp2p2, key)
    if (expired !== undefined) throw new Error('DHT TTL did not expire the key')
    console.log('  PASS')

    console.log('Test 3: DHT key removal')
    await writeDhtJson(libp2p2, key, { temp: true }, 60000)
    await removeDhtKey(libp2p2, key)
    const removed: any = await readDhtJson(libp2p2, key)
    if (removed !== undefined) throw new Error('removeDhtKey did not clear the value')
    console.log('  PASS')

    console.log('\n>>> DHT MAILBOX VERIFICATION SUCCESSFUL! <<<')
    return
  } finally {
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runDhtMailboxTest().catch((err) => {
  console.error('DHT mailbox test error:', err)
  process.exit(1)
})
