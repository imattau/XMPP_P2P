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

  // Tab A sends an XMPP message to Tab B
  const messageBody = 'Hello from test!'
  await pageA.evaluate(async ({ targetPeerId, body }) => {
    const bridge = (window as any).__XMPP_P2P_BRIDGE__
    await bridge.sendMessage(
      { id: targetPeerId, type: 'direct', name: 'Test Peer', handle: `${targetPeerId}@p2p` },
      body
    )
  }, { targetPeerId: clientB.peerId, body: messageBody })

  // Wait for Tab B to receive the message
  await pageB.waitForFunction(
    (expectedBody: string) =>
      (window as any).__receivedMessages?.some((m: any) => m.body === expectedBody),
    messageBody,
    { timeout: 10000 }
  ).catch(() => {
    throw new Error(`Tab B never received the message from Tab A (expected: "${messageBody}")`)
  })

  // Verify received message details
  const received = await pageB.evaluate(() => (window as any).__receivedMessages?.[0])
  expect(received).toBeTruthy()
  expect(received.body).toBe(messageBody)

  await relay.stop()
})
