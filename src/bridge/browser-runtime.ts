import { XmppNode } from '../core/xmpp-node.js'
import { MAX_PEER_UPLOAD_BYTES } from '../core/xmpp-uploads.js'
import type { XmppMessage, XmppFeedPost, XmppPresence } from '../core/xmpp-records.js'
import type { XmppCollectionPost } from '../core/xmpp-records.js'
import type { XmppAttachment, XmppAttachmentSummary } from '../core/xmpp-records.js'
import { jidFromPeerId } from '../core/xmpp-records.js'
import type { ServerConnectionInfo, ServerDiscoInfoResult, ServerDiscoItemsResult, ServerMucRoomInfo } from '../core/xmpp-client-bridge.js'
import { RssFeedManager, type RssFeedFetcher, type RssFeedPreview, type RssFeedSource } from '../core/rss-feeds.js'

type Listener<Args extends unknown[]> = (...args: Args) => void

export class BrowserXmppRuntimeBridge {
  private messageListeners = new Set<Listener<[XmppMessage]>>()
  private presenceListeners = new Set<Listener<[XmppPresence]>>()
  private feedPostListeners = new Set<Listener<[XmppFeedPost]>>()
  private collectionPostListeners = new Set<Listener<[XmppCollectionPost]>>()
  private attachmentSummaryListeners = new Set<Listener<[XmppAttachmentSummary]>>()
  private connectionListeners = new Set<Listener<[string, boolean]>>()
  private serverConnectionListeners = new Set<Listener<[ServerConnectionInfo]>>()
  private serverRosterListeners = new Set<Listener<[]>>()
  private serverPresenceRequestListeners = new Set<Listener<[{ jid: string; server: string }]>>()
  private pendingServerPresenceRequests = new Map<string, { jid: string; server: string }>()
  private chatStateListeners = new Set<Listener<[{ from: string; state: string }]>>()
  private mucMessageListeners = new Set<Listener<[any]>>()
  private mucJoinListeners = new Set<Listener<[any]>>()
  private mucLeaveListeners = new Set<Listener<[any]>>()
  private mucErrorListeners = new Set<Listener<[any]>>()
  private mucChatStateListeners = new Set<Listener<[any]>>()
  private mucMarkerListeners = new Set<Listener<[any]>>()

  private activeConnections = new Set<string>()
  private readonly rssFeeds: RssFeedManager

  constructor(
    private readonly xmppNode: XmppNode,
    private readonly stopNetwork: () => Promise<void> = async () => {},
    rssFeedFetcher?: RssFeedFetcher
  ) {
    this.rssFeeds = new RssFeedManager(xmppNode.storage, xmppNode.jid, rssFeedFetcher, async (post, itemId) => {
      const originalUrl = post.links?.find((link) => link.rel === 'alternate')?.href ?? post.sourceUrl
      await xmppNode.publishFeed(post.body, {
        itemId,
        title: post.title,
        summary: post.summary,
        author: post.author || post.sourceName,
        categories: post.categories,
        links: [
          { rel: 'related', href: originalUrl, title: `Original from ${post.sourceName}` },
          ...(post.image ? [{ rel: 'enclosure', href: post.image, type: 'image/*', title: post.title }] : []),
        ],
      })
    })
    this.hookEvents()
  }

