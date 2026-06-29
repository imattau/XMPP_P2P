import { XmppNode } from '../core/xmpp-node.js'
import type { XmppMessage, XmppFeedPost, XmppPresence } from '../core/xmpp-records.js'
import { jidFromPeerId } from '../core/xmpp-records.js'
import type { ServerConnectionInfo, ServerDiscoInfoResult, ServerDiscoItemsResult } from '../core/xmpp-client-bridge.js'

type Listener<Args extends unknown[]> = (...args: Args) => void

export class BrowserXmppRuntimeBridge {
  private messageListeners = new Set<Listener<[XmppMessage]>>()
  private presenceListeners = new Set<Listener<[XmppPresence]>>()
  private feedPostListeners = new Set<Listener<[XmppFeedPost]>>()
  private connectionListeners = new Set<Listener<[string, boolean]>>()
  private serverConnectionListeners = new Set<Listener<[ServerConnectionInfo]>>()
  private chatStateListeners = new Set<Listener<[{ from: string; state: string }]>>()
  private gatewayMessageListeners = new Set<Listener<[{ from: string; body: string; server: string }]>>()

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
      const normalized: XmppPresence = {
        ...presence,
        from: presence.from?.includes('@') ? presence.from : `${presence.from}@p2p`,
        to: presence.to?.includes('@') ? presence.to : `${presence.to}@p2p`,
      }
      for (const cb of this.presenceListeners) {
        try { cb(normalized) } catch { /* swallow */ }
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

    this.xmppNode.on('gateway:message', (msg: { from: string; body: string; server: string }) => {
      for (const cb of this.gatewayMessageListeners) {
        try { cb(msg) } catch { /* swallow */ }
      }
      // Also forward to regular message listeners
      for (const cb of this.messageListeners) {
        try { cb(msg as any) } catch { /* swallow */ }
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

  async connectServer(jid: string, password: string, service?: string): Promise<void> {
    return this.xmppNode.connectServer({ jid, password, service })
  }

  async disconnectServer(): Promise<void> {
    return this.xmppNode.disconnectServer()
  }

  async registerServer(jid: string, password: string, service: string): Promise<void> {
    return this.xmppNode.registerServer(jid, password, service)
  }

  isServerConnected(): boolean {
    return this.xmppNode.isServerConnected()
  }

  getServerStatus(): { online: boolean; connections: ServerConnectionInfo[] } {
    const info = this.xmppNode.getServerStatus()
    return { online: info.status === 'connected', connections: info.status === 'connected' ? [info] : [] }
  }

  getServerConnections(): ServerConnectionInfo[] {
    return this.xmppNode.getServerConnections()
  }

  onServerConnection(cb: Listener<[ServerConnectionInfo]>): () => void {
    this.serverConnectionListeners.add(cb)
    return () => this.serverConnectionListeners.delete(cb)
  }

  // ── Component/Federation methods ─────────────────────────────────────────
  // XEP-0114 TCP components are not available in the browser. These are
  // stubs that keep the bridge conformant with XmppRuntimeBridge.

  async connectComponent(_host: string, _port: number, _secret: string, _domain: string): Promise<void> {
    throw new Error('XEP-0114 TCP component connections are not supported in the browser runtime')
  }

  async disconnectComponent(): Promise<void> {
    // no-op — no component connection in browser
  }

  isComponentConnected(): boolean {
    return false
  }

  private _federationEnabled = true

  setFederationEnabled(enabled: boolean): void {
    this._federationEnabled = enabled
  }

  isFederationEnabled(): boolean {
    return this._federationEnabled
  }

  // ── Saved component configs ───────────────────────────────────────────────
  // Persisted in XmppNode's storage under a well-known namespace so configs
  // survive page reloads.

  async saveComponentConfig(domain: string, secret: string, host: string, port: number): Promise<void> {
    const key = `component-config:${domain}`
    const value = JSON.stringify({ domain, host, port, secret, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    await this.xmppNode.storage.putRecord('component-configs', key, value, new Date().toISOString())
  }

  async listSavedComponentConfigs(): Promise<Array<{ domain: string; host: string; port: number; createdAt: string; updatedAt: string }>> {
    try {
      const records = await this.xmppNode.storage.listRecords('component-configs')
      const configs: Array<{ domain: string; host: string; port: number; createdAt: string; updatedAt: string }> = []
      for (const record of records) {
        try {
          const obj = JSON.parse(record.value)
          configs.push({ domain: obj.domain, host: obj.host, port: obj.port, createdAt: obj.createdAt, updatedAt: obj.updatedAt })
        } catch { /* skip malformed */ }
      }
      return configs
    } catch {
      return []
    }
  }

  async removeComponentConfig(domain: string): Promise<void> {
    const key = `component-config:${domain}`
    await this.xmppNode.storage.deleteRecord('component-configs', key)
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
