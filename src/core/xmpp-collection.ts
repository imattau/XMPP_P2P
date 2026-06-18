import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import {
  XmppCollectionNode,
  XmppCollectionSubscription,
  XmppCollectionPost,
  XmppAttachment,
  XmppAttachmentSummary,
  XmppCollectionMember,
  XmppFeedPost,
  XmppAttachmentKind
} from './xmpp-records.js'

export interface XmppCollectionContext {
  jid: string
  ready: Promise<void>
  collections: Map<string, XmppCollectionNode>
  collectionSubscriptions: Map<string, XmppCollectionSubscription>
  collectionHistory: Map<string, XmppCollectionPost>
  attachmentHistory: Map<string, XmppAttachment>
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  getPubSubService(): any
  ensureTopicValidator(topic: string, kind: 'feed' | 'attachment' | 'subscription' | 'secure' | 'collection'): void
  indexCollectionMembers(collection: XmppCollectionNode): void
  unindexCollectionMembers(collection: XmppCollectionNode): void
  scheduleCollectionPersist(): Promise<void>
  normalizeCollection(collection: Partial<XmppCollectionNode> & { id: string }): XmppCollectionNode
  normalizeCollectionMember(member: Partial<XmppCollectionMember> & { jid: string; peerId: string; feedTopic: string }): XmppCollectionMember
  collectionTopicForId(id: string): string
  feedTopicForPeer(peerId: string): string
  jidFromPeerId(peerId: string): string
  peerIdFromJid(jid: string): string
  parsePeerReference(peerAddr: string | Multiaddr): { peerId: string }
  publishCollectionPost(collectionId: string, feedPost: XmppFeedPost): Promise<string>
  publishAttachment(topic: string, targetId: string, kind: XmppAttachmentKind, value?: string, options?: { itemId?: string }): Promise<string>
  emitCollectionChange(collection: XmppCollectionNode): void
  emitCollectionSubscribe(subscription: XmppCollectionSubscription): void
}

export async function createCollection(ctx: XmppCollectionContext, id: string, name?: string): Promise<XmppCollectionNode> {
  const existing = ctx.collections.get(id)
  const collection = ctx.normalizeCollection({
    ...(existing ?? { id, createdAt: new Date().toISOString() }),
    id,
    name: name ?? existing?.name,
    topic: ctx.collectionTopicForId(id),
    members: existing?.members ?? [],
    updatedAt: new Date().toISOString()
  })

  ctx.collections.set(id, collection)
  ctx.indexCollectionMembers(collection)
  ctx.ensureTopicValidator(collection.topic, 'collection')
  ctx.ensureTopicValidator(collection.topic, 'attachment')
  await ctx.getPubSubService().subscribe(collection.topic)
  ctx.collectionSubscriptions.set(id, {
    id,
    topic: collection.topic,
    subscribedAt: new Date().toISOString()
  })
  await ctx.scheduleCollectionPersist()
  ctx.emitCollectionChange(collection)
  return collection
}

export async function addFeedToCollection(ctx: XmppCollectionContext, collectionId: string, peerAddr: string | Multiaddr): Promise<XmppCollectionNode> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const jid = ctx.jidFromPeerId(peerId)
  const feedTopic = ctx.feedTopicForPeer(peerId)
  const current = ctx.collections.get(collectionId) ?? await createCollection(ctx, collectionId)

  ctx.ensureTopicValidator(feedTopic, 'feed')
  ctx.ensureTopicValidator(feedTopic, 'attachment')
  await ctx.getPubSubService().subscribe(feedTopic)

  const existingMember = current.members.find(member => member.feedTopic === feedTopic)
  const nextMember = ctx.normalizeCollectionMember({
    jid,
    peerId,
    feedTopic,
    addedAt: existingMember?.addedAt
  })
  const members = existingMember
    ? current.members.map(member => member.feedTopic === feedTopic ? nextMember : member)
    : [...current.members, nextMember]

  const next = ctx.normalizeCollection({
    ...current,
    members,
    updatedAt: new Date().toISOString()
  })

  ctx.unindexCollectionMembers(current)
  ctx.collections.set(collectionId, next)
  ctx.indexCollectionMembers(next)
  await ctx.scheduleCollectionPersist()
  ctx.emitCollectionChange(next)
  return next
}

