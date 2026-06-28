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

  constructor(private readonly xmppNode: XmppNode) {
    this.hookEvents()
  }

  private hookEvents() {
    this.xmppNode.on('message', (msg: XmppMessage) => {
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
    }
  ): Promise<string> {
    const peerAddr = target.handle || `${target.id}@p2p`
    return this.xmppNode.sendMessage(peerAddr, body, {
      reply: options?.reply,
      thread: options?.thread
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
}
