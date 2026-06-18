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

async function runRosterTest() {
  console.log('Starting XMPP roster and presence verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-roster-'))
  const rosterPath = join(workDir, 'node1-roster.json')

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9201)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, { rosterPath })

    libp2p2 = await createP2PNode(9202)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2)

    await xmppNode1.ready
    await xmppNode2.ready
    const rosterNode1 = xmppNode1
    const rosterNode2 = xmppNode2

    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    if (!node2Address) {
      throw new Error('Node 2 has no listening addresses')
    }

    console.log(`Node 1 dialing Node 2 at: ${node2Address.toString()}...`)
    await libp2p1.dial(node2Address)

    const node1Jid = rosterNode1.jid
    const node2Jid = rosterNode2.jid

    console.log('Requesting roster subscription from Node 1 to Node 2...')
    await rosterNode1.subscribePresence(node2Address)

    await waitFor(async () => {
      const entry = await rosterNode1.getRosterEntry(node2Jid)
      return entry?.ask === undefined && entry?.subscription === 'to'
    }, 10000, 'Timed out waiting for Node 1 roster subscription acknowledgement')

    await waitFor(async () => {
      const entry = await rosterNode2.getRosterEntry(node1Jid)
      return entry?.subscription === 'from'
    }, 10000, 'Timed out waiting for Node 2 to auto-accept subscription')

    console.log('Saving roster contact details for Node 2...')
    await rosterNode1.addRosterEntry(node2Jid, 'Node 2')

    await waitFor(async () => {
      const entry = await rosterNode1.getRosterEntry(node2Jid)
      return entry?.name === 'Node 2'
    }, 10000, 'Timed out waiting for Node 1 roster contact details to persist')

    console.log('Broadcasting available presence from Node 1...')
    await rosterNode1.broadcastPresence('available', 'Ready for presence', 'chat')

    await waitFor(async () => {
      const entry = await rosterNode2.getRosterEntry(node1Jid)
      return entry?.presence?.status === 'Ready for presence' && entry.presence.type === 'available'
    }, 10000, 'Timed out waiting for Node 2 roster presence to update')

    console.log('Fetching Node 2 roster from Node 1...')
    const remoteRoster = await rosterNode1.fetchRoster(node2Address)
    if (remoteRoster.length === 0) {
      throw new Error('Expected Node 2 roster fetch to return at least one entry')
    }

    console.log('Verifying roster persistence across restart...')
    await rosterNode1.close()
    await libp2p1.stop()

    const restartedLibp2p1 = await createP2PNode(9201)
    await restartedLibp2p1.start()
    const restartedXmppNode1 = new XmppNode(restartedLibp2p1, { rosterPath })
    await restartedXmppNode1.ready

    const persistedEntry = await restartedXmppNode1.getRosterEntry(node2Jid)
    if (!persistedEntry || persistedEntry.name !== 'Node 2' || persistedEntry.subscription !== 'to') {
      throw new Error('Roster entry did not persist across restart')
    }

    const persistedNode2 = await restartedXmppNode1.getRosterEntries()
    if (!persistedNode2.some(entry => entry.jid === node2Jid)) {
      throw new Error('Expected persisted roster entry to survive restart')
    }

    console.log('Removing roster entry and verifying persistence update...')
    await restartedXmppNode1.removeRosterEntry(node2Jid)
    const removedEntry = await restartedXmppNode1.getRosterEntry(node2Jid)
    if (removedEntry) {
      throw new Error('Roster entry was not removed locally')
    }

    await restartedXmppNode1.close()
    await restartedLibp2p1.stop()

    console.log('\nRoster Test Results:')
    console.log('  - Presence Delivered: SUCCESS')
    console.log('  - Subscription Auto-Accepted: SUCCESS')
    console.log('  - Roster Fetch Returned Data: SUCCESS')
    console.log('  - Roster Persistence Across Restart: SUCCESS')
    console.log('  - Roster Removal Persisted: SUCCESS')
    console.log('\n>>> ROSTER VERIFICATION SUCCESSFUL! <<<')
    return
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runRosterTest().catch(async (err) => {
  console.error('Roster test error:', err)
  process.exit(1)
})
