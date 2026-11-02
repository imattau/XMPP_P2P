import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'http'
import { readFileSync } from 'fs'
import { createP2PNode } from '../src/core/p2p.js'
import { join } from 'path'
import { fileURLToPath } from 'url'

const fixtureDir = fileURLToPath(new URL('../src/tests/browser', import.meta.url))
const wasmPath = fileURLToPath(new URL('../node_modules/libomemo.js/dist/curve25519_compiled.wasm', import.meta.url))

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
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

test('two browser tabs WebRTC-dial each other and exchange an XMPP message', async ({ browser }) => {
  const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
  await relay.start()
  const relayWsAddr = relay.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
  expect(relayWsAddr).toBeTruthy()
  const bootstrapAddr = relayWsAddr!.toString()

  const server = await serveFixture(0)
  const addr = server.address()!
  const port = typeof addr === 'object' ? addr.port : 0
  const baseUrl = `http://127.0.0.1:${port}`

  const pageA = await browser.newPage()
  const pageB = await browser.newPage()

  await pageA.route('**/curve25519_compiled.wasm', async (route) => {
    await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
  })
  await pageB.route('**/curve25519_compiled.wasm', async (route) => {
    await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
  })

  await pageA.goto(`${baseUrl}/`)
  await pageB.goto(`${baseUrl}/`)

  const clientA = await pageA.evaluate(async (bootstrapAddr) => {
    const { xmppNode, libp2p } = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName: 'tab-a' })
    return { jid: xmppNode.jid, peerId: libp2p.peerId.toString() }
  }, bootstrapAddr)

  const clientB = await pageB.evaluate(async (bootstrapAddr) => {
    const { xmppNode, libp2p } = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName: 'tab-b' })
    const peerId = libp2p.peerId.toString()
    const addresses = (window as any).__XMPP_P2P_BRIDGE__.getLocalPeerAddresses()
    return { jid: xmppNode.jid, peerId, addresses }
  }, bootstrapAddr)

  expect(clientA.peerId).not.toEqual(clientB.peerId)
  expect(clientB.addresses.length).toBeGreaterThan(0)

  // First contact uses the peer's advertised routable address.
  const messageBody = 'Hello from test!'
  await pageA.evaluate(async ({ targetPeerId, targetAddress, body }) => {
    const bridge = (window as any).__XMPP_P2P_BRIDGE__
    await bridge.sendChatMessage(
      { id: targetPeerId, type: 'direct', name: 'Test Peer', handle: targetAddress },
      body
    )
  }, { targetPeerId: clientB.peerId, targetAddress: clientB.addresses[0], body: messageBody })

  // Wait for Tab B to receive the message
  await pageB.waitForFunction(
    (expectedBody: string) =>
      (window as any).__receivedMessages?.some((m: any) => m.body === expectedBody),
    messageBody,
    { timeout: 10000 }
  ).catch(() => {
    throw new Error(`Tab B never received the message from Tab A (expected: "${messageBody}")`)
  })

  await pageA.waitForFunction(
    (peerIdB) => (window as any).__connections?.includes(peerIdB),
    clientB.peerId,
    { timeout: 5000 }
  ).catch(() => {
    throw new Error('Tab A delivered by another route but did not record a connection to Tab B')
  })

  // Verify received message details
  const received = await pageB.evaluate(() => (window as any).__receivedMessages?.[0])
  expect(received).toBeTruthy()
  expect(received.body).toBe(messageBody)

  await relay.stop()
})

test('onboarding saves a browser relay address for network startup', async ({ browser }) => {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    // Minimal disposable fixture identity satisfies the deep-link guard; it
    // contains no recovery phrase, private key, or account credentials.
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Browser Test', handle: 'browser-test', jid: 'test@p2p',
      publicProfile: false, recoveryPhrase: [], recoveryPhraseSaved: false,
      createdAt: new Date(0).toISOString(),
    }))
  })
  await page.goto('http://127.0.0.1:4173/onboarding/find-network')

  const address = '/dns4/relay.example/tcp/443/wss/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q'
  await page.getByLabel('Peer network relay address').fill('/dns4/relay.example/tcp/443/wss/http-path/ws/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q')
  await expect(page.getByRole('button', { name: 'Save relay' })).toBeDisabled()
  await page.getByLabel('Peer network relay address').fill(address)
  await expect(page.getByRole('button', { name: 'Save relay' })).toBeEnabled()
  await page.getByRole('button', { name: 'Save relay' }).click()

  await expect(page.getByText('Saved. The peer network will reconnect with this relay when setup is complete.')).toBeVisible()
  const savedAddresses = await page.evaluate(() => localStorage.getItem('xmpp-p2p:bootstrap-addrs'))
  expect(savedAddresses).toBe(JSON.stringify([address]))

  await page.close()
})

