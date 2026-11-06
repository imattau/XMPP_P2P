/**
 * @packageDocumentation Feed subscription, follower tracking, and feed history
 * persistence for XMPP microblog-style posts.
 */

import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import {
  XmppFeedPost,
  XmppFeedSubscriptionRecord,
  XmppFeedFollower,
  XmppFollowerWatch,
  XmppFeedVisibility,
  XmppAtomLink,
  feedTopicForPeer,
  followerTopicForPeer,
  jidFromPeerId,
  peerIdFromJid,
  parsePeerReference,
  followerKey,
  normalizeFeedSubscription,
  feedSubscriptionKey,
  feedHistoryKey,
  followerKey as followerKeyRecord,
  normalizeFeedPost,
  normalizeFollower
} from './xmpp-records.js'
import { PUBSUB_EVENT_XMLNS, PAM_XMLNS } from './xmpp-discovery.js'
import { buildMicroblogEntry, buildTagUri, deriveMicroblogTitle } from './xmpp-atom.js'
import {
  loadFeedHistoryState,
  loadSubscriptionState,
  loadFollowerState,
  persistFeedHistoryState,
  persistSubscriptionState,
  persistFollowerState
} from './xmpp-persistence.js'
import { XmppStorage } from './storage/types.js'

const FEED_HISTORY_LIMIT = 50
const SUBSCRIPTION_HISTORY_LIMIT = 200
const FEED_HISTORY_XMLNS = 'urn:xmpp:p2p:feed-history:1'

/**
 * Dependencies required by the feed manager.
 */
export interface XmppFeedContext {
  jid: string
  ready: Promise<void>
  libp2p: any
  storage: XmppStorage
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  getStreamByJid(jid: string): XmppStream | undefined
  getPubSubService(): any
  ensureTopicValidator(topic: string, kind: 'feed' | 'attachment' | 'subscription' | 'secure' | 'collection'): void
  sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs?: number): Promise<Element>
  emit(event: string, ...args: any[]): boolean
  propagateFeedToCollections(post: XmppFeedPost): Promise<void>
  requestFollowersFromPeer(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]>
}

/**
 * Manages local feed history, subscriptions, and follower visibility state.
 */
export class XmppFeedManager {
  private readonly ctx: XmppFeedContext
  public readonly feedHistory = new Map<string, XmppFeedPost>()
  public readonly feedSubscriptions = new Map<string, XmppFeedSubscriptionRecord>()
  public readonly followers = new Map<string, XmppFeedFollower>()
  public readonly followerWatches = new Map<string, XmppFollowerWatch>()
  private readonly discoveredFeedPeers = new Map<string, string>()
  private feedSaveQueue: Promise<void> = Promise.resolve()
  private subscriptionSaveQueue: Promise<void> = Promise.resolve()
  private followerSaveQueue: Promise<void> = Promise.resolve()

  constructor(ctx: XmppFeedContext) {
    this.ctx = ctx
  }

  public async initialize(): Promise<void> {
    await this.loadFeedHistory()
    await this.loadSubscriptionState()
    await this.loadFollowerState()
    await this.ensureOwnFeedSubscription()
    await this.ensureOwnFollowerSubscription()
  }

  private async loadFeedHistory(): Promise<void> {
    await loadFeedHistoryState({
      storage: this.ctx.storage,
      feedHistory: this.feedHistory,
      normalizeFeedPost: normalizeFeedPost,
      feedHistoryKey: feedHistoryKey
    } as any, FEED_HISTORY_LIMIT)
  }

  private async loadSubscriptionState(): Promise<void> {
    await loadSubscriptionState({
      storage: this.ctx.storage,
      feedSubscriptions: this.feedSubscriptions,
      normalizeFeedSubscription: normalizeFeedSubscription,
      feedSubscriptionKey: feedSubscriptionKey,
      restoreFeedSubscriptions: this.restoreFeedSubscriptions.bind(this)
    } as any, SUBSCRIPTION_HISTORY_LIMIT)
  }