export async function subscribeCollection(ctx: XmppCollectionContext, id: string): Promise<XmppCollectionSubscription> {
  const collection = ctx.collections.get(id) ?? await createCollection(ctx, id)
  ctx.ensureTopicValidator(collection.topic, 'collection')
  ctx.ensureTopicValidator(collection.topic, 'attachment')
  await ctx.getPubSubService().subscribe(collection.topic)
  const subscription: XmppCollectionSubscription = {
    id,
    topic: collection.topic,
    subscribedAt: new Date().toISOString()
  }
  ctx.collectionSubscriptions.set(id, subscription)
  ctx.emitCollectionSubscribe(subscription)
  return subscription
}

export async function publishCollection(ctx: XmppCollectionContext, id: string, body: string, options: { itemId?: string; title?: string; author?: string } = {}): Promise<string> {
  const collection = ctx.collections.get(id) ?? await createCollection(ctx, id)
  const feedPost: XmppFeedPost = {
    id: options.itemId ?? Math.random().toString(36).substring(2, 11),
    topic: collection.topic,
    from: ctx.jid,
    body,
    publishedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    title: options.title,
    author: options.author ?? ctx.jid
  }

  return await ctx.publishCollectionPost(id, feedPost)
}

export async function getCollections(ctx: XmppCollectionContext): Promise<XmppCollectionNode[]> {
  await ctx.ready
  return Array.from(ctx.collections.values()).sort((a, b) => a.id.localeCompare(b.id))
}

export async function getCollectionSubscriptions(ctx: XmppCollectionContext): Promise<XmppCollectionSubscription[]> {
  await ctx.ready
  return Array.from(ctx.collectionSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
}

export async function getCollectionPosts(ctx: XmppCollectionContext, collectionId?: string): Promise<XmppCollectionPost[]> {
  await ctx.ready
  const posts = Array.from(ctx.collectionHistory.values())
  return collectionId ? posts.filter(post => post.collectionId === collectionId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) : posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export async function getAttachments(ctx: XmppCollectionContext, topic?: string, targetId?: string): Promise<XmppAttachment[]> {
  await ctx.ready
  const attachments = Array.from(ctx.attachmentHistory.values())
  return attachments
    .filter(attachment => topic ? attachment.topic === topic : true)
    .filter(attachment => targetId ? attachment.targetId === targetId : true)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export async function getAttachmentSummaries(ctx: XmppCollectionContext, topic?: string): Promise<XmppAttachmentSummary[]> {
  await ctx.ready
  const summaries = new Map<string, XmppAttachmentSummary>()
  for (const attachment of ctx.attachmentHistory.values()) {
    if (topic && attachment.topic !== topic) {
      continue
    }
    const key = `${attachment.topic}:${attachment.targetId}`
    const current = summaries.get(key) ?? {
      topic: attachment.topic,
      targetId: attachment.targetId,
      total: 0,
      noticed: 0,
      reactions: 0,
      reactionCounts: {},
      updatedAt: attachment.publishedAt
    }
    current.total += 1
    if (attachment.kind === 'noticed') {
      current.noticed += 1
    } else {
      current.reactions += 1
      if (attachment.value) {
        current.reactionCounts[attachment.value] = (current.reactionCounts[attachment.value] ?? 0) + 1
      }
    }
    if (attachment.publishedAt > current.updatedAt) {
      current.updatedAt = attachment.publishedAt
    }
    summaries.set(key, current)
  }
  return Array.from(summaries.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
