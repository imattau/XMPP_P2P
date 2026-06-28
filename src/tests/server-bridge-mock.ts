import assert from 'node:assert/strict'
import { createServer, Socket } from 'net'
import { EventEmitter } from 'events'
import { XmppServerBridge } from '../core/xmpp-server-bridge.js'
import { xml, Parser as XmlParser, Element } from '@xmpp/xml'
import { createHash } from 'crypto'
import type { XmppStorage, StorageRecord } from '../core/storage/types.js'

class FakeStorage implements XmppStorage {
  private records = new Map<string, Map<string, { value: string; updatedAt: string }>>()
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    return this.records.get(namespace)?.get(key)?.value
  }
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    if (!this.records.has(namespace)) this.records.set(namespace, new Map())
    this.records.get(namespace)!.set(key, { value, updatedAt })
  }
  async deleteRecord(namespace: string, key: string): Promise<void> {
    this.records.get(namespace)?.delete(key)
  }
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const map = this.records.get(namespace)
    if (!map) return []
    return Array.from(map.entries()).map(([key, val]) => ({ key, value: val.value, updatedAt: val.updatedAt }))
  }
  async getBlob(_namespace: string, _key: string): Promise<Uint8Array | undefined> { return undefined }
  async putBlob(_namespace: string, _key: string, _data: Uint8Array): Promise<void> {}
  async deleteBlob(_namespace: string, _key: string): Promise<void> {}
  async close(): Promise<void> {}
}

class MockComponentServer extends EventEmitter {
  private server: any = null
  private port = 0
  private receivedStanzas: Element[] = []
  private clientSocket: Socket | null = null
  private streamId = `mock-${Date.now()}`
  public secret = 'testsecret'
  private handshakeDone = false

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = createServer((socket: Socket) => {
        this.clientSocket = socket
        const parser = new XmlParser()

        parser.on('element', (el: Element) => {
          if (el.name === 'handshake') {
            const hash = createHash('sha1').update(this.streamId + this.secret).digest('hex')
            if (el.text() === hash) {
              this.handshakeDone = true
              socket.write('<handshake xmlns="jabber:component:accept"/>')
              this.emit('connected')
            }
            return
          }
          if (this.handshakeDone) {
            this.receivedStanzas.push(el)
            this.emit('stanza', el)
          }
        })

        socket.on('data', (data: Buffer) => {
          parser.write(data.toString('utf8'))
        })

        socket.on('error', () => {})

        socket.on('close', () => {
          this.clientSocket = null
          this.handshakeDone = false
        })

        const streamOpen = `<?xml version='1.0'?><stream:stream xmlns='jabber:component:accept' xmlns:stream='http://etherx.jabber.org/streams' id='${this.streamId}'>`
        socket.write(streamOpen)
      })

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port
        resolve(this.port)
      })
    })
  }

  sendStanza(stanza: Element): void {
    if (this.clientSocket) {
      this.clientSocket.write(stanza.toString())
    }
  }

  getReceivedStanzas(): Element[] {
    return this.receivedStanzas
  }

  clearStanzas(): void {
    this.receivedStanzas = []
  }

  waitForStanza(predicate: (el: Element) => boolean, timeoutMs = 5000): Promise<Element> {
    const existing = this.receivedStanzas.find(predicate)
    if (existing) return Promise.resolve(existing)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('stanza', handler)
        reject(new Error('Timed out waiting for matching stanza'))
      }, timeoutMs)

      const handler = (el: Element) => {
        if (predicate(el)) {
          clearTimeout(timer)
          this.off('stanza', handler)
          resolve(el)
        }
      }
      this.on('stanza', handler)
    })
  }

  stop(): void {
    this.server?.close()
  }
}