  private async loadFollowerState(): Promise<void> {
    await loadFollowerState({
      storage: this.ctx.storage,
      followers: this.followers,
      normalizeFollower: normalizeFollower,
      followerKey: followerKeyRecord,
      restoreFollowerSubscriptions: this.restoreFollowerSubscriptions.bind(this)
    } as any, SUBSCRIPTION_HISTORY_LIMIT)
  }

  public async persistFeedHistory(): Promise<void> {
    await persistFeedHistoryState({
      storage: this.ctx.storage,
      feedHistory: this.feedHistory
    } as any)
  }

  public scheduleFeedPersist(): Promise<void> {
    this.feedSaveQueue = this.feedSaveQueue
      .then(() => this.persistFeedHistory())
      .catch(err => {
        console.error('[XMPP] Failed to persist feed history:', err)
      })
    return this.feedSaveQueue
  }

  public async persistSubscriptionState(): Promise<void> {
    await persistSubscriptionState({
      storage: this.ctx.storage,
      feedSubscriptions: this.feedSubscriptions
    } as any)
  }

  public scheduleSubscriptionPersist(): Promise<void> {
    this.subscriptionSaveQueue = this.subscriptionSaveQueue
      .then(() => this.persistSubscriptionState())
      .catch(err => {
        console.error('[XMPP] Failed to persist subscription state:', err)
      })
    return this.subscriptionSaveQueue
  }

  public async persistFollowerState(): Promise<void> {
    await persistFollowerState({
      storage: this.ctx.storage,
      followers: this.followers
    } as any)
  }

  public scheduleFollowerPersist(): Promise<void> {
    this.followerSaveQueue = this.followerSaveQueue
      .then(() => this.persistFollowerState())
      .catch(err => {
        console.error('[XMPP] Failed to persist follower state:', err)
      })
    return this.followerSaveQueue
  }

  public async ensureOwnFeedSubscription(): Promise<void> {
    const pubsub = this.ctx.getPubSubService()
    if (!pubsub) return

    try {
      const topic = feedTopicForPeer(this.ctx.libp2p.peerId.toString())
      this.ctx.ensureTopicValidator(topic, 'feed')
      this.ctx.ensureTopicValidator(topic, 'attachment')
      await pubsub.subscribe(topic)
    } catch (err) {
      console.error('[XMPP] Failed to subscribe to own feed topic:', err)
    }
  }

  public async ensureOwnFollowerSubscription(): Promise<void> {
    const pubsub = this.ctx.getPubSubService()
    if (!pubsub) return

    try {
      const topic = followerTopicForPeer(this.ctx.libp2p.peerId.toString())
      this.ctx.ensureTopicValidator(topic, 'subscription')
      await pubsub.subscribe(topic)
    } catch (err) {
      console.error('[XMPP] Failed to subscribe to own follower topic:', err)
    }
  }

  /**
   * Temporarily subscribe to a nearby peer's public feed so its posts can
   * appear in the timeline before the user chooses to follow or add them.
   */
  public async previewDiscoveredFeed(peerId: string, peerAddr: string | Multiaddr): Promise<void> {
    await this.ctx.ready
    const topic = feedTopicForPeer(peerId)
    if (this.feedSubscriptions.has(topic)) return
    if (this.discoveredFeedPeers.has(peerId)) {
      this.discoveredFeedPeers.set(peerId, peerAddr.toString())
      return
    }

    const pubsub = this.ctx.getPubSubService()
    this.ctx.ensureTopicValidator(topic, 'feed')
    this.ctx.ensureTopicValidator(topic, 'attachment')
    await pubsub.subscribe(topic)
    this.discoveredFeedPeers.set(peerId, peerAddr.toString())

    try {
      await this.syncFeedHistory(peerAddr, peerId, topic)
    } catch (error) {
      // Live public posts still arrive through PubSub when history sync fails.
      console.warn(`[XMPP] Could not preview recent feed history for ${peerId}:`, error)
    }
  }

  public async stopPreviewingDiscoveredFeed(peerId: string): Promise<void> {
    if (!this.discoveredFeedPeers.delete(peerId)) return
    const topic = feedTopicForPeer(peerId)
    if (this.feedSubscriptions.has(topic)) return
    await this.ctx.getPubSubService().unsubscribe(topic)
  }