  private hookEvents() {
    this.xmppNode.on('upload:available', (cid: string) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('xmpp-p2p:upload-available', { detail: cid }))
      }
    })

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
        to: !presence.to ? '' : presence.to.includes('@') ? presence.to : `${presence.to}@p2p`,
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

    this.xmppNode.on('feed:post', (post: XmppFeedPost) => {
      for (const cb of this.feedPostListeners) {
        try { cb(post) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('collection:post', (post: XmppCollectionPost) => {
      for (const cb of this.collectionPostListeners) {
        try { cb(post) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('attachment:summary', (summary: XmppAttachmentSummary) => {
      for (const cb of this.attachmentSummaryListeners) {
        try { cb(summary) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('stream', ({ peerId, direction }: { peerId: string; direction: string }) => {
      this.activeConnections.add(peerId)
      for (const cb of this.connectionListeners) {
        try { cb(peerId, true) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('stream-closed', (peerId: string) => {
      this.activeConnections.delete(peerId)
      for (const cb of this.connectionListeners) {
        try { cb(peerId, false) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('server:connection', (info: ServerConnectionInfo) => {
      for (const cb of this.serverConnectionListeners) {
        try { cb(info) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('server:roster', () => {
      for (const cb of this.serverRosterListeners) {
        try { cb() } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('server:presence-subscription-request', (request: { from: string; server: string }) => {
      const normalized = { jid: request.from.split('/')[0].toLowerCase(), server: request.server }
      this.pendingServerPresenceRequests.set(normalized.jid, normalized)
      for (const cb of this.serverPresenceRequestListeners) {
        try { cb(normalized) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('muc:message', (event: any) => {
      for (const cb of this.mucMessageListeners) {
        try { cb(event) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('muc:join', (event: any) => {
      for (const cb of this.mucJoinListeners) {
        try { cb(event) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('muc:leave', (event: any) => {
      for (const cb of this.mucLeaveListeners) {
        try { cb(event) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('muc:error', (event: any) => {
      for (const cb of this.mucErrorListeners) {
        try { cb(event) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('muc:chatstate', (event: any) => {
      for (const cb of this.mucChatStateListeners) {
        try { cb(event) } catch { /* swallow */ }
      }
    })

    this.xmppNode.on('muc:marker', (event: any) => {
      for (const cb of this.mucMarkerListeners) {
        try { cb(event) } catch { /* swallow */ }
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
    const removeRssListener = this.rssFeeds.onPost((post) => cb(post as unknown as XmppFeedPost))
    return () => {
      this.feedPostListeners.delete(cb)
      removeRssListener()
    }
  }

  onCollectionPost(cb: Listener<[XmppCollectionPost]>): () => void {
    this.collectionPostListeners.add(cb)
    return () => this.collectionPostListeners.delete(cb)
  }

  onAttachmentSummary(cb: Listener<[XmppAttachmentSummary]>): () => void {
    this.attachmentSummaryListeners.add(cb)
    return () => this.attachmentSummaryListeners.delete(cb)
  }

  getAttachments(topic?: string, targetId?: string): Promise<XmppAttachment[]> {
    return this.xmppNode.getAttachments(topic, targetId)
  }

  onConnectionChange(cb: Listener<[string, boolean]>): () => void {
    this.connectionListeners.add(cb)
    return () => this.connectionListeners.delete(cb)
  }

  onChatState(cb: Listener<[{ from: string; state: string }]>): () => void {
    this.chatStateListeners.add(cb)
    return () => this.chatStateListeners.delete(cb)
  }

  onMucMessage(cb: Listener<[any]>): () => void {
    this.mucMessageListeners.add(cb)
    return () => this.mucMessageListeners.delete(cb)
  }

  onMucJoin(cb: Listener<[any]>): () => void {
    this.mucJoinListeners.add(cb)
    return () => this.mucJoinListeners.delete(cb)
  }

  onMucLeave(cb: Listener<[any]>): () => void {
    this.mucLeaveListeners.add(cb)
    return () => this.mucLeaveListeners.delete(cb)
  }

  onMucError(cb: Listener<[any]>): () => void {
    this.mucErrorListeners.add(cb)
    return () => this.mucErrorListeners.delete(cb)
  }

  onMucChatState(cb: Listener<[any]>): () => void {
    this.mucChatStateListeners.add(cb)
    return () => this.mucChatStateListeners.delete(cb)
  }

  onMucMarker(cb: Listener<[any]>): () => void {
    this.mucMarkerListeners.add(cb)
    return () => this.mucMarkerListeners.delete(cb)
  }

  async sendChatState(target: string, state: 'composing' | 'paused' | 'active'): Promise<void> {
    await this.xmppNode.sendMessage(target, '', { chatState: state })
  }

  async sendMucChatState(roomName: string, state: 'composing' | 'paused' | 'active'): Promise<void> {
    if (roomName.includes('@') && !roomName.toLowerCase().endsWith('@muc.p2p')) {
      return this.xmppNode.sendServerMucChatState(roomName, state)
    }
    await this.xmppNode.muc.sendGroupChatState(roomName.replace(/@muc\.p2p$/, ''), state)
  }

  async getMucHistory(roomName: string) {
    await this.xmppNode.ready
    return this.xmppNode.getMucHistory(roomName.replace(/@muc\.p2p$/, ''))
  }

  getMucParticipants(roomName: string) {
    const state = this.xmppNode.muc.getRoomState(roomName.replace(/@muc\.p2p$/, ''))
    return state ? [...state.occupants.values()] : []
  }

  async queryChatHistory(targetPeerJid: string, withJid?: string): Promise<string> {
    await this.xmppNode.ready
    return this.xmppNode.queryChatHistory(targetPeerJid, withJid)
  }

  async queryServerChatHistory(withJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    await this.xmppNode.ready
    return this.xmppNode.queryServerChatHistory(withJid, before)
  }

  async queryServerMucHistory(roomJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    await this.xmppNode.ready
    return this.xmppNode.queryServerMucHistory(roomJid, before)
  }

  async discoverServerMucRooms(): Promise<ServerMucRoomInfo[]> {
    await this.xmppNode.ready
    return this.xmppNode.discoverServerMucRooms()
  }

  async subscribeServerMicroblog(jid: string): Promise<'subscribed' | 'pending' | 'unconfigured' | 'polling'> {
    await this.xmppNode.ready
    return this.xmppNode.subscribeServerMicroblog(jid)
  }

  async getServerMicroblogSubscriptions(): Promise<Array<{ jid: string; node: string; status: 'subscribed' | 'pending' | 'polling'; updatedAt: string }>> {
    await this.xmppNode.ready
    return this.xmppNode.getServerMicroblogSubscriptions()
  }

  async unsubscribeServerMicroblog(jid: string): Promise<void> {
    await this.xmppNode.ready
    return this.xmppNode.unsubscribeServerMicroblog(jid)
  }

  async refreshServerMicroblog(jid: string): Promise<number> {
    await this.xmppNode.ready
    return this.xmppNode.refreshServerMicroblog(jid)
  }

  async publishServerMicroblog(body: string, options?: { itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string; displayContent?: string; articlePayload?: string }): Promise<string> {
    await this.xmppNode.ready
    return this.xmppNode.publishServerMicroblog(body, options)
  }

  async getFeedPosts(): Promise<XmppFeedPost[]> {
    const [xmppPosts, rssPosts] = await Promise.all([this.xmppNode.getFeedPosts(), this.rssFeeds.listPosts()])
    return [...xmppPosts, ...rssPosts as unknown as XmppFeedPost[]].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  publishFeed(body: string, options?: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string; replyTo?: string; links?: Array<{ rel: string; href: string; type?: string; title?: string; ref?: string }> }): Promise<string> {
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

  async getFollowedFeedSources(): Promise<Array<{ id: string; protocol: 'p2p' | 'xmpp' | 'rss'; owner: string; node: string; status: 'subscribed' | 'pending' | 'polling' | 'active' | 'paused' | 'error'; updatedAt?: string }>> {
    const [p2p, xmpp] = await Promise.all([
      this.xmppNode.getFeedSubscriptions(),
      this.xmppNode.getServerMicroblogSubscriptions(),
    ])
    return [
      ...p2p.map((subscription) => ({
        id: `p2p:${subscription.peerId}`,
        protocol: 'p2p' as const,
        owner: subscription.peerId,
        node: subscription.topic,
        status: 'subscribed' as const,
        updatedAt: subscription.updatedAt,
      })),
      ...xmpp.map((subscription) => ({
        id: `xmpp:${subscription.jid}:${subscription.node}`,
        protocol: 'xmpp' as const,
        owner: subscription.jid,
        node: subscription.node,
        status: subscription.status,
        updatedAt: subscription.updatedAt,
      })),
      ...(await this.rssFeeds.listSources()).map((source) => ({
        id: `rss:${source.id}`,
        protocol: 'rss' as const,
        owner: source.url,
        node: source.title,
        status: source.status,
        updatedAt: source.updatedAt,
      })),
    ]
  }

  discoverRssFeeds(url: string): Promise<RssFeedPreview[]> {
    return this.rssFeeds.discover(url)
  }

  addRssFeed(url: string, options?: { shareToP2P?: boolean }): Promise<RssFeedSource> {
    return this.rssFeeds.subscribe(url, options)
  }

  getRssFeeds(): Promise<RssFeedSource[]> {
    return this.rssFeeds.listSources()
  }

  refreshRssFeed(id: string): Promise<number> {
    return this.rssFeeds.refresh(id)
  }

  setRssFeedPaused(id: string, paused: boolean): Promise<void> {
    return this.rssFeeds.setPaused(id, paused)
  }

  setRssFeedSharing(id: string, shareToP2P: boolean): Promise<void> {
    return this.rssFeeds.setSharing(id, shareToP2P)
  }

  removeRssFeed(id: string, keepEntries = true): Promise<void> {
    return this.rssFeeds.remove(id, keepEntries)
  }

  async followFeedSource(source: { protocol: 'p2p' | 'xmpp'; owner: string }): Promise<'subscribed' | 'pending' | 'unconfigured' | 'polling'> {
    if (source.protocol === 'p2p') {
      await this.xmppNode.subscribeFeed(source.owner)
      return 'subscribed'
    }
    return this.xmppNode.subscribeServerMicroblog(source.owner)
  }

  async unfollowFeedSource(source: { protocol: 'p2p' | 'xmpp'; owner: string }): Promise<void> {
    if (source.protocol === 'p2p') return this.xmppNode.unsubscribeFeed(source.owner)
    return this.xmppNode.unsubscribeServerMicroblog(source.owner)
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

  createCollection(id: string, name?: string): Promise<any> {
    return this.xmppNode.createCollection(id, name)
  }

  subscribeCollection(id: string): Promise<any> {
    return this.xmppNode.subscribeCollection(id)
  }

  unsubscribeCollection(id: string): Promise<void> {
    return this.xmppNode.unsubscribeCollection(id)
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

  async broadcastPresence(type?: string, status?: string, show?: string, nickname?: string): Promise<void> {
    await this.xmppNode.broadcastPresence(type, status, show, nickname)
    if (this.xmppNode.clientBridge.connectionInfo.status === 'connected') {
      await this.xmppNode.clientBridge.sendPresence(type, status, show)
    }
  }

  getRosterEntries(): Promise<Array<{ jid: string; name?: string; nickname?: string; updatedAt: string; subscription?: string }>> {
    return this.xmppNode.getRosterEntries()
  }

  addRosterEntry(jid: string, name?: string): Promise<{ jid: string; name?: string; nickname?: string; updatedAt: string }> {
    return this.xmppNode.addRosterEntry(jid, name)
  }

  removeRosterEntry(jid: string): Promise<void> {
    return this.xmppNode.removeRosterEntry(jid)
  }

  async createPrivateMucRoom(
    roomName: string,
    options?: {
      topic?: string
      nick?: string
      communityId?: string
      autoJoin?: boolean
      archived?: boolean
      defaultMode?: 'secure' | 'open'
    }
  ): Promise<{ roomName: string; roomJid: string }> {
    return this.xmppNode.createPrivateMucRoom(roomName, options)
  }

  async joinMucRoom(roomName: string, nick?: string): Promise<void> {
    return this.xmppNode.joinMucRoom(roomName, nick ?? this.xmppNode.jid.split('@')[0])
  }

  async leaveMucRoom(roomName: string): Promise<void> {
    return this.xmppNode.muc.leaveRoom(roomName.replace(/@muc\.p2p$/, ''))
  }

  async joinServerMuc(roomJid: string, nick: string): Promise<void> {
    return this.xmppNode.joinServerMuc(roomJid, nick)
  }

  async leaveServerMuc(roomJid: string, nick: string): Promise<void> {
    return this.xmppNode.leaveServerMuc(roomJid, nick)
  }

  async getMucRoomSettings(roomName: string): Promise<any> {
    return this.xmppNode.getMucRoomSettings(roomName)
  }

  async updateMucRoomSettings(roomName: string, settings: any): Promise<void> {
    return this.xmppNode.updateMucRoomSettings(roomName, settings)
  }

  async sendChatMessage(
    target: { id: string; type: string; name: string; handle?: string; peerAddress?: string; server?: string; encrypted?: boolean },
    body: string,
    options?: {
      originId?: string
      attachments?: Array<{ id: string; url: string; alt: string; kind: string }>
      replyTo?: string
      reply?: { id: string; to?: string }
      thread?: string
      replace?: string
    }
  ): Promise<string> {
    const directAddress = target.handle || target.id
    const isExternalXmppDirect = target.type === 'direct'
      && directAddress.includes('@')
      && !directAddress.toLowerCase().split('/')[0].endsWith('@p2p')
    if (isExternalXmppDirect && options?.attachments?.some((attachment) => /^(?:upload|p2p-upload):\/\//i.test(attachment.url))) {
      throw new Error('This file is stored on the P2P network and cannot be opened by a standard XMPP contact. Send a public HTTPS link instead.')
    }

    let messageBody = body
    if (options?.attachments && options.attachments.length > 0) {
      const attachmentRefs = options.attachments
        .map((a) => `${a.kind === 'image' ? '!' : ''}[${a.alt.replace(/[\[\]\r\n]/g, ' ')}](${a.url})`)
        .join('\n')
      if (messageBody) {
        messageBody += '\n' + attachmentRefs
      } else {
        messageBody = attachmentRefs
      }
    }
    if (target.type === 'group' || target.type === 'muc') {
      const roomJid = target.handle || target.id
      if (roomJid.includes('@') && !roomJid.toLowerCase().endsWith('@muc.p2p')) {
        if (options?.attachments?.some((attachment) => /^(?:upload|p2p-upload):\/\//i.test(attachment.url))) {
          throw new Error('This file is stored on the P2P network and cannot be opened by a standard XMPP room. Send a public HTTPS link instead.')
        }
        return this.xmppNode.sendServerMucMessage(roomJid, messageBody, {
          originId: options?.originId,
          thread: options?.thread,
          replace: options?.replace,
          reply: options?.reply,
        })
      }
      const roomName = target.id.replace(/@muc\.p2p$/, '')
      const sendGroupMessage = target.encrypted
        ? this.xmppNode.muc.sendGroupMessageSecure.bind(this.xmppNode.muc)
        : this.xmppNode.muc.sendGroupMessage.bind(this.xmppNode.muc)
      return sendGroupMessage(roomName, messageBody, options?.replace, options?.originId, options?.reply, options?.thread)
    }
    const peerAddr = target.peerAddress || target.handle || `${target.id}@p2p`
    if (target.encrypted) {
      const peerJid = target.handle || `${target.id}@p2p`
      if (!peerJid.split('/')[0].toLowerCase().endsWith('@p2p')) {
        throw new Error('OMEMO direct messaging is currently supported only for P2P contacts.')
      }
      return this.xmppNode.sendEncryptedMessage(peerAddr, messageBody, {
        originId: options?.originId,
        reply: options?.reply,
        thread: options?.thread,
        replace: options?.replace,
        requestReceipt: true
      })
    }
    return this.xmppNode.sendMessage(peerAddr, messageBody, {
      originId: options?.originId,
      reply: options?.reply,
      thread: options?.thread,
      replace: options?.replace,
      requestReceipt: true,
      attachments: options?.attachments?.map((attachment) => ({ url: attachment.url, desc: attachment.alt })),
    })
  }

  async connectServer(jid: string, password: string, service?: string): Promise<void> {
    return this.xmppNode.connectServer({ jid, password, service })
  }

  async disconnectServer(): Promise<void> {
    return this.xmppNode.disconnectServer()
  }

  async registerServer(jid: string, password: string, service: string, registrationFields?: Record<string, string>): Promise<void> {
    return this.xmppNode.registerServer(jid, password, service, registrationFields)
  }

  isServerConnected(): boolean {
    return this.xmppNode.isServerConnected()
  }

  getServerStatus(): { online: boolean; connections: ServerConnectionInfo[] } {
    const info = this.xmppNode.getServerStatus()
    return { online: info.status === 'connected', connections: info.domain ? [info] : [] }
  }

  getServerConnections(): ServerConnectionInfo[] {
    return this.xmppNode.getServerConnections()
  }

  onServerConnection(cb: Listener<[ServerConnectionInfo]>): () => void {
    this.serverConnectionListeners.add(cb)
    return () => this.serverConnectionListeners.delete(cb)
  }

  onServerRosterChange(cb: Listener<[]>): () => void {
    this.serverRosterListeners.add(cb)
    return () => this.serverRosterListeners.delete(cb)
  }

  onServerPresenceSubscriptionRequest(cb: Listener<[{ jid: string; server: string }]>): () => void {
    this.serverPresenceRequestListeners.add(cb)
    for (const request of this.pendingServerPresenceRequests.values()) {
      try { cb(request) } catch { /* swallow */ }
    }
    return () => this.serverPresenceRequestListeners.delete(cb)
  }

  async approveServerPresenceSubscription(jid: string): Promise<void> {
    await this.xmppNode.approveServerPresenceSubscription(jid)
    this.pendingServerPresenceRequests.delete(jid.trim().split('/')[0].toLowerCase())
  }

  async denyServerPresenceSubscription(jid: string): Promise<void> {
    await this.xmppNode.denyServerPresenceSubscription(jid)
    this.pendingServerPresenceRequests.delete(jid.trim().split('/')[0].toLowerCase())
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

  getConnectedPeers(): string[] {
    return Array.from(this.activeConnections)
  }

  getLocalJid(): string {
    return this.xmppNode.jid
  }

  getServerJid(): string | undefined {
    return this.xmppNode.getServerJid()
  }

  getLocalPeerAddresses(): string[] {
    return this.xmppNode.getLocalPeerAddresses()
  }

  async disconnect(): Promise<void> {
    this.messageListeners.clear()
    this.presenceListeners.clear()
    this.feedPostListeners.clear()
    this.attachmentSummaryListeners.clear()
    this.connectionListeners.clear()
    this.serverConnectionListeners.clear()
    this.serverRosterListeners.clear()
    this.serverPresenceRequestListeners.clear()
    this.pendingServerPresenceRequests.clear()
    this.mucMessageListeners.clear()
    this.mucJoinListeners.clear()
    this.mucLeaveListeners.clear()
    this.mucErrorListeners.clear()
    this.mucChatStateListeners.clear()
    this.mucMarkerListeners.clear()
    this.activeConnections.clear()
    try {
      await this.xmppNode.close()
    } finally {
      try {
        await this.stopNetwork()
      } finally {
        if (typeof window !== 'undefined' && (window as any).__XMPP_P2P_BRIDGE__ === this) {
          delete (window as any).__XMPP_P2P_BRIDGE__
          window.dispatchEvent(new Event('xmpp-p2p:bridge-disconnected'))
        }
      }
    }
  }

  async uploadFile(file: File | Uint8Array, recipient?: string, fileName?: string, mimeType?: string): Promise<{ url: string; alt: string; kind: 'image' | 'file' }> {
    const fileSize = file instanceof File ? file.size : file.byteLength
    if (fileSize > MAX_PEER_UPLOAD_BYTES) {
      throw new Error('Attachments are limited to 50 MiB per file.')
    }
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

    const isExternalXmppRecipient = Boolean(recipient?.includes('@') && !recipient.toLowerCase().split('/')[0].endsWith('@p2p'))
    const url = isExternalXmppRecipient
      ? await this.xmppNode.uploadFileToServer(data, name, mime)
      : (await this.xmppNode.storeFile(data, name, mime)).url
    const kind = mime.startsWith('image/') ? 'image' : 'file'

    return { url, alt: name, kind }
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
    let mimeType = 'application/octet-stream'
    try {
      const rawMetadata = await this.xmppNode.storage.getRecord('uploads_meta', cid)
      const metadata = rawMetadata ? JSON.parse(rawMetadata) as { contentType?: string } : undefined
      if (metadata?.contentType) mimeType = metadata.contentType
    } catch { /* use generic type when metadata is unavailable */ }
    // The native (Electron) host has no DOM URL factory. A data URL keeps the
    // attachment viewable in the renderer without exposing main-process blobs.
    if (typeof window === 'undefined') {
      let binary = ''
      for (const byte of blob) binary += String.fromCharCode(byte)
      return `data:${mimeType};base64,${btoa(binary)}`
    }
    return URL.createObjectURL(new Blob([blob as BlobPart], { type: mimeType }))
  }
}
