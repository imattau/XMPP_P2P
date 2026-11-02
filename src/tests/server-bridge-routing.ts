import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { xml } from '@xmpp/client'
import { XmppNode } from '../core/xmpp-node.js'
import { XmppClientBridge } from '../core/xmpp-client-bridge.js'
import { BrowserXmppRuntimeBridge } from '../bridge/browser-runtime.js'

type BridgeStub = {
  isConnected: boolean
  connectionInfo: { domain: string }
  sendMessage: (to: string, body: string, options: { type: string; thread?: string }) => Promise<string>
}

const callSendMessage = (clientBridge: BridgeStub, to: string, body: string, options: any = {}) =>
  XmppNode.prototype.sendMessage.call({ clientBridge }, to, body, options) as Promise<string>

async function main() {
  const sent: Array<{ to: string; body: string; options: any }> = []
  const bridge: BridgeStub = {
    isConnected: true,
    connectionInfo: { domain: 'home.example' },
    async sendMessage(to, body, options) {
      sent.push({ to, body, options })
      return 'server-message-1'
    }
  }

  const id = await callSendMessage(bridge, 'alice@remote.example', 'Federated hello', { thread: 'thread-1' })
  assert.equal(id, 'server-message-1')
  assert.deepEqual(sent, [{
    to: 'alice@remote.example',
    body: 'Federated hello',
    options: { type: 'chat', thread: 'thread-1' }
  }])

  const wireBridge = new XmppClientBridge()
  ;(wireBridge as any).status = 'connected'
  const sentStanzas: any[] = []
  ;(wireBridge as any).client = { async send(stanza: any) { sentStanzas.push(stanza) } }
  const wireMessageId = await wireBridge.sendMessage('alice@remote.example', 'Federated hello', {
    originId: 'origin-123',
    requestReceipt: true,
    thread: 'thread-1',
    replace: 'previous-message',
  })
  assert.equal(wireMessageId, 'origin-123')
  assert.equal(sentStanzas.length, 1)
  assert.equal(sentStanzas[0].attrs.to, 'alice@remote.example')
  assert.equal(sentStanzas[0].attrs.type, 'chat')
  assert.equal(sentStanzas[0].attrs.id, 'origin-123')
  assert.equal(sentStanzas[0].getChild('body')?.text(), 'Federated hello')
  assert.equal(sentStanzas[0].getChild('request', 'urn:xmpp:receipts')?.name, 'request')
  assert.equal(sentStanzas[0].getChild('thread')?.text(), 'thread-1')
  assert.equal(sentStanzas[0].getChild('replace', 'urn:xmpp:message-correct:0')?.attrs.id, 'previous-message')

  bridge.isConnected = false
  await assert.rejects(
    callSendMessage(bridge, 'alice@remote.example', 'Unavailable'),
    /Server bridge is not connected/
  )

  const clientBridge = new XmppClientBridge()
  ;(clientBridge as any).domain = 'home.example'
  let rejectedMessage: any
  clientBridge.on('message', (message) => { rejectedMessage = message })
  ;(clientBridge as any).handleMessage(xml('message', {
    from: 'home.example',
    to: 'nexus@home.example',
    type: 'error',
    id: 'rejected-message-1',
  }, xml('error', { type: 'cancel' },
    xml('service-unavailable', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' }),
    xml('text', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' }, 'Recipient unavailable')
  )))
  assert.deepEqual(rejectedMessage, {
    from: 'home.example',
    to: 'nexus@home.example',
    body: '',
    id: 'rejected-message-1',
    type: 'error',
    server: 'home.example',
    stanzaError: { condition: 'service-unavailable', text: 'Recipient unavailable' },
  })

  const receiptBridge = new XmppClientBridge()
  const receiptStanzas: any[] = []
  let receivedMessage: any
  let deliveryReceipt: any
  ;(receiptBridge as any).domain = 'home.example'
  ;(receiptBridge as any).client = { async send(stanza: any) { receiptStanzas.push(stanza) } }
  receiptBridge.on('message', (message) => {
    if (message.receipt?.type === 'request') receivedMessage = message
    if (message.receipt?.type === 'received') deliveryReceipt = message
  })
  ;(receiptBridge as any).handleMessage(xml('message', {
    from: 'alice@remote.example/phone',
    to: 'nexus@home.example/browser',
    type: 'chat',
    id: 'remote-message-1',
  }, xml('body', {}, 'Hello'), xml('request', { xmlns: 'urn:xmpp:receipts' })))
  assert.equal(receivedMessage.id, 'remote-message-1')
  assert.deepEqual(receivedMessage.receipt, { type: 'request', id: 'remote-message-1' })
  assert.equal(receiptStanzas.length, 1, 'the client should acknowledge a requested delivery receipt')
  assert.equal(receiptStanzas[0].attrs.to, 'alice@remote.example/phone')
  assert.equal(receiptStanzas[0].getChild('received', 'urn:xmpp:receipts')?.attrs.id, 'remote-message-1')
  ;(receiptBridge as any).handleMessage(xml('message', {
    from: 'alice@remote.example/phone',
    to: 'nexus@home.example/browser',
    type: 'chat',
  }, xml('received', { xmlns: 'urn:xmpp:receipts', id: 'local-message-1' })))
  assert.deepEqual(deliveryReceipt.receipt, { type: 'received', id: 'local-message-1' })

  const pubsubBridge = new EventEmitter()
  let importedServerPost: any
  let importedServerPostOptions: any
  const nodeEventEmitter = new EventEmitter()
  ;(XmppNode.prototype as any).forwardClientBridgeEvents.call({
    clientBridge: pubsubBridge,
    emit: nodeEventEmitter.emit.bind(nodeEventEmitter),
    feedManager: {
      async recordFeedPost(post: any, options: any) {
        importedServerPost = post
        importedServerPostOptions = options
        return true
      },
    },
  })
  pubsubBridge.emit('pubsub:event', {
    node: 'urn:xmpp:microblog:0',
    itemId: 'server-item-42',
    from: 'alice@remote.example/phone',
    payload: {
      entry: xml('entry', { xmlns: 'http://www.w3.org/2005/Atom' },
        xml('title', {}, 'Server post'),
        xml('content', { type: 'text' }, 'A post from XMPP PEP'),
        xml('category', { term: 'xmpp' }),
      ),
    },
  })
  assert.equal(importedServerPost.id, 'alice@remote.example:server-item-42')
  assert.equal(importedServerPost.topic, 'xmpp-pep:alice@remote.example')
  assert.equal(importedServerPost.body, 'A post from XMPP PEP')
  assert.deepEqual(importedServerPost.categories, ['xmpp'])
  assert.deepEqual(importedServerPostOptions, { propagateToCollections: false, updateExisting: true })

  let roomEvent: any
  let ordinaryMessage: any
  const sentRoomStanzas: any[] = []
  ;(clientBridge as any).client = {
    jid: { local: 'nexus' },
    async send(stanza: any) { sentRoomStanzas.push(stanza) },
  }
  await clientBridge.joinMuc('lobby@conference.home.example', 'nexus')
  const roomMessageId = await clientBridge.sendMucMessage('lobby@conference.home.example', 'Hello room', {
    originId: 'room-message-2',
    thread: 'topic-1',
  })
  await clientBridge.leaveMuc('lobby@conference.home.example', 'nexus')
  assert.equal(roomMessageId, 'room-message-2')
  assert.equal(sentRoomStanzas[0].attrs.to, 'lobby@conference.home.example/nexus')
  assert.equal(sentRoomStanzas[0].getChild('x', 'http://jabber.org/protocol/muc')?.name, 'x')
  assert.equal(sentRoomStanzas[1].attrs.type, 'groupchat')
  assert.equal(sentRoomStanzas[1].attrs.to, 'lobby@conference.home.example')
  assert.equal(sentRoomStanzas[1].getChild('body')?.text(), 'Hello room')
  assert.equal(sentRoomStanzas[1].getChild('thread')?.text(), 'topic-1')
  assert.equal(sentRoomStanzas[2].attrs.type, 'unavailable')

  const archiveBridge = new XmppClientBridge()
  ;(archiveBridge as any).status = 'connected'
  const archiveQueries: any[] = []
  ;(archiveBridge as any).client = {
    jid: { local: 'nexus', toString: () => 'nexus@home.example/resource' },
    async send(stanza: any) {
      archiveQueries.push(stanza)
      const id = stanza.attrs.id
      ;(archiveBridge as any).handleStanza(xml('iq', { type: 'result', id },
        xml('fin', { xmlns: 'urn:xmpp:mam:2', complete: 'true' })
      ))
    },
  }
  await archiveBridge.queryMucMamHistory('lobby@conference.home.example')
  await archiveBridge.queryMamHistory('alice@remote.example')
  await archiveBridge.queryMucMamHistory('lobby@conference.home.example', 'first-message-on-current-page')
  const roomArchiveQuery = archiveQueries[0].getChild('query', 'urn:xmpp:mam:2')
  const userArchiveQuery = archiveQueries[1].getChild('query', 'urn:xmpp:mam:2')
  const olderRoomArchiveQuery = archiveQueries[2].getChild('query', 'urn:xmpp:mam:2')
  assert.equal(archiveQueries[0].attrs.to, 'lobby@conference.home.example')
  assert.equal(roomArchiveQuery.getChild('x', 'jabber:x:data'), undefined, 'room archives are queried on the room JID without a user "with" filter')
  assert.equal(archiveQueries[1].attrs.to, undefined)
  assert.equal(userArchiveQuery.getChild('x', 'jabber:x:data')?.getChild('field')?.attrs.var, 'FORM_TYPE')
  assert.equal(userArchiveQuery.getChild('x', 'jabber:x:data')?.children.find((child: any) => child.attrs?.var === 'with')?.getChild('value')?.text(), 'alice@remote.example')
  assert.equal(olderRoomArchiveQuery.getChild('set', 'http://jabber.org/protocol/rsm')?.getChild('max')?.text(), '50')
  assert.equal(olderRoomArchiveQuery.getChild('set', 'http://jabber.org/protocol/rsm')?.getChild('before')?.text(), 'first-message-on-current-page')

  const discoveryBridge = new XmppClientBridge()
  ;(discoveryBridge as any).status = 'connected'
  ;(discoveryBridge as any).domain = 'home.example'
  ;(discoveryBridge as any).discoInfo = async (jid: string) => jid === 'conference.home.example'
    ? { identities: [{ category: 'conference', type: 'text', name: 'Public rooms' }], features: ['http://jabber.org/protocol/muc'] }
    : { identities: [], features: [] }
  ;(discoveryBridge as any).discoItems = async (jid: string) => jid === 'home.example'
    ? { items: [{ jid: 'conference.home.example', name: 'Conferences' }] }
    : { items: [
        { jid: 'lobby@conference.home.example', name: 'Lobby' },
        { jid: 'support@conference.home.example' },
        { jid: 'not-a-room' },
      ] }
  assert.deepEqual(await discoveryBridge.discoverMucRooms(), [
    { roomJid: 'lobby@conference.home.example', name: 'Lobby', serviceJid: 'conference.home.example' },
    { roomJid: 'support@conference.home.example', name: 'support', serviceJid: 'conference.home.example' },
  ])

  clientBridge.on('muc:message', (message) => { roomEvent = message })
  clientBridge.on('message', (message) => { ordinaryMessage = message })
  ;(clientBridge as any).handleMessage(xml('message', {
    from: 'lobby@conference.home.example/nexus',
    type: 'groupchat',
    id: 'room-message-1',
  }, xml('body', {}, 'Hello room')))
  assert.equal(roomEvent.room, 'lobby@conference.home.example')
  assert.equal(roomEvent.nick, 'nexus')
  assert.equal(roomEvent.fromSelf, true)
  assert.equal(roomEvent.body, 'Hello room')
  assert.equal(ordinaryMessage, undefined, 'MUC messages must not also be emitted as direct chat messages')

  let serverRoomJoin: any
  let genericPresence: any
  const presenceBridge = new XmppClientBridge()
  ;(presenceBridge as any).domain = 'home.example'
  ;(presenceBridge as any).client = { jid: { toString: () => 'nexus@home.example/resource' } }
  presenceBridge.on('muc:join', (event) => { serverRoomJoin = event })
  presenceBridge.on('presence', (event) => { genericPresence = event })
  ;(presenceBridge as any).handlePresence(xml('presence', {
    from: 'lobby@conference.home.example/nexus',
  }, xml('x', { xmlns: 'http://jabber.org/protocol/muc#user' },
    xml('item', { jid: 'nexus@home.example/resource', role: 'participant', affiliation: 'member' }),
    xml('status', { code: '110' }),
  )))
  assert.equal(serverRoomJoin.room, 'lobby@conference.home.example')
  assert.equal(serverRoomJoin.fromSelf, true)
  assert.equal(serverRoomJoin.occupantJid, 'nexus@home.example/resource')
  assert.equal(genericPresence, undefined, 'MUC occupant presence must not be recorded as ordinary roster presence')
  let roomJoinError: any
  presenceBridge.on('muc:error', (event) => { roomJoinError = event })
  ;(presenceBridge as any).handlePresence(xml('presence', {
    from: 'private@conference.home.example/nexus',
    type: 'error',
  }, xml('error', { type: 'auth' },
    xml('not-authorized', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' }),
    xml('text', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' }, 'Room password required'),
  )))
  assert.equal(roomJoinError.room, 'private@conference.home.example')
  assert.deepEqual(roomJoinError.stanzaError, { condition: 'not-authorized', text: 'Room password required' })

  let archivedRoomMessage: any
  clientBridge.on('muc:message', (message) => { if (message.mam) archivedRoomMessage = message })
  ;(clientBridge as any).handleMessage(xml('message', {},
    xml('result', { xmlns: 'urn:xmpp:mam:2', queryid: 'room-history-query', id: 'archive-1' },
      xml('forwarded', { xmlns: 'urn:xmpp:forward:0' },
        xml('delay', { xmlns: 'urn:xmpp:delay', stamp: '2026-01-02T03:04:05Z' }),
        xml('message', { xmlns: 'jabber:client', from: 'lobby@conference.home.example/nexus', type: 'groupchat', id: 'room-history-message' },
          xml('body', {}, 'Archived room message')
        )
      )
    )
  ))
  assert.equal(archivedRoomMessage.type, 'groupchat')
  assert.equal(archivedRoomMessage.fromSelf, true, 'archived room messages should identify the current account by its room nick')
  assert.equal(archivedRoomMessage.mam, true)
  assert.equal(ordinaryMessage, undefined, 'MUC archive results must not pollute direct chat history')

  const routedRoomMessages: any[] = []
  const runtimeStub = {
    xmppNode: {
      async sendServerMucMessage(...args: any[]) { routedRoomMessages.push(['server', ...args]); return 'server-room-message' },
      muc: { async sendGroupMessage(...args: any[]) { routedRoomMessages.push(['p2p', ...args]); return 'p2p-room-message' } },
    },
  }
  const externalRoomId = await BrowserXmppRuntimeBridge.prototype.sendChatMessage.call(
    runtimeStub as any,
    { id: 'lobby@conference.home.example', handle: 'lobby@conference.home.example', type: 'muc', name: 'Lobby', server: 'conference.home.example' },
    'Hello room',
    { originId: 'room-message-2', thread: 'topic-1' },
  )
  assert.equal(externalRoomId, 'server-room-message')
  assert.deepEqual(routedRoomMessages, [[
    'server', 'lobby@conference.home.example', 'Hello room',
    { originId: 'room-message-2', thread: 'topic-1', replace: undefined, reply: undefined },
  ]])

  const p2pRoomId = await BrowserXmppRuntimeBridge.prototype.sendChatMessage.call(
    runtimeStub as any,
    { id: 'team-room', handle: 'team-room@muc.p2p', type: 'group', name: 'Team', server: 'muc.p2p' },
    'P2P hello',
  )
  assert.equal(p2pRoomId, 'p2p-room-message')
  assert.equal(routedRoomMessages[1][0], 'p2p', 'P2P rooms must keep using the peer room manager')

  console.log('Server bridge routing, MUC event routing, and stanza-error parsing tests passed')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
