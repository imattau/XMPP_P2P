import { XmppNode } from '../core/xmpp-node.js'
import type { XmppMessage, XmppFeedPost, XmppPresence } from '../core/xmpp-records.js'
import { jidFromPeerId } from '../core/xmpp-records.js'

type Listener<Args extends unknown[]> = (...args: Args) => void

export class BrowserXmppRuntimeBridge {
  private messageListeners = new Set<Listener<[XmppMessage]>>()
  private presenceListeners = new Set<Listener<[XmppPresence]>>()
  private feedPostListeners = new Set<Listener<[XmppFeedPost]>>()
  private connectionListeners = new Set<Listener<[string, boolean]>>()

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
}