test('new chat accepts a shareable peer address and opens that peer conversation', async ({ browser }) => {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Browser Test', handle: 'browser-test', jid: 'test@p2p',
      publicProfile: false, recoveryPhrase: [], recoveryPhraseSaved: false,
      createdAt: new Date(0).toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date(0).toISOString() }))
  })
  await page.route('**/browser-bundle.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.XmppP2P = { createBrowserXmppClient: () => new Promise(() => {}) }',
  }))
  await page.goto('http://127.0.0.1:4173/chats/new')

  const address = '/dns4/relay.example/tcp/443/wss/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q/p2p-circuit/webrtc/p2p/12D3KooWJK5aG5cD9XQk3x8k4Y3h6dQ7bPq9uM8vJ2eR1sT'
  await page.getByLabel('Search contacts, enter a JID, or paste a peer address').fill(address)
  await page.getByRole('button', { name: /Start peer conversation/ }).click()

  await expect(page).toHaveURL(/\/chat\/.*\?address=/)
  const messageBox = page.getByRole('textbox', { name: /Message 12D3KooWJK5aG5cD9XQk3x8k4Y3h6dQ7bPq9uM8vJ2eR1sT/ })
  await expect(messageBox).toBeVisible()
  await page.evaluate(() => {
    const bridge = {
      getLocalJid: () => 'test@p2p',
      getConnectedPeers: () => [],
      isServerConnected: () => false,
      getRosterEntries: async () => [],
      broadcastPresence: async () => {},
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
      sendChatMessage: async (target: unknown) => {
        (window as any).__LAST_CHAT_TARGET__ = target
        return 'sent-from-browser-ui'
      },
    }
    ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
    window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'))
  })
  await expect(messageBox).toBeVisible()
  await messageBox.fill('First contact from the chat UI')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__LAST_CHAT_TARGET__)).toMatchObject({
    id: '12D3KooWJK5aG5cD9XQk3x8k4Y3h6dQ7bPq9uM8vJ2eR1sT@p2p',
    handle: '12D3KooWJK5aG5cD9XQk3x8k4Y3h6dQ7bPq9uM8vJ2eR1sT@p2p',
    peerAddress: address,
  })
  await expect(page.getByText('First contact from the chat UI')).toBeVisible()
  const chatPath = new URL(page.url()).pathname
  await page.goto(`http://127.0.0.1:4173${chatPath}`)
  await expect(messageBox).toBeVisible()
  await expect(page.getByText('First contact from the chat UI')).toBeVisible()
  await page.close()
})