  public async stopAllDiscoveredFeedPreviews(): Promise<void> {
    for (const peerId of [...this.discoveredFeedPeers.keys()]) {
      try {
        await this.stopPreviewingDiscoveredFeed(peerId)
      } catch (error) {
        console.warn(`[XMPP] Could not stop nearby peer feed preview ${peerId}:`, error)
      }
    }
  }

  public async restoreFeedSubscriptions() {
    const pubsub = this.ctx.getPubSubService()
    for (const subscription of this.feedSubscriptions.values()) {
      try {
        this.ctx.ensureTopicValidator(subscription.topic, 'feed')
        this.ctx.ensureTopicValidator(subscription.topic, 'attachment')
        await pubsub.subscribe(subscription.topic)
        if (subscription.visibility === 'public') {
          await this.publishSubscriptionDeclaration(subscription, 'upsert')
        }
        await this.watchFollowerTopic(subscription.peerId)
      } catch (error) {
        console.error(`[XMPP] Failed to restore feed subscription ${subscription.topic}:`, error)
      }
    }
  }

  public async announcePublicSubscriptionsForPeer(peerId: string) {
    for (const subscription of this.feedSubscriptions.values()) {
      if (subscription.peerId !== peerId || subscription.visibility !== 'public') {
        continue
      }
      await this.publishSubscriptionDeclaration(subscription, 'upsert')
    }
  }

  public async restoreFollowerSubscriptions() {
    await this.watchFollowerTopic(this.ctx.libp2p.peerId.toString())
  }

  public async watchFollowerTopic(peerId: string): Promise<void> {
    const topic = followerTopicForPeer(peerId)
    if (this.followerWatches.has(topic)) {
      return
    }

    this.ctx.ensureTopicValidator(topic, 'subscription')
    await this.ctx.getPubSubService().subscribe(topic)
    this.followerWatches.set(topic, {
      peerId,
      topic,
      watchedAt: new Date().toISOString()
    })
  }

