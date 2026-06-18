import { xml } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import {
  XmppFeedPost,
  XmppFeedSubscriptionRecord,
  XmppFeedFollower,
  XmppFollowerWatch,
  XmppFeedVisibility
} from './xmpp-records.js'
import { PUBSUB_EVENT_XMLNS } from './xmpp-discovery.js'
import { buildMicroblogEntry, buildTagUri, deriveMicroblogTitle } from './xmpp-atom.js'

export interface XmppFeedContext {
  jid: string
  ready: Promise<void>
  libp2p: any
  feedHistory: Map<string, XmppFeedPost>
  feedSubscriptions: Map<string, XmppFeedSubscriptionRecord>
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  getPubSubService(): any
  ensureTopicValidator(topic: string, kind: 'feed' | 'attachment' | 'subscription' | 'secure' | 'collection'): void
  normalizeFeedSubscription(subscription: Partial<XmppFeedSubscriptionRecord> & { peerId: string; jid: string; topic: string }): XmppFeedSubscriptionRecord
  recordFeedSubscription(subscription: XmppFeedSubscriptionRecord): Promise<boolean>
  watchFollowerTopic(peerId: string): Promise<void>
  publishSubscriptionDeclaration(subscription: XmppFeedSubscriptionRecord, action: 'upsert' | 'remove'): Promise<void>
  scheduleSubscriptionPersist(): Promise<void>
  feedTopicForPeer(peerId: string): string
  followerTopicForPeer(peerId: string): string
  jidFromPeerId(peerId: string): string
  peerIdFromJid(jid: string): string
  parsePeerReference(peerAddr: string | Multiaddr): { peerId: string }
  requestFollowersFromPeer(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]>
  getFollowersForPeer(peerId: string): XmppFeedFollower[]
  followerKey(feedPeerId: string, followerPeerId: string): string
  recordFeedPost(post: XmppFeedPost): Promise<boolean>
}

export async function subscribeFeed(ctx: XmppFeedContext, peerAddr: string | Multiaddr, options: { visibility?: XmppFeedVisibility } = {}): Promise<XmppFeedSubscriptionRecord> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const topic = ctx.feedTopicForPeer(peerId)
  const pubsub = ctx.getPubSubService()
  ctx.ensureTopicValidator(topic, 'feed')
  ctx.ensureTopicValidator(topic, 'attachment')
  await pubsub.subscribe(topic)
  const subscription = ctx.normalizeFeedSubscription({
    peerId,
    jid: ctx.jidFromPeerId(peerId),
    topic,
    subscribedAt: new Date().toISOString(),
    visibility: options.visibility ?? 'private',
    updatedAt: new Date().toISOString()
  })
  await ctx.recordFeedSubscription(subscription)
  await ctx.watchFollowerTopic(peerId)
  if (subscription.visibility === 'public') {
    await ctx.publishSubscriptionDeclaration(subscription, 'upsert')
  }
  return subscription
}

export async function setFeedSubscriptionVisibility(ctx: XmppFeedContext, peerAddr: string | Multiaddr, visibility: XmppFeedVisibility): Promise<XmppFeedSubscriptionRecord> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const topic = ctx.feedTopicForPeer(peerId)
  const existing = ctx.feedSubscriptions.get(topic)
  if (!existing) {
    return await subscribeFeed(ctx, peerAddr, { visibility })
  }

  const next = ctx.normalizeFeedSubscription({
    ...existing,
    visibility,
    updatedAt: new Date().toISOString()
  })
  await ctx.recordFeedSubscription(next)
  if (visibility === 'public') {
    await ctx.publishSubscriptionDeclaration(next, 'upsert')
  } else {
    await ctx.publishSubscriptionDeclaration(next, 'remove')
  }
  return next
}

export async function unsubscribeFeed(ctx: XmppFeedContext, peerAddr: string | Multiaddr): Promise<void> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const topic = ctx.feedTopicForPeer(peerId)
  const pubsub = ctx.getPubSubService()
  const existing = ctx.feedSubscriptions.get(topic)
  if (existing && existing.visibility === 'public') {
    await ctx.publishSubscriptionDeclaration(existing, 'remove')
  }
  await pubsub.unsubscribe(topic)
  ctx.feedSubscriptions.delete(topic)
  await ctx.scheduleSubscriptionPersist()
}

export async function publishFeed(ctx: XmppFeedContext, body: string, options: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string } = {}): Promise<string> {
  const pubsub = ctx.getPubSubService()
  const topic = options.topic ?? ctx.feedTopicForPeer(ctx.libp2p.peerId.toString())
  ctx.ensureTopicValidator(topic, 'feed')
  ctx.ensureTopicValidator(topic, 'attachment')
  await pubsub.subscribe(topic)
  const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
  const publishedAt = new Date().toISOString()
  const title = options.title?.trim() || deriveMicroblogTitle(body)
  const entry = buildMicroblogEntry({
    id: itemId,
    topic,
    from: ctx.jid,
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
    alternateHref: `xmpp:${ctx.jid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`
  })
  const stanza = xml(
    'message',
    {
      from: ctx.jid,
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

  await ctx.recordFeedPost({
    id: itemId,
    topic,
    from: ctx.jid,
    body,
    publishedAt,
    updatedAt: publishedAt,
    receivedAt: publishedAt,
    atomId: buildTagUri(ctx.jid, publishedAt, itemId),
    title,
    summary: options.summary,
    author: options.author ?? ctx.jid,
    contentType: 'text',
    categories: options.categories,
    links: [{
      rel: 'alternate',
      href: `xmpp:${ctx.jid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`
    }]
  })

  return itemId
}

export async function getFeedPosts(ctx: XmppFeedContext): Promise<XmppFeedPost[]> {
  await ctx.ready
  return Array.from(ctx.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export async function getFeedSubscriptions(ctx: XmppFeedContext): Promise<XmppFeedSubscriptionRecord[]> {
  await ctx.ready
  return Array.from(ctx.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
}

export async function getPublicFeedSubscriptions(ctx: XmppFeedContext): Promise<XmppFeedSubscriptionRecord[]> {
  await ctx.ready
  return Array.from(ctx.feedSubscriptions.values())
    .filter(subscription => subscription.visibility === 'public')
    .sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
}

export async function watchFeedFollowers(ctx: XmppFeedContext, peerAddr: string | Multiaddr): Promise<XmppFollowerWatch> {
  const parsed = ctx.parsePeerReference(peerAddr)
  const peerId = parsed.peerId || ctx.peerIdFromJid(peerAddr.toString())
  const topic = ctx.followerTopicForPeer(peerId)
  await ctx.watchFollowerTopic(peerId)
  return {
    peerId,
    topic,
    watchedAt: new Date().toISOString()
  }
}

export async function getFeedFollowers(ctx: XmppFeedContext, peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]> {
  const parsed = ctx.parsePeerReference(peerAddr)
  const peerId = parsed.peerId || ctx.peerIdFromJid(peerAddr.toString())
  await ctx.watchFollowerTopic(peerId)

  if (peerId === ctx.libp2p.peerId.toString()) {
    return ctx.getFollowersForPeer(peerId)
      .filter(follower => follower.visibility === 'public')
      .sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  const remoteFollowers = await ctx.requestFollowersFromPeer(peerAddr)
  const merged = new Map<string, XmppFeedFollower>()

  for (const follower of [...ctx.getFollowersForPeer(peerId), ...remoteFollowers]) {
    if (follower.visibility !== 'public') {
      continue
    }
    merged.set(ctx.followerKey(follower.feedPeerId, follower.followerPeerId), follower)
  }

  return Array.from(merged.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
}