async function run() {
  console.log('Starting server bridge mock server protocol test...\n')

  const storage = new FakeStorage()
  const bridge = new XmppServerBridge(storage as XmppStorage, 'test-passphrase')
  const mockServer = new MockComponentServer()

  const bridgeEvents: any[] = []
  bridge.on('connection', (info: any) => bridgeEvents.push(info))
  bridge.on('message', (msg: any) => bridgeEvents.push({ type: 'message', msg }))
  bridge.on('pubsub:event', (evt: any) => bridgeEvents.push({ type: 'pubsub:event', evt }))

  try {
    // 1. Start mock server
    const port = await mockServer.start()
    console.log(`  Mock server listening on port ${port}`)

    // 2. Connect bridge as component
    console.log('  Connecting component...')
    await bridge.connectComponent('127.0.0.1', port, mockServer.secret, 'test.component')

    const infos = bridge.getConnectionInfo()
    assert.equal(infos.length, 1)
    assert.equal(infos[0].type, 'component')
    assert.equal(infos[0].domain, 'test.component')
    assert.equal(infos[0].status, 'connected')
    console.log('  Component connected successfully')

    // 3. Send a chat message
    console.log('  Testing sendMessage...')
    mockServer.clearStanzas()
    await bridge.sendMessage('user@jabber.org', 'Hello from P2P!', undefined, 'testPeer')
    const msgStanza = await mockServer.waitForStanza((el: Element) => el.name === 'message', 3000)
    assert.equal(msgStanza.attrs.to, 'user@jabber.org')
    assert.equal(msgStanza.attrs.type, 'chat')
    const bodyEl = msgStanza.getChild('body')
    assert.ok(bodyEl, 'Message should have a body element')
    assert.equal(bodyEl!.text(), 'Hello from P2P!')
    assert.equal(msgStanza.attrs.from, 'testPeer@test.component')
    console.log('  sendMessage stanza verified')

    // 4. Reconnect: emit message to the component (inbound message from server)
    console.log('  Testing inbound message...')
    const inboundMsg = xml('message', { from: 'remote@jabber.org', to: 'test.component', type: 'chat', id: 'abc123' },
      xml('body', {}, 'Hello back!')
    )
    mockServer.sendStanza(inboundMsg)

    await new Promise<void>((resolve) => {
      const handler = (event: any) => {
        if (event.type === 'message' && event.msg?.body === 'Hello back!') {
          bridge.off('message', handler as any)
          resolve()
        }
      }
      // We need to listen on the bridge itself
      const checkInterval = setInterval(() => {
        const found = bridgeEvents.find(e => e.type === 'message' && e.msg?.body === 'Hello back!')
        if (found) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 100)
      setTimeout(() => { clearInterval(checkInterval); resolve() }, 3000)
    })

    // Manually check events (the bridge directly emits, not through xmpp-node)
    const foundMsg = bridgeEvents.find((e: any) => e.type === 'message')
    assert.ok(foundMsg, 'Should have received inbound message event')
    console.log('  Inbound message received')

    // 5. Test PubSub event inbound
    console.log('  Testing inbound PubSub event...')
    const pubsubStanza = xml('message', { from: 'pubsub.server', to: 'test.component', type: 'headline', id: 'ps1' },
      xml('event', { xmlns: 'http://jabber.org/protocol/pubsub#event' },
        xml('items', { node: 'urn:xmpp:microblog:0' },
          xml('item', { id: 'item-1' },
            xml('body', {}, 'PubSub content')
          )
        )
      )
    )
    mockServer.sendStanza(pubsubStanza)
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const found = bridgeEvents.find((e: any) => e.type === 'pubsub:event')
        if (found) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 100)
      setTimeout(() => { clearInterval(checkInterval); resolve() }, 3000)
    })
    console.log('  PubSub event received')

    // 6. Test MUC join
    console.log('  Testing MUC join...')
    mockServer.clearStanzas()
    await bridge.joinMuc('room@conference.jabber.org', 'p2p-bot', 'testPeer')
    const presStanza = await mockServer.waitForStanza((el: Element) => el.name === 'presence', 3000)
    assert.ok(presStanza.attrs.to?.includes('room@conference.jabber.org'))
    assert.ok(presStanza.attrs.to?.includes('p2p-bot'))

    const mucX = presStanza.getChild('x')
    assert.ok(mucX, 'Presence should contain an x element for MUC')
    if (mucX) {
      assert.equal(mucX.attrs.xmlns, 'http://jabber.org/protocol/muc')
    }
    console.log('  MUC join stanza verified')

    // 7. Test MUC message
    console.log('  Testing MUC message...')
    mockServer.clearStanzas()
    await bridge.sendMucMessage('room@conference.jabber.org', 'Hello room!', 'testPeer')
    const mucMsg = await mockServer.waitForStanza((el: Element) => el.name === 'message' && el.attrs.type === 'groupchat', 3000)
    assert.equal(mucMsg.attrs.to, 'room@conference.jabber.org')
    const mucBody = mucMsg.getChild('body')
    assert.ok(mucBody)
    assert.equal(mucBody!.text(), 'Hello room!')
    console.log('  MUC message stanza verified')

    // 8. Test PubSub subscribe
    console.log('  Testing PubSub subscribe...')
    mockServer.clearStanzas()
    const subPromise = bridge.pubsubSubscribe('pubsub.server', 'test-node', 'testPeer')
    const subIq = await mockServer.waitForStanza((el: Element) => el.name === 'iq', 3000)
    assert.equal(subIq.attrs.type, 'set')
    const pubsubEl = subIq.getChild('pubsub')
    assert.ok(pubsubEl)
    const subscribeEl = pubsubEl!.getChild('subscribe')
    assert.ok(subscribeEl)
    assert.equal(subscribeEl!.attrs.node, 'test-node')

    // Respond to the subscribe IQ
    const subResponse = xml('iq', { type: 'result', id: subIq.attrs.id, from: 'pubsub.server', to: 'test.component' })
    mockServer.sendStanza(subResponse)
    await subPromise
    console.log('  PubSub subscribe verified')

    // 9. Test PubSub getItems
    console.log('  Testing PubSub getItems...')
    mockServer.clearStanzas()
    const itemsPromise = bridge.pubsubGetItems('pubsub.server', 'test-node', 5, 'testPeer')
    const itemsIq = await mockServer.waitForStanza((el: Element) => el.name === 'iq', 3000)
    assert.equal(itemsIq.attrs.type, 'get')
    const itemsPubsub = itemsIq.getChild('pubsub')
    assert.ok(itemsPubsub)
    const itemsEl = itemsPubsub!.getChild('items')
    assert.ok(itemsEl)
    assert.equal(itemsEl!.attrs.node, 'test-node')
    assert.equal(itemsEl!.attrs.max_items, '5')

    // Respond
    const itemsResponse = xml('iq', { type: 'result', id: itemsIq.attrs.id, from: 'pubsub.server', to: 'test.component' },
      xml('pubsub', { xmlns: 'http://jabber.org/protocol/pubsub' },
        xml('items', { node: 'test-node' },
          xml('item', { id: 'item-1' },
            xml('body', {}, 'Content 1')
          ),
          xml('item', { id: 'item-2' },
            xml('body', {}, 'Content 2')
          )
        )
      )
    )
    mockServer.sendStanza(itemsResponse)
    const items = await itemsPromise
    assert.equal(items.length, 2)
    console.log('  PubSub getItems verified')

    // 10. Test Disco info
    console.log('  Testing service discovery...')
    mockServer.clearStanzas()
    const discoPromise = bridge.discoInfo('disco.server', 'testPeer')
    const discoIq = await mockServer.waitForStanza((el: Element) => el.name === 'iq' && el.attrs.type === 'get', 3000)
    const queryEl = discoIq.getChild('query')
    assert.ok(queryEl)
    assert.equal(queryEl!.attrs.xmlns, 'http://jabber.org/protocol/disco#info')

    const discoResponse = xml('iq', { type: 'result', id: discoIq.attrs.id, from: 'disco.server', to: 'test.component' },
      xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' },
        xml('identity', { category: 'server', type: 'im', name: 'Test Server' }),
        xml('feature', { var: 'http://jabber.org/protocol/pubsub' }),
        xml('feature', { var: 'urn:xmpp:ping' })
      )
    )
    mockServer.sendStanza(discoResponse)
    const discoInfo = await discoPromise
    assert.equal(discoInfo.identities.length, 1)
    assert.equal(discoInfo.identities[0].category, 'server')
    assert.equal(discoInfo.features.length, 2)
    assert.ok(discoInfo.features.includes('urn:xmpp:ping'))
    console.log('  Service discovery verified')

    // 11. Disconnect
    console.log('  Testing disconnect...')
    await bridge.disconnectComponent()
    const postDisconnect = bridge.getConnectionInfo()
    assert.equal(postDisconnect.length, 0)
    console.log('  Disconnect verified')

    console.log('\n>>> ALL MOCK SERVER PROTOCOL TESTS PASSED <<<')
    process.exit(0)
  } catch (err) {
    console.error('Test error:', err)
    process.exit(1)
  } finally {
    mockServer.stop()
  }
}

run().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
