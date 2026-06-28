import { XmppNode } from '../core/xmpp-node.js'
import type { XmppMessage, XmppFeedPost, XmppPresence } from '../core/xmpp-records.js'
import { jidFromPeerId } from '../core/xmpp-records.js'
import type { ServerConnectionInfo, ServerDiscoInfoResult, ServerDiscoItemsResult } from '../core/xmpp-server-bridge.js'

type Listener<Args extends unknown[]> = (...args: Args) => void

export class BrowserXmppRuntimeBridge {
  private messageListeners = new Set<Listener<[XmppMessage]>>()
  private presenceListeners = new Set<Listener<[XmppPresence]>>()
  private feedPostListeners = new Set<Listener<[XmppFeedPost]>>()
  private connectionListeners = new Set<Listener<[string, boolean]>>()
  private serverConnectionListeners = new Set<Listener<[ServerConnectionInfo]>>()
  private chatStateListeners = new Set<Listener<[{ from: string; state: string }]>>()

  constructor(private readonly xmppNode: XmppNode) {
    this.hookEvents()
  }

  private hookEvents() {
    this.xmppNode.on('message', (msg: XmppMessage) => {
      if (msg.chatState && !msg.body) {
        for (const cb of this.chatStateListeners) {
          try { cb({ from: msg.from, state: msg.chatState }) } catch { /* swallow */ }
        }
        return
      }
      for (const cb of this.messageListeners) {
        try { cb(msg) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('presence', (presence: XmppPresence) => {
      for (const cb of this.presenceListeners) {
        try { cb(presence) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('pubsub:message', (msg: { topic: string; body: string; from: string; itemId?: string }) => {
      const feedPost = this.toFeedPostRecord(msg)
      if (feedPost) {
        for (const cb of this.feedPostListeners) {
          try { cb(feedPost) } catch { /* swallow */ }
        }
      }
    })

    this.xmppNode.on('stream', ({ peerId, direction }: { peerId: string; direction: string }) => {
      for (const cb of this.connectionListeners) {
        try { cb(peerId, true) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('stream-closed', (peerId: string) => {
      for (const cb of this.connectionListeners) {
        try { cb(peerId, false) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('server:connection', (info: ServerConnectionInfo) => {
      for (const cb of this.serverConnectionListeners) {
        try { cb(info) } catch { /* swallow */ }
      }
    })
  }

  private toFeedPostRecord(msg: { topic: string; body: string; from: string; itemId?: string }): XmppFeedPost | null {
    if (!msg.topic || !msg.body) return null
    const now = new Date().toISOString()
    return {
      id: msg.itemId ?? `${Date.now()}`,
      topic: msg.topic,
      from: msg.from,
      body: msg.body,
      publishedAt: now,
      updatedAt: now,
      receivedAt: now
    }
  }

  onMessage(cb: Listener<[XmppMessage]>): () => void {
    this.messageListeners.add(cb)
    return () => this.messageListeners.delete(cb)
  }

  onPresence(cb: Listener<[XmppPresence]>): () => void {
    this.presenceListeners.add(cb)
    return () => this.presenceListeners.delete(cb)
  }

  onFeedPost(cb: Listener<[XmppFeedPost]>): () => void {
    this.feedPostListeners.add(cb)
    return () => this.feedPostListeners.delete(cb)
  }

  onConnectionChange(cb: Listener<[string, boolean]>): () => void {
    this.connectionListeners.add(cb)
    return () => this.connectionListeners.delete(cb)
  }

  onChatState(cb: Listener<[{ from: string; state: string }]>): () => void {
    this.chatStateListeners.add(cb)
    return () => this.chatStateListeners.delete(cb)
  }

  async sendChatState(target: string, state: 'composing' | 'paused' | 'active'): Promise<void> {
    await this.xmppNode.sendMessage(target, '', { chatState: state })
  }

  getFeedPosts(): Promise<XmppFeedPost[]> {
    return this.xmppNode.getFeedPosts()
  }

  publishFeed(body: string, options?: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string }): Promise<string> {
    return this.xmppNode.publishFeed(body, options)
  }

  subscribeFeed(peerAddr: string, options?: { visibility?: string }): Promise<any> {
    return this.xmppNode.subscribeFeed(peerAddr, options as any)
  }

  setFeedSubscriptionVisibility(peerAddr: string, visibility: string): Promise<any> {
    return this.xmppNode.setFeedSubscriptionVisibility(peerAddr, visibility as any)
  }

  unsubscribeFeed(peerAddr: string): Promise<void> {
    return this.xmppNode.unsubscribeFeed(peerAddr)
  }

  getFeedSubscriptions(): Promise<any[]> {
    return this.xmppNode.getFeedSubscriptions()
  }

  getPublicFeedSubscriptions(): Promise<any[]> {
    return this.xmppNode.getPublicFeedSubscriptions()
  }

  watchFeedFollowers(peerAddr: string): Promise<{ peerId: string; topic: string; watchedAt: string }> {
    return this.xmppNode.watchFeedFollowers(peerAddr)
  }

  getFeedFollowers(peerAddr: string): Promise<any[]> {
    return this.xmppNode.getFeedFollowers(peerAddr)
  }

  getCollections(): Promise<any[]> {
    return this.xmppNode.getCollections()
  }

  getCollectionPosts(collectionId?: string): Promise<any[]> {
    return this.xmppNode.getCollectionPosts(collectionId)
  }

  publishCollection(collectionId: string, body: string, options?: { itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string }): Promise<string> {
    return this.xmppNode.publishCollection(collectionId, body, options)
  }

  react(topic: string, targetId: string, reaction: string): Promise<string> {
    return this.xmppNode.react(topic, targetId, reaction)
  }

  notice(topic: string, targetId: string, value?: string): Promise<string> {
    return this.xmppNode.notice(topic, targetId, value)
  }

  getVCard(): Promise<any> {
    return this.xmppNode.getVCard()
  }

  setVCard(profile: any): Promise<any> {
    return this.xmppNode.setVCard(profile)
  }

  broadcastPresence(type?: string, status?: string, show?: string, nickname?: string): Promise<void> {
    return this.xmppNode.broadcastPresence(type, status, show, nickname)
  }

  getRosterEntries(): Promise<Array<{ jid: string; name?: string; nickname?: string; updatedAt: string }>> {
    return this.xmppNode.getRosterEntries()
  }

  async createPrivateMucRoom(
    roomName: string,
    options?: {
      topic?: string
      nick?: string
      communityId?: string
      autoJoin?: boolean
      archived?: boolean
    }
  ): Promise<{ roomName: string; roomJid: string }> {
    return this.xmppNode.createPrivateMucRoom(roomName, options)
  }

  async getMucRoomSettings(roomName: string): Promise<any> {
    return this.xmppNode.getMucRoomSettings(roomName)
  }

  async updateMucRoomSettings(roomName: string, settings: any): Promise<void> {
    return this.xmppNode.updateMucRoomSettings(roomName, settings)
  }

  async sendChatMessage(
    target: { id: string; type: string; name: string; handle?: string; server?: string },
    body: string,
    options?: {
      attachments?: Array<{ id: string; url: string; alt: string; kind: string }>
      replyTo?: string
      reply?: { id: string; to?: string }
      thread?: string
      replace?: string
    }
  ): Promise<string> {
    const peerAddr = target.handle || `${target.id}@p2p`
    let messageBody = body
    if (options?.attachments && options.attachments.length > 0) {
      const attachmentRefs = options.attachments
        .map((a) => a.url.startsWith('upload://') ? a.url : `[${a.alt}](${a.url})`)
        .join('\n')
      if (messageBody) {
        messageBody += '\n' + attachmentRefs
      } else {
        messageBody = attachmentRefs
      }
    }
    return this.xmppNode.sendMessage(peerAddr, messageBody, {
      reply: options?.reply,
      thread: options?.thread,
      replace: options?.replace,
      requestReceipt: true
    })
  }

  async connectComponent(host: string, port: number, secret: string, domain: string): Promise<void> {
    return this.xmppNode.connectComponent(host, port, secret, domain)
  }

  async disconnectComponent(): Promise<void> {
    return this.xmppNode.disconnectComponent()
  }

  isComponentConnected(): boolean {
    return this.xmppNode.isComponentConnected()
  }

  setS2SDomain(domain: string): void {
    this.xmppNode.setS2SDomain(domain)
  }

  setFederationEnabled(enabled: boolean): void {
    this.xmppNode.setFederationEnabled(enabled)
  }

  isFederationEnabled(): boolean {
    return this.xmppNode.isFederationEnabled()
  }

  async resolveComponentEndpoint(domain: string): Promise<{ host: string; port: number }> {
    return this.xmppNode.resolveComponentEndpoint(domain)
  }

  getServerConnections(): ServerConnectionInfo[] {
    return this.xmppNode.getServerConnections()
  }

  async joinServerMuc(roomJid: string, nick: string): Promise<void> {
    return this.xmppNode.joinServerMuc(roomJid, nick)
  }

  async sendServerMucMessage(roomJid: string, body: string): Promise<string> {
    return this.xmppNode.sendServerMucMessage(roomJid, body)
  }

  async leaveServerMuc(roomJid: string): Promise<void> {
    return this.xmppNode.leaveServerMuc(roomJid)
  }

  onServerConnection(cb: Listener<[ServerConnectionInfo]>): () => void {
    this.serverConnectionListeners.add(cb)
    return () => this.serverConnectionListeners.delete(cb)
  }

  async kickMucParticipant(roomJid: string, participantJid: string, reason?: string): Promise<void> {
    const nick = participantJid.split('@')[0]
    const stanza = (await import('@xmpp/xml')).xml(
      'iq',
      { to: roomJid, type: 'set' },
      (await import('@xmpp/xml')).xml('query', { xmlns: 'http://jabber.org/protocol/muc#admin' },
        (await import('@xmpp/xml')).xml('item', { nick, role: 'none' },
          reason ? (await import('@xmpp/xml')).xml('reason', {}, reason) : undefined
        )
      )
    )
    await this.xmppNode.sendIqRequest(roomJid, stanza)
  }

  async banMucParticipant(roomJid: string, participantJid: string, reason?: string): Promise<void> {
    const jid = participantJid.includes('@') ? participantJid : `${participantJid}@${roomJid.split('@')[1] || 'p2p'}`
    const stanza = (await import('@xmpp/xml')).xml(
      'iq',
      { to: roomJid, type: 'set' },
      (await import('@xmpp/xml')).xml('query', { xmlns: 'http://jabber.org/protocol/muc#admin' },
        (await import('@xmpp/xml')).xml('item', { jid, affiliation: 'outcast' },
          reason ? (await import('@xmpp/xml')).xml('reason', {}, reason) : undefined
        )
      )
    )
    await this.xmppNode.sendIqRequest(roomJid, stanza)
  }

  async disconnect(): Promise<void> {
    this.messageListeners.clear()
    this.presenceListeners.clear()
    this.feedPostListeners.clear()
    this.connectionListeners.clear()
    this.serverConnectionListeners.clear()
    await this.xmppNode.close()
  }

  async saveComponentConfig(domain: string, secret: string, host: string, port: number): Promise<void> {
    return this.xmppNode.serverBridge.configStore.save(domain, secret, host, port)
  }

  async listSavedComponentConfigs(): Promise<any[]> {
    return this.xmppNode.serverBridge.configStore.list()
  }

  async removeComponentConfig(domain: string): Promise<void> {
    return this.xmppNode.serverBridge.configStore.remove(domain)
  }

  // Phase 2: PubSub operations
  async pubsubSubscribe(nodeJid: string, node: string): Promise<void> {
    return this.xmppNode.pubsubSubscribe(nodeJid, node)
  }

  async pubsubPublish(nodeJid: string, node: string, itemId: string, body: string): Promise<string> {
    const { xml } = await import('@xmpp/xml')
    const payload = xml('body', {}, body)
    return this.xmppNode.pubsubPublish(nodeJid, node, itemId, payload)
  }

  async pubsubGetItems(nodeJid: string, node: string, maxItems?: number): Promise<any[]> {
    return this.xmppNode.pubsubGetItems(nodeJid, node, maxItems)
  }

  async pubsubUnsubscribe(nodeJid: string, node: string): Promise<void> {
    return this.xmppNode.pubsubUnsubscribe(nodeJid, node)
  }

  // Phase 4: Service Discovery
  async serverDiscoInfo(jid: string): Promise<ServerDiscoInfoResult> {
    return this.xmppNode.serverDiscoInfo(jid)
  }

  async serverDiscoItems(jid: string): Promise<ServerDiscoItemsResult> {
    return this.xmppNode.serverDiscoItems(jid)
  }

  // Phase 3 & 5: Bridge management
  async setFeedBridge(feedTopic: string, pubsubNode: string): Promise<void> {
    return this.xmppNode.setFeedBridge(feedTopic, pubsubNode)
  }

  async removeFeedBridge(feedTopic: string): Promise<void> {
    return this.xmppNode.removeFeedBridge(feedTopic)
  }

  getAllFeedBridges(): Array<{ feedTopic: string; pubsubNode: string }> {
    return this.xmppNode.getAllFeedBridges()
  }

  async setMucBridge(serverRoom: string, p2pRoom: string): Promise<void> {
    return this.xmppNode.setMucBridge(serverRoom, p2pRoom)
  }

  async removeMucBridge(serverRoom: string): Promise<void> {
    return this.xmppNode.removeMucBridge(serverRoom)
  }

  getAllMucBridges(): Array<{ serverRoom: string; p2pRoom: string }> {
    return this.xmppNode.getAllMucBridges()
  }

  async uploadFile(file: File | Uint8Array, fileName?: string, mimeType?: string): Promise<{ url: string; alt: string; kind: 'image' | 'file' }> {
    let data: Uint8Array
    let name: string
    let mime: string

    if (file instanceof File) {
      const buffer = await file.arrayBuffer()
      data = new Uint8Array(buffer)
      name = file.name
      mime = file.type || 'application/octet-stream'
    } else {
      data = file
      name = fileName || 'file'
      mime = mimeType || 'application/octet-stream'
    }

    const result = await this.xmppNode.storeFile(data, name, mime)
    const kind = mime.startsWith('image/') ? 'image' : 'file'

    return { url: result.url, alt: name, kind }
  }

  async getOmemoFingerprint(): Promise<string | undefined> {
    try {
      const ik = await this.xmppNode.getOmemoIdentityKey()
      const encoder = new TextEncoder()
      const hash = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(ik))
      const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
      return hex.match(/.{1,8}/g)?.join(' ') ?? hex
    } catch {
      return undefined
    }
  }

  async getPeerOmemoFingerprint(peerJid: string): Promise<string | undefined> {
    try {
      const devices = await this.xmppNode.getPeerOmemoDevices(peerJid)
      if (devices.length === 0) return undefined
      const bundle = await this.xmppNode.getPeerOmemoBundle(peerJid, devices[0])
      if (!bundle?.identityKey) return undefined
      const encoder = new TextEncoder()
      const hash = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(bundle.identityKey))
      const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
      return hex.match(/.{1,8}/g)?.join(' ') ?? hex
    } catch {
      return undefined
    }
  }

  async resolveUploadUrl(url: string): Promise<string | undefined> {
    const match = url.match(/^upload:\/\/(.+)$/)
    if (!match) return undefined
    const cid = match[1]
    const blob = await this.xmppNode.storage.getBlob('uploads', cid)
    if (!blob) return undefined
    const mimeType = 'application/octet-stream'
    return URL.createObjectURL(new Blob([blob as BlobPart], { type: mimeType }))
  }
}
