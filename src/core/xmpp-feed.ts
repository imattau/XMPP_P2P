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

  public async restoreFeedSubscriptions() {
    for (const subscription of this.feedSubscriptions.values()) {
      if (subscription.visibility === 'public') {
        await this.publishSubscriptionDeclaration(subscription, 'upsert')
      }
      await this.watchFollowerTopic(subscription.peerId)
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

  public async recordFeedPost(post: XmppFeedPost): Promise<boolean> {
    await this.ctx.ready
    const normalized = normalizeFeedPost(post)
    const key = feedHistoryKey(normalized.topic, normalized.id)
    if (this.feedHistory.has(key)) {
      return false
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
    await this.ctx.propagateFeedToCollections(normalized)
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
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
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
    if (subscription.visibility === 'public') {
      await this.publishSubscriptionDeclaration(subscription, 'upsert')
    }
    return subscription
  }

  public async setFeedSubscriptionVisibility(peerAddr: string | Multiaddr, visibility: XmppFeedVisibility): Promise<XmppFeedSubscriptionRecord> {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
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
    if (visibility === 'public') {
      await this.publishSubscriptionDeclaration(next, 'upsert')
    } else {
      await this.publishSubscriptionDeclaration(next, 'remove')
    }
    return next
  }

  public async unsubscribeFeed(peerAddr: string | Multiaddr): Promise<void> {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const topic = feedTopicForPeer(peerId)
    const pubsub = this.ctx.getPubSubService()
    const existing = this.feedSubscriptions.get(topic)
    if (existing && existing.visibility === 'public') {
      await this.publishSubscriptionDeclaration(existing, 'remove')
    }
    await pubsub.unsubscribe(topic)
    this.feedSubscriptions.delete(topic)
    await this.scheduleSubscriptionPersist()
  }

  public async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string } = {}): Promise<string> {
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
      alternateHref: `xmpp:${this.ctx.jid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`
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
      links: [{
        rel: 'alternate',
        href: `xmpp:${this.ctx.jid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`
      }]
    })

    return itemId
  }

  public async getFeedPosts(): Promise<XmppFeedPost[]> {
    await this.ctx.ready
    return Array.from(this.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
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
