import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'
import { join } from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { createServer, type Server } from 'http'
import { WebSocketServer } from 'ws'

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
  test('browser XMPP client authenticates and disconnects against a local WebSocket server', async ({ browser }) => {
    const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
    await relay.start()
    const relayWsAddr = relay.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
    expect(relayWsAddr).toBeTruthy()
    const xmppServer = new WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: (protocols) => protocols.has('xmpp') ? 'xmpp' : false })
    await new Promise<void>((resolve) => xmppServer.once('listening', resolve))
    const address = xmppServer.address()
    if (!address || typeof address === 'string') throw new Error('Local XMPP WebSocket server did not bind')
    const service = `ws://127.0.0.1:${address.port}/xmpp-websocket`
    const frames: string[] = []
    let serverSocket: import('ws').WebSocket | undefined
    let xmppConnectionCount = 0
    const uploadedRequests: Array<{ method: string; authorization?: string; body?: string }> = []
    xmppServer.on('connection', (socket) => {
      xmppConnectionCount += 1
      serverSocket = socket
      let authenticated = false
      socket.on('message', (data) => {
        const frame = data.toString()
        frames.push(frame)
        if (frame.includes('<auth ')) {
          authenticated = true
          socket.send(`<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>`)
        } else if (frame.includes('<open ') && !authenticated) {
          socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='local' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>PLAIN</mechanism></mechanisms></stream:features>`)
        } else if (frame.includes('<open ') && authenticated) {
          socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='local' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><required/></bind></stream:features>`)
        } else if (frame.includes('<iq ') && frame.includes('http://jabber.org/protocol/disco#info')) {
          const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
          if (id) socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'><query xmlns='http://jabber.org/protocol/disco#info'><feature var='urn:xmpp:http:upload:0'/></query></iq>`)
        } else if (frame.includes('<iq ') && frame.includes('urn:xmpp:http:upload:0')) {
          const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
          if (id) socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'><slot xmlns='urn:xmpp:http:upload:0'><put url='https://uploads.example.test/put'><header name='Authorization'>Bearer test</header></put><get url='https://uploads.example.test/file'/></slot></iq>`)
        } else if (frame.includes('<iq ') && /\btype=['"]set['"]/.test(frame)) {
          const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
          if (id) socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><jid>alice@example.test/local</jid></bind></iq>`)
        }
      })
    })

    const page = await browser.newPage()
    const fixture = await serveFixture(0)
    const fixtureAddress = fixture.address()
    if (!fixtureAddress || typeof fixtureAddress === 'string') throw new Error('Browser fixture did not bind')
    try {
      await page.route('https://uploads.example.test/**', async (route) => {
        const request = route.request()
        uploadedRequests.push({
          method: request.method(),
          authorization: request.headers().authorization,
          ...(request.method() === 'PUT' ? { body: request.postData() ?? undefined } : {}),
        })
        if (request.method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, content-type',
          } })
        } else {
          await route.fulfill({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } })
        }
      })
      await page.route('**/curve25519_compiled.wasm', async (route) => {
        await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
      })
      await page.goto(`http://127.0.0.1:${fixtureAddress.port}/`)
      const operation = page.evaluate(async ({ serviceUrl, bootstrapAddr }) => {
        ;(window as any).__localXmppStage = 'initializing'
        const { libp2p, xmppNode, bridge } = await (window as any).createBrowserXmppClient({
          bootstrapAddrs: [bootstrapAddr],
          dbName: `local-xmpp-${crypto.randomUUID()}`,
        })
        let bridgeClosed = false
        try {
          ;(window as any).__localXmppPeerId = libp2p.peerId.toString()
          ;(window as any).__localXmppStage = 'connecting'
          let insecureEndpointRejected = false
          try {
            await bridge.connectServer('alice@example.test', 'local-test-password', 'ws://example.org/xmpp-websocket')
          } catch (error) {
            insecureEndpointRejected = error instanceof Error
              && error.message.includes('ws:// is only allowed for localhost')
          }
          let insecureRegistrationRejected = false
          try {
            await bridge.registerServer('alice@example.test', 'local-test-password', 'ws://example.org/xmpp-websocket')
          } catch (error) {
            insecureRegistrationRejected = error instanceof Error
              && error.message.includes('ws:// is only allowed for localhost')
          }
          await bridge.connectServer('alice@example.test', 'local-test-password', serviceUrl)
          ;(window as any).__localXmppStage = 'connected'
          const connected = bridge.isServerConnected()
          const status = bridge.getServerConnections()[0]
          const articlePayload = 'nexus-article:v1\n{"version":1,"id":"local-xmpp-article"}'
          const publishedArticleId = await bridge.publishServerMicroblog(articlePayload, {
            itemId: 'local-xmpp-article',
            title: 'A readable XMPP article',
            summary: 'Article summary',
            categories: ['XMPP'],
            author: 'Alice',
            displayContent: 'A readable XMPP article\n\nArticle preview text.',
            articlePayload,
          })
          const inboundMessage = new Promise((resolve) => {
            const unsubscribe = bridge.onMessage((message: any) => {
              if (message.body !== 'Hello from the XMPP server') return
              unsubscribe()
              resolve(message)
            })
          })
          const inboundOobMessage = new Promise((resolve) => {
            const unsubscribe = bridge.onMessage((message: any) => {
              if (!message.body.includes('incoming.png')) return
              unsubscribe()
              resolve(message)
            })
          })
          const inboundMicroblog = new Promise((resolve) => {
            const unsubscribe = bridge.onFeedPost((post: any) => {
              if (post.body !== 'A post from the XMPP server') return
              unsubscribe()
              resolve(post)
            })
          })
          const inboundSubscriptionRequest = new Promise((resolve) => {
            const unsubscribe = bridge.onServerPresenceSubscriptionRequest((request: any) => {
              if (request.jid !== 'bob@remote.test') return
              unsubscribe()
              resolve(request)
            })
          })
          const outboundId = await bridge.sendChatMessage(
            { id: 'bob@remote.test', type: 'direct', name: 'Bob', handle: 'bob@remote.test' },
            'Hello to the XMPP server'
          )
          let p2pUploadRejected = false
          try {
            await bridge.sendChatMessage(
              { id: 'bob@remote.test', type: 'direct', name: 'Bob', handle: 'bob@remote.test' },
              'See this file',
              { attachments: [{ id: 'upload://file-cid', url: 'upload://file-cid', alt: 'file.png', kind: 'image' }] }
            )
          } catch (error) {
            p2pUploadRejected = error instanceof Error && error.message.includes('cannot be opened by a standard XMPP contact')
          }
          const uploadedUrl = await bridge.uploadFile(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }), 'bob@remote.test')
          const attachmentMessageId = await bridge.sendChatMessage(
            { id: 'bob@remote.test', type: 'direct', name: 'Bob', handle: 'bob@remote.test' },
            'Here is the file',
            { attachments: [{ id: uploadedUrl.url, url: uploadedUrl.url, alt: uploadedUrl.alt, kind: uploadedUrl.kind }] }
          )
          ;(window as any).__localXmppStage = 'awaiting-inbound'
          const inbound = await inboundMessage
          const inboundOob = await inboundOobMessage
          const microblog = await inboundMicroblog
          const subscriptionRequest = await inboundSubscriptionRequest
          await bridge.approveServerPresenceSubscription(subscriptionRequest.jid)
          const reconnectedPromise = new Promise((resolve) => {
            const unsubscribe = bridge.onServerConnection((info: any) => {
              if (info.status !== 'connected') return
              unsubscribe()
              resolve(info)
            })
          })
          ;(window as any).__localXmppStage = 'awaiting-reconnect'
          const reconnectStatus = await reconnectedPromise
          const reconnected = bridge.isServerConnected()
          await bridge.disconnectServer()
          const disconnected = !bridge.isServerConnected()
          await bridge.disconnect()
          bridgeClosed = true
          ;(window as any).__localXmppStage = 'disconnected'
          return { connected, status, disconnected, reconnected, reconnectStatus, peerId: libp2p.peerId.toString(), publishedArticleId, outboundId, attachmentMessageId, uploadedUrl, inbound, inboundOob, microblog, subscriptionRequest, insecureEndpointRejected, insecureRegistrationRejected, p2pUploadRejected }
        } finally {
          ;(window as any).__localXmppStage = 'closing'
          if (!bridgeClosed) await xmppNode.close()
          if (!bridgeClosed) await libp2p.stop()
          ;(window as any).__localXmppStage = 'done'
        }
      }, { serviceUrl: service, bootstrapAddr: relayWsAddr!.toString() })
      await page.waitForFunction(() => (window as any).__localXmppStage === 'awaiting-inbound', undefined, { timeout: 10000 })
      const browserPeerId = await page.evaluate(() => (window as any).__localXmppPeerId)
      await expect.poll(() => relay.getConnections()
        .some((connection: any) => connection.remotePeer.toString() === browserPeerId)).toBe(true)
      expect(frames.some((frame) => /<message\b[^>]*\bto=['"]bob@remote\.test['"]/i.test(frame)
        && frame.includes('Hello to the XMPP server'))).toBe(true)
      if (!serverSocket || serverSocket.readyState !== serverSocket.OPEN) throw new Error('Local XMPP WebSocket disconnected before the inbound message')
      serverSocket.send(`<message xmlns='jabber:client' from='bob@remote.test/phone' to='alice@example.test/local' type='chat' id='remote-message-1'><body>Hello from the XMPP server</body></message>`)
      serverSocket.send(`<message xmlns='jabber:client' from='bob@remote.test/phone' to='alice@example.test/local' type='chat' id='remote-file-1'><x xmlns='jabber:x:oob'><url>https://uploads.example.test/incoming.png</url><desc>incoming.png</desc></x></message>`)
      serverSocket.send(`<message xmlns='jabber:client' from='bob@remote.test' to='alice@example.test/local'><event xmlns='http://jabber.org/protocol/pubsub#event'><items node='urn:xmpp:microblog:0'><item id='remote-post-1'><entry xmlns='http://www.w3.org/2005/Atom'><title>Remote microblog</title><content>A post from the XMPP server</content><author><name>Bob</name></author><published>2026-11-02T00:00:00Z</published></entry></item></items></event></message>`)
      serverSocket.send(`<presence xmlns='jabber:client' from='bob@remote.test/phone' to='alice@example.test/local' type='subscribe'/>`)
      await page.waitForFunction(() => (window as any).__localXmppStage === 'awaiting-reconnect', undefined, { timeout: 10000 })
      if (!serverSocket || serverSocket.readyState !== serverSocket.OPEN) throw new Error('Local XMPP WebSocket disconnected before the reconnect test')
      serverSocket.close()
      await page.waitForFunction(() => (window as any).__localXmppStage === 'done', undefined, { timeout: 10000 })
      const stage = await page.evaluate(() => (window as any).__localXmppStage)
      expect(stage, `WebSocket frames: ${JSON.stringify(frames)}`).toBe('done')
      const result = await operation
      expect(result.connected).toBe(true)
      expect(result.publishedArticleId).toBe('local-xmpp-article')
      expect(frames.some((frame) => frame.includes('A readable XMPP article')
        && frame.includes('urn:nexus:article:1')
        && frame.includes('Article preview text.'))).toBe(true)
      expect(result.reconnected).toBe(true)
      expect(result.reconnectStatus).toMatchObject({ status: 'connected' })
      expect(xmppConnectionCount).toBeGreaterThan(1)
      expect(result.status).toMatchObject({ domain: 'example.test', status: 'connected' })
      expect(result.subscriptionRequest).toEqual({ jid: 'bob@remote.test', server: 'remote.test' })
      expect(frames.some((frame) => /<iq\b[^>]*\btype=['"]set['"]/i.test(frame)
        && frame.includes('jabber:iq:roster') && frame.includes('bob@remote.test'))).toBe(true)
      expect(frames.some((frame) => /<presence\b[^>]*\btype=['"]subscribed['"]/i.test(frame)
        && frame.includes('bob@remote.test'))).toBe(true)
      expect(result.disconnected).toBe(true)
      expect(result.insecureEndpointRejected).toBe(true)
      expect(result.insecureRegistrationRejected).toBe(true)
      expect(result.p2pUploadRejected).toBe(true)
      expect(frames.some((frame) => frame.includes('upload://file-cid'))).toBe(false)
      expect(result.uploadedUrl.url).toBe('https://uploads.example.test/file')
      expect(result.attachmentMessageId).toBeTruthy()
      expect(uploadedRequests.some((request) => request.method === 'PUT' && request.authorization === 'Bearer test')).toBe(true)
      expect(frames.some((frame) => frame.includes('https://uploads.example.test/file')
        && frame.includes('jabber:x:oob') && frame.includes('<desc>photo.png</desc>'))).toBe(true)
      await expect.poll(() => relay.getConnections()
        .filter((connection: any) => connection.remotePeer.toString() === result.peerId).length).toBe(0)
      expect(result.outboundId).toBeTruthy()
      expect(result.inbound).toMatchObject({
        from: 'bob@remote.test/phone',
        to: 'alice@example.test/local',
        body: 'Hello from the XMPP server',
        id: 'remote-message-1',
      })
      expect(result.inboundOob).toMatchObject({
        from: 'bob@remote.test/phone',
        body: '![incoming.png](https://uploads.example.test/incoming.png)',
        id: 'remote-file-1',
      })
      expect(result.microblog).toMatchObject({
        topic: 'xmpp-pep:bob@remote.test',
        id: 'bob@remote.test:remote-post-1',
        body: 'A post from the XMPP server',
        author: 'Bob',
      })
      expect(frames.some((frame) => frame.includes('<auth ') && frame.includes('mechanism="PLAIN"'))).toBe(true)
      expect(frames.some((frame) => frame.includes('<iq ') && frame.includes('xmpp-bind'))).toBe(true)
    } finally {
      await page.close()
      await new Promise<void>((resolve) => fixture.close(() => resolve()))
      await new Promise<void>((resolve) => xmppServer.close(() => resolve()))
      await relay.stop()
    }
  })

  test('browser XMPP client registers an account and then authenticates against a local WebSocket server', async ({ browser }) => {
    const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
    await relay.start()
    const relayWsAddr = relay.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
    expect(relayWsAddr).toBeTruthy()
    const xmppServer = new WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: (protocols) => protocols.has('xmpp') ? 'xmpp' : false })
    await new Promise<void>((resolve) => xmppServer.once('listening', resolve))
    const address = xmppServer.address()
    if (!address || typeof address === 'string') throw new Error('Local XMPP WebSocket server did not bind')
    const service = `ws://127.0.0.1:${address.port}/xmpp-websocket`
    const frames: string[] = []
    let connectionIndex = 0
    xmppServer.on('connection', (socket) => {
      const thisConnection = connectionIndex++
      let authenticated = false
      socket.on('message', (data) => {
        const frame = data.toString()
        frames.push(frame)
        if (thisConnection === 0) {
          if (frame.includes('<open ')) {
            socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='registration' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><register xmlns='http://jabber.org/features/iq-register'/></stream:features>`)
          } else if (/\bid=['"]reg-1['"]/.test(frame)) {
            socket.send(`<iq xmlns='jabber:client' type='result' id='reg-1'><query xmlns='jabber:iq:register'><x xmlns='jabber:x:data' type='form'><field var='FORM_TYPE' type='hidden'><value>jabber:iq:register</value></field><field var='username' type='text-single'><required/></field><field var='password' type='text-private'><required/></field><field var='email' type='text-single'><required/></field></x></query></iq>`)
          } else if (/\bid=['"]reg-2['"]/.test(frame)) {
            socket.send(`<iq xmlns='jabber:client' type='result' id='reg-2'/>`)
          }
          return
        }

        if (frame.includes('<auth ')) {
          authenticated = true
          socket.send(`<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>`)
        } else if (frame.includes('<open ') && !authenticated) {
          socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='login' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>PLAIN</mechanism></mechanisms></stream:features>`)
        } else if (frame.includes('<open ') && authenticated) {
          socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='bound' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><required/></bind></stream:features>`)
        } else if (frame.includes('<iq ') && /\btype=['"]set['"]/.test(frame)) {
          const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
          if (id && frame.includes('xmpp-bind')) {
            socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><jid>newuser@example.test/local</jid></bind></iq>`)
          } else if (id) {
            socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'/>`)
          }
        }
      })
    })

    const page = await browser.newPage()
    const fixture = await serveFixture(0)
    const fixtureAddress = fixture.address()
    if (!fixtureAddress || typeof fixtureAddress === 'string') throw new Error('Browser fixture did not bind')
    try {
      await page.route('**/curve25519_compiled.wasm', async (route) => {
        await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
      })
      await page.goto(`http://127.0.0.1:${fixtureAddress.port}/`)
      const result = await page.evaluate(async ({ serviceUrl, bootstrapAddr }) => {
        const { libp2p, xmppNode, bridge } = await (window as any).createBrowserXmppClient({
          bootstrapAddrs: [bootstrapAddr],
          dbName: `local-xmpp-register-${crypto.randomUUID()}`,
        })
        try {
          await bridge.registerServer('newuser@example.test', 'local-test-password', serviceUrl, { email: 'tester@example.test' })
          const connected = bridge.isServerConnected()
          const status = bridge.getServerConnections()[0]
          await bridge.disconnectServer()
          await bridge.disconnect()
          return { connected, status }
        } finally {
          await xmppNode.close().catch(() => {})
          await libp2p.stop().catch(() => {})
        }
      }, { serviceUrl: service, bootstrapAddr: relayWsAddr!.toString() })

      expect(connectionIndex).toBe(2)
      expect(frames.some((frame) => frame.includes("to='example.test'") && frame.includes('xmpp-framing'))).toBe(true)
      expect(frames.some((frame) => frame.includes("id='reg-1'") && frame.includes("type='get'") && frame.includes('jabber:iq:register'))).toBe(true)
      expect(frames.some((frame) => frame.includes("id='reg-1'") && frame.includes("xmlns='jabber:client'"))).toBe(true)
      const dataFormSubmission = frames.find((frame) => /\bid=['"]reg-2['"]/.test(frame))
      expect(dataFormSubmission, `Registration submission frame: ${dataFormSubmission ?? 'missing'}; all frames: ${JSON.stringify(frames)}`).toBeTruthy()
      expect(dataFormSubmission).toContain('jabber:x:data')
      expect(dataFormSubmission).toContain('submit')
      expect(dataFormSubmission).toContain('FORM_TYPE')
      expect(dataFormSubmission).toContain('jabber:iq:register')
      expect(dataFormSubmission).toContain('xmlns="jabber:client"')
      expect(dataFormSubmission).toContain('newuser')
      expect(dataFormSubmission).toContain('local-test-password')
      expect(dataFormSubmission).toContain('tester@example.test')
      expect(result.connected).toBe(true)
      expect(result.status).toMatchObject({ domain: 'example.test', status: 'connected' })
    } finally {
      await page.close()
      await new Promise<void>((resolve) => fixture.close(() => resolve()))
      await new Promise<void>((resolve) => xmppServer.close(() => resolve()))
      await relay.stop()
    }
  })

  test('P2P nodes and runtime bridge start and are operational', async ({ browser }) => {
    const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
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
            getServerConnections: typeof bridge.getServerConnections === 'function',
            getLocalPeerAddresses: typeof bridge.getLocalPeerAddresses === 'function',
            getConnectedPeers: typeof bridge.getConnectedPeers === 'function',
          }
        }
      }
    }, bootstrapAddr)

    expect(nodeA.peerId).toBeTruthy()
    expect(nodeA.jid).toBe(`${nodeA.peerId}@p2p`)
    expect(nodeA.bridgeOnWindow).toBe(true)
    expect(nodeA.bridge.isComponentConnected).toBe(false)
    expect(nodeA.bridge.serverConnections).toEqual([])

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
    expect(methods.getLocalPeerAddresses).toBe(true)
    expect(methods.getConnectedPeers).toBe(true)

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

  test('browser storage stays private between peer identities and restores with the same phrase', async ({ browser }) => {
    const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
    await relay.start()
    const relayWsAddr = relay.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
    expect(relayWsAddr).toBeTruthy()
    const server = await serveFixture(0)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Browser fixture did not bind')
    const page = await browser.newPage()
    try {
      await page.route('**/curve25519_compiled.wasm', async (route) => {
        await route.fulfill({ body: readFileSync(wasmPath), contentType: 'application/wasm' })
      })
      await page.goto(`http://127.0.0.1:${address.port}/`)
      const result = await page.evaluate(async (bootstrapAddr) => {
        const dbName = `identity-scope-${crypto.randomUUID()}`
        const phraseA = Array(12).fill('abandon')
        const phraseB = Array(12).fill('ability')
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName, 2)
          request.onupgradeneeded = () => {
            const db = request.result
            const records = db.createObjectStore('records', { keyPath: ['namespace', 'key'] })
            records.createIndex('namespace_idx', 'namespace', { unique: false })
            db.createObjectStore('blobs', { keyPath: ['namespace', 'key'] })
          }
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(['records', 'blobs'], 'readwrite')
            transaction.objectStore('records').put({ namespace: 'legacy-test', key: 'record', value: 'legacy-record', updatedAt: new Date().toISOString() })
            transaction.objectStore('blobs').put({ namespace: 'legacy-test', key: 'blob', data: new Uint8Array([9, 8, 7]) })
            transaction.oncomplete = () => { db.close(); resolve() }
            transaction.onerror = () => reject(transaction.error)
          }
        })
        const first = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName, recoveryPhrase: phraseA })
        const firstPeerId = first.libp2p.peerId.toString()
        const legacyRecord = await first.xmppNode.storage.getRecord('legacy-test', 'record')
        const legacyBlob = await first.xmppNode.storage.getBlob('legacy-test', 'blob')
        await first.xmppNode.storage.putRecord('identity-scope-test', 'private-record', 'account-a', new Date().toISOString())
        await first.xmppNode.storage.putBlob('identity-scope-test', 'private-blob', new Uint8Array([11, 22, 33]))
        await first.bridge.disconnect()

        const second = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName, recoveryPhrase: phraseB })
        const secondPeerId = second.libp2p.peerId.toString()
        const secondRecord = await second.xmppNode.storage.getRecord('identity-scope-test', 'private-record')
        const secondBlob = await second.xmppNode.storage.getBlob('identity-scope-test', 'private-blob')
        await second.bridge.disconnect()

        const restored = await (window as any).createBrowserXmppClient({ bootstrapAddrs: [bootstrapAddr], dbName, recoveryPhrase: phraseA })
        const restoredRecord = await restored.xmppNode.storage.getRecord('identity-scope-test', 'private-record')
        const restoredBlob = await restored.xmppNode.storage.getBlob('identity-scope-test', 'private-blob')
        await restored.bridge.disconnect()
        return { firstPeerId, secondPeerId, legacyRecord, legacyBlob: Array.from(legacyBlob ?? []), secondRecord, secondBlob: Array.from(secondBlob ?? []), restoredRecord, restoredBlob: Array.from(restoredBlob ?? []) }
      }, relayWsAddr!.toString())

      expect(result.firstPeerId).not.toBe(result.secondPeerId)
      expect(result.legacyRecord).toBe('legacy-record')
      expect(result.legacyBlob).toEqual([9, 8, 7])
      expect(result.secondRecord).toBeUndefined()
      expect(result.secondBlob).toEqual([])
      expect(result.restoredRecord).toBe('account-a')
      expect(result.restoredBlob).toEqual([11, 22, 33])
    } finally {
      await page.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await relay.stop()
    }
  })
})