  public async publishSubscriptionDeclaration(subscription: XmppFeedSubscriptionRecord, action: 'upsert' | 'remove') {
    const pubsub = this.ctx.getPubSubService()
    const itemId = feedSubscriptionKey(subscription.topic)
    const followerTopic = followerTopicForPeer(subscription.peerId)
    const updatedAt = new Date().toISOString()
    this.ctx.ensureTopicValidator(followerTopic, 'subscription')

    const stanza = xml(
      'message',
      {
        from: this.ctx.jid,
        to: 'pubsub.p2p',
        type: 'headline'
      },
      xml(
        'event',
        { xmlns: PUBSUB_EVENT_XMLNS },
        xml(
          'items',
          { node: followerTopic },
          xml(
            'item',
            {
              id: itemId,
              feedPeerId: subscription.peerId,
              followerPeerId: this.ctx.libp2p.peerId.toString(),
              feedTopic: subscription.topic,
              visibility: subscription.visibility,
              action,
              subscribedAt: subscription.subscribedAt,
              updatedAt
            },
            xml(
              'subscription',
              { xmlns: PAM_XMLNS },
              xml('feed', { topic: subscription.topic }),
              xml('follower', { peerId: this.ctx.libp2p.peerId.toString(), jid: this.ctx.jid })
            )
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(followerTopic, bytes)

    const stream = this.ctx.getStreamByJid(jidFromPeerId(subscription.peerId))
    if (stream) {
      stream.send(stanza)
    }
  }

  public async recordFeedPost(post: XmppFeedPost, options: { propagateToCollections?: boolean; updateExisting?: boolean } = {}): Promise<boolean> {
    await this.ctx.ready
    const normalized = normalizeFeedPost(post)
    const key = feedHistoryKey(normalized.topic, normalized.id)
    const existing = this.feedHistory.get(key)
    if (existing) {
      if (options.updateExisting !== true) return false
      // PubSub item IDs are stable across edits. Replace changed server items
      // in place so the timeline reflects the latest published entry.
      if (JSON.stringify(existing) === JSON.stringify(normalized)) return false
      this.feedHistory.set(key, normalized)
      await this.scheduleFeedPersist()
      this.ctx.emit('feed:post', normalized)
      return true
    }

    this.feedHistory.set(key, normalized)

    while (this.feedHistory.size > FEED_HISTORY_LIMIT) {
      const oldestKey = this.feedHistory.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.feedHistory.delete(oldestKey)
    }

    await this.scheduleFeedPersist()
    this.ctx.emit('feed:post', normalized)
    if (options.propagateToCollections !== false) {
      await this.ctx.propagateFeedToCollections(normalized)
    }
    return true
  }

  public async recordFeedSubscription(subscription: XmppFeedSubscriptionRecord, announce = true): Promise<boolean> {
    await this.ctx.ready
    const normalized = normalizeFeedSubscription(subscription)
    const key = feedSubscriptionKey(normalized.topic)
    const existing = this.feedSubscriptions.get(key)
    if (
      existing &&
      existing.peerId === normalized.peerId &&
      existing.visibility === normalized.visibility &&
      existing.updatedAt === normalized.updatedAt
    ) {
      return false
    }

    this.feedSubscriptions.set(key, normalized)
    while (this.feedSubscriptions.size > SUBSCRIPTION_HISTORY_LIMIT) {
      const oldestKey = this.feedSubscriptions.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.feedSubscriptions.delete(oldestKey)
    }

    await this.scheduleSubscriptionPersist()
    if (announce) {
      this.ctx.emit('feed:subscribe', normalized)
      this.ctx.emit('feed:visibility', normalized)
    }
    return true
  }

  public async recordFollower(follower: XmppFeedFollower): Promise<boolean> {
    await this.ctx.ready
    const normalized = normalizeFollower(follower)
    const key = followerKeyRecord(normalized.feedPeerId, normalized.followerPeerId)
    const existing = this.followers.get(key)
    if (
      existing &&
      existing.visibility === normalized.visibility &&
      existing.updatedAt === normalized.updatedAt
    ) {
      return false
    }

    this.followers.set(key, normalized)

    while (this.followers.size > SUBSCRIPTION_HISTORY_LIMIT) {
      const oldestKey = this.followers.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.followers.delete(oldestKey)
    }

    await this.scheduleFollowerPersist()
    this.ctx.emit('feed:follower', normalized)
    return true
  }

  public async removeFollower(feedPeerId: string, followerPeerId: string): Promise<void> {
    const key = followerKeyRecord(feedPeerId, followerPeerId)
    if (!this.followers.delete(key)) {
      return
    }
    await this.scheduleFollowerPersist()
  }

  public getFeedSubscriptionByTopic(topic: string): XmppFeedSubscriptionRecord | undefined {
    return this.feedSubscriptions.get(feedSubscriptionKey(topic))
  }

  public getFollowersForPeer(peerId: string): XmppFeedFollower[] {
    return Array.from(this.followers.values()).filter(follower => follower.feedPeerId === peerId)
  }

  public async subscribeFeed(peerAddr: string | Multiaddr, options: { visibility?: XmppFeedVisibility } = {}): Promise<XmppFeedSubscriptionRecord> {
    const peerReference = parsePeerReference(peerAddr)
    const peerId = peerReference.peerId || peerIdFromJid(peerAddr.toString())
    if (!peerId) throw new Error('A peer address is required to follow a feed')
    const topic = feedTopicForPeer(peerId)
    const pubsub = this.ctx.getPubSubService()
    this.ctx.ensureTopicValidator(topic, 'feed')
    this.ctx.ensureTopicValidator(topic, 'attachment')
    await pubsub.subscribe(topic)
    const subscription = normalizeFeedSubscription({
      peerId,
      jid: jidFromPeerId(peerId),
      topic,
      subscribedAt: new Date().toISOString(),
      visibility: options.visibility ?? 'private',
      updatedAt: new Date().toISOString()
    })
    await this.recordFeedSubscription(subscription)
    await this.watchFollowerTopic(peerId)
    try {
      await this.syncFeedHistory(peerAddr, peerId, topic)
    } catch (error) {
      // Live gossip follow does not depend on a direct XMPP stream. History sync
      // can be retried when a peer route becomes available.
      console.warn(`[XMPP] Could not sync recent feed history for ${peerId}:`, error)
    }
    if (subscription.visibility === 'public') {
      await this.publishSubscriptionDeclaration(subscription, 'upsert')
    }
    return subscription
  }

  public async setFeedSubscriptionVisibility(peerAddr: string | Multiaddr, visibility: XmppFeedVisibility): Promise<XmppFeedSubscriptionRecord> {
    const peerReference = parsePeerReference(peerAddr)
    const peerId = peerReference.peerId || peerIdFromJid(peerAddr.toString())
    if (!peerId) throw new Error('A peer address is required to update feed visibility')
    const topic = feedTopicForPeer(peerId)
    const existing = this.feedSubscriptions.get(topic)
    if (!existing) {
      return await this.subscribeFeed(peerAddr, { visibility })
    }

    const next = normalizeFeedSubscription({
      ...existing,
      visibility,
      updatedAt: new Date().toISOString()
    })
    await this.recordFeedSubscription(next)
    try {
      await this.ctx.getOrCreateStream(peerAddr)
    } catch {
      // A direct XMPP stream improves delivery to the feed owner, but visibility
      // updates still propagate through PubSub when the peer is not dialable.
    }
    if (visibility === 'public') {
      await this.publishSubscriptionDeclaration(next, 'upsert')
    } else {
      await this.publishSubscriptionDeclaration(next, 'remove')
    }
    return next
  }

  public async unsubscribeFeed(peerAddr: string | Multiaddr): Promise<void> {
    const peerReference = parsePeerReference(peerAddr)
    const peerId = peerReference.peerId || peerIdFromJid(peerAddr.toString())
    if (!peerId) throw new Error('A peer address is required to unfollow a feed')
    const topic = feedTopicForPeer(peerId)
    const pubsub = this.ctx.getPubSubService()
    const existing = this.feedSubscriptions.get(topic)
    let declarationError: unknown
    if (existing && existing.visibility === 'public') {
      try {
        await this.publishSubscriptionDeclaration(existing, 'remove')
      } catch (error) {
        declarationError = error
      }
    }
    await pubsub.unsubscribe(topic)
    this.feedSubscriptions.delete(topic)
    await this.scheduleSubscriptionPersist()
    if (declarationError) {
      throw new Error(`Feed unfollowed locally, but the removal could not be announced: ${declarationError instanceof Error ? declarationError.message : 'network error'}`)
    }
  }

  public async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string; replyTo?: string; links?: XmppAtomLink[] } = {}): Promise<string> {
    const pubsub = this.ctx.getPubSubService()
    const topic = options.topic ?? feedTopicForPeer(this.ctx.libp2p.peerId.toString())
    this.ctx.ensureTopicValidator(topic, 'feed')
    this.ctx.ensureTopicValidator(topic, 'attachment')
    await pubsub.subscribe(topic)
    const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
    const publishedAt = new Date().toISOString()
    const title = options.title?.trim() || deriveMicroblogTitle(body)
    const entry = buildMicroblogEntry({
      id: itemId,
      topic,
      from: this.ctx.jid,
      body,
      publishedAt,
      updatedAt: publishedAt,
      receivedAt: publishedAt,
      title,
      replyTo: options.replyTo,
      summary: options.summary,
      categories: options.categories,
      author: options.author
    }, {
      title,
      summary: options.summary,
      categories: options.categories,
      author: options.author,
      publishedAt,
      updatedAt: publishedAt,
      alternateHref: `xmpp:${this.ctx.jid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`,
      replyTo: options.replyTo,
      links: options.links
    })
    const stanza = xml(
      'message',
      {
        from: this.ctx.jid,
        to: 'pubsub.p2p',
        type: 'headline'
      },
      xml('body', {}, title),
      xml(
        'event',
        { xmlns: PUBSUB_EVENT_XMLNS },
        xml(
          'items',
          { node: topic },
          xml(
            'item',
            { id: itemId },
            entry
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(topic, bytes)

    await this.recordFeedPost({
      id: itemId,
      topic,
      from: this.ctx.jid,
      body,
      publishedAt,
      updatedAt: publishedAt,
      receivedAt: publishedAt,
      atomId: buildTagUri(this.ctx.jid, publishedAt, itemId),
      title,
      summary: options.summary,
      author: options.author ?? this.ctx.jid,
      contentType: 'text',
      categories: options.categories,
      replyTo: options.replyTo,
      links: [{
        rel: 'alternate',
        href: `xmpp:${this.ctx.jid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`
      }, ...(options.links ?? [])]
    })

    return itemId
  }

  public async getFeedPosts(): Promise<XmppFeedPost[]> {
    await this.ctx.ready
    return Array.from(this.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  public async getFeedPostsForPeer(peerId: string): Promise<XmppFeedPost[]> {
    await this.ctx.ready
    const topic = feedTopicForPeer(peerId)
    return Array.from(this.feedHistory.values())
      .filter(post => post.topic === topic && post.from === jidFromPeerId(peerId))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, FEED_HISTORY_LIMIT)
  }

  private async syncFeedHistory(peerAddr: string | Multiaddr, peerId: string, topic: string): Promise<void> {
    const id = `feed-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const request = xml('iq', {
      type: 'get',
      id,
      to: jidFromPeerId(peerId),
      from: this.ctx.jid
    }, xml('query', { xmlns: FEED_HISTORY_XMLNS }))
    const response = await this.ctx.sendIqRequest(peerAddr, request)
    const result = response.getChild('query')
    if (!result || result.attrs.xmlns !== FEED_HISTORY_XMLNS) {
      throw new Error('Peer returned an invalid feed history response')
    }
    const entries = (result.children as any[]).filter((child): child is Element => child?.name === 'post')
    for (const entry of entries) {
      try {
        const post = JSON.parse(entry.text()) as XmppFeedPost
        if (post.topic !== topic || post.from !== jidFromPeerId(peerId)
          || typeof post.id !== 'string' || typeof post.body !== 'string') continue
        await this.recordFeedPost(post)
      } catch {
        // Ignore malformed history entries and retain the valid entries already received.
      }
    }
  }

  public async getFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    await this.ctx.ready
    return Array.from(this.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  public async getPublicFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    await this.ctx.ready
    return Array.from(this.feedSubscriptions.values())
      .filter(subscription => subscription.visibility === 'public')
      .sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  public async watchFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFollowerWatch> {
    const parsed = parsePeerReference(peerAddr)
    const peerId = parsed.peerId || peerIdFromJid(peerAddr.toString())
    const topic = followerTopicForPeer(peerId)
    await this.watchFollowerTopic(peerId)
    return {
      peerId,
      topic,
      watchedAt: new Date().toISOString()
    }
  }

  public async getFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]> {
    const parsed = parsePeerReference(peerAddr)
    const peerId = parsed.peerId || peerIdFromJid(peerAddr.toString())
    await this.watchFollowerTopic(peerId)

    if (peerId === this.ctx.libp2p.peerId.toString()) {
      return this.getFollowersForPeer(peerId)
        .filter(follower => follower.visibility === 'public')
        .sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
    }

    const remoteFollowers = await (this.ctx as any).requestFollowersFromPeer(peerAddr)
    const merged = new Map<string, XmppFeedFollower>()

    for (const follower of [...this.getFollowersForPeer(peerId), ...remoteFollowers]) {
      if (follower.visibility !== 'public') {
        continue
      }
      merged.set(followerKey(follower.feedPeerId, follower.followerPeerId), follower)
    }

    return Array.from(merged.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  public async close() {
    await this.feedSaveQueue
    await this.persistFeedHistory()
    await this.subscriptionSaveQueue
    await this.persistSubscriptionState()
    await this.followerSaveQueue
    await this.persistFollowerState()
  }
}
