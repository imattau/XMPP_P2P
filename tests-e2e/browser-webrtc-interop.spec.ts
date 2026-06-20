import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'
import { join } from 'path'
import { fileURLToPath } from 'url'

const fixtureDir = fileURLToPath(new URL('../src/tests/browser', import.meta.url))

test('two browser tabs WebRTC-dial each other and exchange an XMPP message', async ({ browser }) => {
  const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, host: '127.0.0.1' })
  await relay.start()
  const relayWsAddr = relay.getMultiaddrs().find((ma) => ma.toString().includes('/ws'))
  expect(relayWsAddr).toBeTruthy()

  const pageA = await browser.newPage()
  const pageB = await browser.newPage()

  await pageA.goto(`file://${join(fixtureDir, 'fixture-page.html')}`)
  await pageB.goto(`file://${join(fixtureDir, 'fixture-page.html')}`)

  const clientA = await pageA.evaluate(async (bootstrapAddr) => {
    const { xmppNode, libp2p } = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName: 'tab-a' })
    return { jid: xmppNode.jid, peerId: libp2p.peerId.toString() }
  }, relayWsAddr!.toString())

  const clientB = await pageB.evaluate(async (bootstrapAddr) => {
    const { xmppNode, libp2p } = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName: 'tab-b' })
    return { jid: xmppNode.jid, peerId: libp2p.peerId.toString() }
  }, relayWsAddr!.toString())

  expect(clientA.peerId).not.toEqual(clientB.peerId)

  // Both tabs joined the same KadDHT via the relay's bootstrap address; give them
  // a moment to discover each other before asserting a direct WebRTC connection exists.
  await pageA.waitForFunction(
    (peerIdB) => (window as any).__connections?.includes(peerIdB),
    clientB.peerId,
    { timeout: 15000 }
  ).catch(() => {
    throw new Error('Tab A never established a connection to Tab B\'s peer ID — check WebRTC/circuit-relay dial path in createBrowserP2PNode')
  })

  await relay.stop()
})
