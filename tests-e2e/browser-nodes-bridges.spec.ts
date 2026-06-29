import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'
import { join } from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { createServer, type Server } from 'http'

const fixtureDir = fileURLToPath(new URL('../src/tests/browser', import.meta.url))
const wasmPath = fileURLToPath(new URL('../node_modules/libomemo.js/dist/curve25519_compiled.wasm', import.meta.url))

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
}

function serveFixture(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req: any, res: any) => {
      const urlPath = req.url === '/' ? '/fixture-page.html' : req.url!
      const filePath = join(fixtureDir, urlPath)
      try {
        const content = readFileSync(filePath)
        const ext = filePath.slice(filePath.lastIndexOf('.'))
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

test.describe('browser nodes and bridges', () => {
  test('P2P nodes and runtime bridge start and are operational', async ({ browser }) => {
    const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, host: '127.0.0.1' })
    await relay.start()
    const relayWsAddr = relay.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
    expect(relayWsAddr).toBeTruthy()
    const bootstrapAddr = relayWsAddr!.toString()

    const server = await serveFixture(0)
    const addr = server.address()!
    const port = typeof addr === 'object' ? addr.port : 0
    const baseUrl = `http://127.0.0.1:${port}`

    const page = await browser.newPage()
    await page.route('**/curve25519_compiled.wasm', async (route) => {
      await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
    })
    await page.goto(`${baseUrl}/`)

    const nodeA = await page.evaluate(async (addr) => {
      const { libp2p, xmppNode, bridge } = await (window as any).createBrowserXmppClient({
        bootstrapAddrs: [addr],
        dbName: 'test-bridge-a'
      })
      return {
        peerId: libp2p.peerId.toString(),
        jid: xmppNode.jid,
        bridgeOnWindow: !!(window as any).__XMPP_P2P_BRIDGE__,
        bridge: {
          isComponentConnected: bridge.isComponentConnected(),
          serverConnections: bridge.getServerConnections(),
          isFederationEnabled: bridge.isFederationEnabled(),
          methods: {
            onMessage: typeof bridge.onMessage === 'function',
            sendChatMessage: typeof bridge.sendChatMessage === 'function',
            publishFeed: typeof bridge.publishFeed === 'function',
            getFeedPosts: typeof bridge.getFeedPosts === 'function',
            getRosterEntries: typeof bridge.getRosterEntries === 'function',
            broadcastPresence: typeof bridge.broadcastPresence === 'function',
            connectComponent: typeof bridge.connectComponent === 'function',
            disconnectComponent: typeof bridge.disconnectComponent === 'function',
            disconnect: typeof bridge.disconnect === 'function',
            onConnectionChange: typeof bridge.onConnectionChange === 'function',
            onPresence: typeof bridge.onPresence === 'function',
            onFeedPost: typeof bridge.onFeedPost === 'function',
            setFeedBridge: typeof bridge.setFeedBridge === 'function',
            setMucBridge: typeof bridge.setMucBridge === 'function',
            getServerConnections: typeof bridge.getServerConnections === 'function',
          }
        }
      }
    }, bootstrapAddr)

    expect(nodeA.peerId).toBeTruthy()
    expect(nodeA.jid).toBe(`${nodeA.peerId}@p2p`)
    expect(nodeA.bridgeOnWindow).toBe(true)
    expect(nodeA.bridge.isComponentConnected).toBe(false)
    expect(nodeA.bridge.serverConnections).toEqual([])
    expect(nodeA.bridge.isFederationEnabled).toBe(true)

    const methods = nodeA.bridge.methods
    expect(methods.onMessage).toBe(true)
    expect(methods.sendChatMessage).toBe(true)
    expect(methods.publishFeed).toBe(true)
    expect(methods.getFeedPosts).toBe(true)
    expect(methods.getRosterEntries).toBe(true)
    expect(methods.broadcastPresence).toBe(true)
    expect(methods.connectComponent).toBe(true)
    expect(methods.disconnectComponent).toBe(true)
    expect(methods.disconnect).toBe(true)
    expect(methods.onConnectionChange).toBe(true)
    expect(methods.onPresence).toBe(true)
    expect(methods.onFeedPost).toBe(true)
    expect(methods.setFeedBridge).toBe(true)
    expect(methods.setMucBridge).toBe(true)

    const pageB = await browser.newPage()
    await pageB.route('**/curve25519_compiled.wasm', async (route) => {
      await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
    })
    await pageB.goto(`${baseUrl}/`)

    const nodeB = await pageB.evaluate(async (addr) => {
      const { libp2p } = await (window as any).createBrowserXmppClient({
        bootstrapAddrs: [addr],
        dbName: 'test-bridge-b'
      })
      return { peerId: libp2p.peerId.toString() }
    }, bootstrapAddr)

    expect(nodeB.peerId).toBeTruthy()
    expect(nodeB.peerId).not.toEqual(nodeA.peerId)

    await page.close()
    await pageB.close()
    await relay.stop()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})