test('settings relay change restarts the bridge with the saved address', async ({ browser }) => {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Browser Test', handle: 'browser-test', jid: 'test@p2p',
      publicProfile: false, recoveryPhrase: [], recoveryPhraseSaved: false,
      createdAt: new Date(0).toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date(0).toISOString() }))
  })
  await page.route('**/browser-bundle.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__BRIDGE_STARTS__ = 0;
      window.XmppP2P = { createBrowserXmppClient: async () => {
        window.__BRIDGE_STARTS__ += 1;
        const bridge = {
          getLocalJid: () => 'test@p2p',
          getConnectedPeers: () => [],
          broadcastPresence: async () => {},
          getServerConnections: () => [],
          getServerStatus: () => ({ online: false, connections: [] }),
          listSavedComponentConfigs: async () => [],
          onServerConnection: () => () => {},
          disconnect: async () => {
            delete window.__XMPP_P2P_BRIDGE__;
            window.dispatchEvent(new Event('xmpp-p2p:bridge-disconnected'));
          },
        };
        window.__XMPP_P2P_BRIDGE__ = bridge;
        window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'));
        return bridge;
      } };
    `,
  }))
  await page.goto('http://127.0.0.1:4173/settings')
  await expect(page.getByText('Discovery unavailable', { exact: true })).toBeVisible()
  const address = '/dns4/relay.example/tcp/443/wss/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q'
  await page.getByLabel('Peer network relay address').fill(address)
  await page.getByRole('button', { name: 'Save and reconnect' }).click()
  await page.waitForFunction(() => (window as any).__BRIDGE_STARTS__ === 2)
  await expect(page.getByText('Running · discovering peers')).toBeVisible()
  const savedAddresses = await page.evaluate(() => localStorage.getItem('xmpp-p2p:bootstrap-addrs'))
  expect(savedAddresses).toBe(JSON.stringify([address]))
  await page.close()
})

test('outbox retries preserve the saved route for a first-contact peer', async ({ browser }) => {
  const page = await browser.newPage()
  const peerId = '12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q'
  const address = `/dns4/relay.example/tcp/443/wss/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q/p2p-circuit/webrtc/p2p/${peerId}`
  await page.addInitScript(({ peerId, address }) => {
    const account = encodeURIComponent('test@p2p')
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Browser Test', handle: 'browser-test', jid: 'test@p2p',
      publicProfile: false, recoveryPhrase: [], recoveryPhraseSaved: false,
      createdAt: new Date(0).toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date(0).toISOString() }))
    localStorage.setItem(`xmpp-p2p:outbox:${account}`, JSON.stringify([{
      id: 'queued-first-contact', chatId: `${peerId}@p2p`, target: `${peerId}@p2p`,
      name: 'Test Peer', body: 'Queued before reconnect', timestamp: 1, encrypted: false,
      // Legacy queued messages have no peerAddress; the account-scoped address
      // book is the fallback required for these messages to route after restart.
    }]))
    localStorage.setItem(`xmpp-p2p:peer-addresses:${account}`, JSON.stringify({ [peerId]: address }))
  }, { peerId, address })
  await page.route('**/browser-bundle.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.XmppP2P = { createBrowserXmppClient: async () => {
      const bridge = {
        getLocalJid: () => 'test@p2p',
        getConnectedPeers: () => [],
        isServerConnected: () => false,
        getRosterEntries: async () => [],
        broadcastPresence: async () => {},
        onPresence: () => () => {},
        onConnectionChange: () => () => {},
        onServerConnection: () => () => {},
        onServerRosterChange: () => () => {},
        sendChatMessage: async (target, body) => {
          window.__OUTBOX_SEND__ = { target, body };
          return 'delivered-after-reconnect';
        },
      };
      window.__XMPP_P2P_BRIDGE__ = bridge;
      window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'));
      return bridge;
    } };`,
  }))
  await page.goto('http://127.0.0.1:4173/not-a-route')

  await page.waitForFunction(() => Boolean((window as any).__OUTBOX_SEND__))
  const result = await page.evaluate(() => (window as any).__OUTBOX_SEND__)
  expect(result.target).toMatchObject({
    id: `${peerId}@p2p`,
    handle: `${peerId}@p2p`,
    peerAddress: address,
  })
  expect(result.body).toBe('Queued before reconnect')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), 'xmpp-p2p:outbox:test%40p2p'))
    .toBe('[]')
  await page.close()
})

test('chat composer waits for file uploads before sending the message', async ({ browser }) => {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Browser Test', handle: 'browser-test', jid: 'test@p2p',
      publicProfile: false, recoveryPhrase: [], recoveryPhraseSaved: false,
      createdAt: new Date(0).toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date(0).toISOString() }))
    localStorage.setItem('xmpp-p2p:permissions', JSON.stringify({ photosAndFiles: true }))
    window.__XMPP_P2P_BRIDGE__ = {
      getLocalJid: () => 'test@p2p',
      getConnectedPeers: () => [],
      isServerConnected: () => false,
      getRosterEntries: async () => [],
      onPresence: () => () => {},
      onConnectionChange: () => () => {},
      onMessage: () => () => {},
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
      broadcastPresence: async () => {},
      queryChatHistory: async () => '',
      uploadFile: async () => new Promise((resolve) => {
        window.__UPLOAD_STARTED__ = true
        window.__RESOLVE_UPLOAD__ = () => resolve({ url: 'upload://test-cid', alt: 'note.txt', kind: 'file' })
      }),
      sendChatMessage: async (_target, body, options) => {
        window.__CHAT_SEND__ = { body, attachments: options?.attachments ?? [] }
        return 'chat-message-sent'
      },
    } as any
  })
  await page.goto('http://127.0.0.1:4173/chat/peer-test%40p2p')

  await page.getByRole('button', { name: 'Attach files' }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment') })
  await page.waitForFunction(() => Boolean((window as any).__UPLOAD_STARTED__))
  const messageBox = page.getByRole('textbox', { name: /Message peer-test/ })
  await messageBox.fill('Send with my file')
  const sendButton = page.getByRole('button', { name: 'Preparing attachments' })
  await expect(sendButton).toBeDisabled()
  await messageBox.press('Enter')
  await expect.poll(() => page.evaluate(() => (window as any).__CHAT_SEND__)).toBeUndefined()

  await page.evaluate(() => (window as any).__RESOLVE_UPLOAD__())
  const readySendButton = page.getByRole('button', { name: 'Send message' })
  await expect(readySendButton).toBeEnabled()
  await readySendButton.click()
  await expect.poll(() => page.evaluate(() => (window as any).__CHAT_SEND__)).toMatchObject({
    body: 'Send with my file',
    attachments: [{ url: 'upload://test-cid', alt: 'note.txt' }],
  })
  await page.close()
})
