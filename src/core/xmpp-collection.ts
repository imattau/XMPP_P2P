/**
 * @packageDocumentation Collection management for aggregating member feeds, syncing
 * subscriptions, and persisting collection history and attachments.
 */

import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import { XmppStorage } from './storage/types.js'
import {
  XmppCollectionNode,
  XmppCollectionSubscription,
  XmppCollectionPost,
  XmppAttachment,
  XmppAttachmentSummary,
  XmppCollectionMember,
  XmppFeedPost,
  XmppAttachmentKind,
  normalizeCollection,
  normalizeCollectionMember,
  normalizeCollectionPost,
  normalizeAttachment,
  collectionTopicForId,
  feedTopicForPeer,
  jidFromPeerId,
  peerIdFromJid,
  parsePeerReference,
  collectionHistoryKey,
  attachmentHistoryKey,
  buildAttachmentSummary
} from './xmpp-records.js'
import {
  loadCollectionState,
  loadAttachmentHistoryState,
  persistCollectionState,
  persistAttachmentHistoryState
} from './xmpp-persistence.js'
import { PUBSUB_EVENT_XMLNS } from './xmpp-discovery.js'
import { buildMicroblogEntry, deriveMicroblogTitle } from './xmpp-atom.js'

const ATTACHMENT_XMLNS = 'urn:xmpp:pubsub:attachments:0'
const COLLECTION_HISTORY_LIMIT = 100
const ATTACHMENT_HISTORY_LIMIT = 200

/**
 * Runtime dependencies required by the collection manager.
 */
export interface XmppCollectionContext {
  jid: string
  ready: Promise<void>
  storage: XmppStorage
  libp2p: any
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  getPubSubService(): any
  ensureTopicValidator(topic: string, kind: 'feed' | 'attachment' | 'subscription' | 'secure' | 'collection'): void
  emit(event: string, ...args: any[]): boolean
}

/**
 * Manages community collections and their aggregated content.
 */
export class XmppCollectionManager {
  private readonly ctx: XmppCollectionContext
  public readonly collections = new Map<string, XmppCollectionNode>()
  public readonly collectionSubscriptions = new Map<string, XmppCollectionSubscription>()
  public readonly collectionHistory = new Map<string, XmppCollectionPost>()
  public readonly collectionFeedIndex = new Map<string, Set<string>>()
  public readonly attachmentHistory = new Map<string, XmppAttachment>()

  private collectionSaveQueue: Promise<void> = Promise.resolve()
  private attachmentSaveQueue: Promise<void> = Promise.resolve()

  constructor(ctx: XmppCollectionContext) {
    this.ctx = ctx
  }

  public async initialize(): Promise<void> {
    await this.loadCollectionState()
    await this.loadAttachmentHistory()
  }

  private async loadCollectionState(): Promise<void> {
    await loadCollectionState({
      storage: this.ctx.storage,
      collections: this.collections,
      collectionSubscriptions: this.collectionSubscriptions,
      collectionHistory: this.collectionHistory,
      normalizeCollection: normalizeCollection,
      normalizeCollectionPost: normalizeCollectionPost,
      collectionHistoryKey: collectionHistoryKey,
      restoreCollectionSubscriptions: this.restoreCollectionSubscriptions.bind(this),
      onCollectionLoaded: this.indexCollectionMembers.bind(this)
    } as any, COLLECTION_HISTORY_LIMIT)
  }

  private async loadAttachmentHistory(): Promise<void> {
    await loadAttachmentHistoryState({
      storage: this.ctx.storage,
      attachmentHistory: this.attachmentHistory,
      normalizeAttachment: normalizeAttachment,
      attachmentHistoryKey: attachmentHistoryKey
    } as any, ATTACHMENT_HISTORY_LIMIT)
  }

  public async persistCollectionState(): Promise<void> {
    await persistCollectionState({
      storage: this.ctx.storage,
      collections: this.collections,
      collectionHistory: this.collectionHistory
    } as any)
  }

  public scheduleCollectionPersist(): Promise<void> {
    this.collectionSaveQueue = this.collectionSaveQueue
      .then(() => this.persistCollectionState())
      .catch(err => {
        console.error('[XMPP] Failed to persist collection state:', err)
      })
    return this.collectionSaveQueue
  }

  public async persistAttachmentHistory(): Promise<void> {
    await persistAttachmentHistoryState({
      storage: this.ctx.storage,
      attachmentHistory: this.attachmentHistory
    } as any)
  }

  public scheduleAttachmentPersist(): Promise<void> {
    this.attachmentSaveQueue = this.attachmentSaveQueue
      .then(() => this.persistAttachmentHistory())
      .catch(err => {
        console.error('[XMPP] Failed to persist attachment history:', err)
      })
    return this.attachmentSaveQueue
  }

  public async restoreCollectionSubscriptions() {
    for (const collection of this.collections.values()) {
      await this.syncCollectionTopic(collection)
      for (const member of collection.members) {
        this.ctx.ensureTopicValidator(member.feedTopic, 'feed')
        this.ctx.ensureTopicValidator(member.feedTopic, 'attachment')
        await this.ctx.getPubSubService().subscribe(member.feedTopic)
      }
    }
  }

  private async syncCollectionTopic(collection: XmppCollectionNode) {
    this.ctx.ensureTopicValidator(collection.topic, 'collection')
    this.ctx.ensureTopicValidator(collection.topic, 'attachment')
    try {
      await this.ctx.getPubSubService().subscribe(collection.topic)
      this.collectionSubscriptions.set(collection.id, {
        id: collection.id,
        topic: collection.topic,
        subscribedAt: new Date().toISOString()
      })
    } catch (err) {
      console.error(`[XMPP] Failed to subscribe to topic ${collection.topic}:`, err)
    }
  }

  public indexCollectionMembers(collection: XmppCollectionNode) {
    for (const member of collection.members) {
      let ids = this.collectionFeedIndex.get(member.feedTopic)
      if (!ids) {
        ids = new Set()
        this.collectionFeedIndex.set(member.feedTopic, ids)
      }
      ids.add(collection.id)
    }
  }

  public unindexCollectionMembers(collection: XmppCollectionNode) {
    for (const member of collection.members) {
      const ids = this.collectionFeedIndex.get(member.feedTopic)
      if (ids) {
        ids.delete(collection.id)
        if (ids.size === 0) {
          this.collectionFeedIndex.delete(member.feedTopic)
        }
      }
    }
  }

  public async createCollection(id: string, name?: string): Promise<XmppCollectionNode> {
    const existing = this.collections.get(id)
    const collection = normalizeCollection({
      ...(existing ?? { id, createdAt: new Date().toISOString() }),
      id,
      name: name ?? existing?.name,
      topic: collectionTopicForId(id),
      members: existing?.members ?? [],
      updatedAt: new Date().toISOString()
    })

    this.collections.set(id, collection)
    this.indexCollectionMembers(collection)
    this.ctx.ensureTopicValidator(collection.topic, 'collection')
    this.ctx.ensureTopicValidator(collection.topic, 'attachment')
    await this.ctx.getPubSubService().subscribe(collection.topic)
    this.collectionSubscriptions.set(id, {
      id,
      topic: collection.topic,
      subscribedAt: new Date().toISOString()
    })
    await this.scheduleCollectionPersist()
    this.ctx.emit('collection:change', collection)
    return collection
  }

  public async addFeedToCollection(collectionId: string, peerAddr: string | Multiaddr): Promise<XmppCollectionNode> {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const jid = jidFromPeerId(peerId)
    const feedTopic = feedTopicForPeer(peerId)
    const current = this.collections.get(collectionId) ?? await this.createCollection(collectionId)

    this.ctx.ensureTopicValidator(feedTopic, 'feed')
    this.ctx.ensureTopicValidator(feedTopic, 'attachment')
    await this.ctx.getPubSubService().subscribe(feedTopic)

    const existingMember = current.members.find(member => member.feedTopic === feedTopic)
    const nextMember = normalizeCollectionMember({
      jid,
      peerId,
      feedTopic,
      addedAt: existingMember?.addedAt
    })
    const members = existingMember
      ? current.members.map(member => member.feedTopic === feedTopic ? nextMember : member)
      : [...current.members, nextMember]

    const next = normalizeCollection({
      ...current,
      members,
      updatedAt: new Date().toISOString()
    })

    this.unindexCollectionMembers(current)
    this.collections.set(collectionId, next)
    this.indexCollectionMembers(next)
    await this.scheduleCollectionPersist()
    this.ctx.emit('collection:change', next)
    return next
  }

  public async subscribeCollection(id: string): Promise<XmppCollectionSubscription> {
    const collection = this.collections.get(id) ?? await this.createCollection(id)
    this.ctx.ensureTopicValidator(collection.topic, 'collection')
    this.ctx.ensureTopicValidator(collection.topic, 'attachment')
    await this.ctx.getPubSubService().subscribe(collection.topic)
    const subscription: XmppCollectionSubscription = {
      id,
      topic: collection.topic,
      subscribedAt: new Date().toISOString()
    }
    this.collectionSubscriptions.set(id, subscription)
    this.ctx.emit('collection:subscribe', subscription)
    return subscription
  }

  public async unsubscribeCollection(id: string): Promise<void> {
    await this.ctx.ready
    const collection = this.collections.get(id)
    const subscription = this.collectionSubscriptions.get(id)
    if (!collection || !subscription) {
      return
    }

    const pubsub = this.ctx.getPubSubService()
    await pubsub.unsubscribe(collection.topic)
    this.collectionSubscriptions.delete(id)
    await this.scheduleCollectionPersist()
  }

  public async publishCollection(id: string, body: string, options: { itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string } = {}): Promise<string> {
    const collection = this.collections.get(id) ?? await this.createCollection(id)
    const feedPost: XmppFeedPost = {
      id: options.itemId ?? Math.random().toString(36).substring(2, 11),
      topic: collection.topic,
      from: this.ctx.jid,
      body,
      publishedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: options.title,
      summary: options.summary,
      author: options.author ?? this.ctx.jid,
      categories: options.categories
    }

    return await this.publishCollectionPost(id, feedPost)
  }

  public async publishCollectionPost(collectionId: string, feedPost: XmppFeedPost): Promise<string> {
    const collection = this.collections.get(collectionId)
    if (!collection) {
      throw new Error(`Unknown collection ${collectionId}`)
    }

    const pubsub = this.ctx.getPubSubService()
    const itemId = `${collectionId}:${feedPost.id}`
    const publishedAt = new Date().toISOString()
    const title = feedPost.title?.trim() || deriveMicroblogTitle(feedPost.body)
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
          { node: collection.topic },
          xml(
            'item',
            { id: itemId, collectionId, sourceTopic: feedPost.topic },
            buildMicroblogEntry({
              ...feedPost,
              title
            }, {
              title,
              author: feedPost.author ?? feedPost.from,
              publishedAt: feedPost.publishedAt,
              updatedAt: feedPost.updatedAt
            })
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(collection.topic, bytes)

    await this.recordCollectionPost({
      ...feedPost,
      id: itemId,
      topic: collection.topic,
      collectionId,
      sourceTopic: feedPost.topic,
      publishedAt,
      receivedAt: publishedAt
    })

    return itemId
  }

  public async recordCollectionPost(post: XmppCollectionPost): Promise<boolean> {
    await this.ctx.ready
    const normalized = normalizeCollectionPost(post)
    const key = collectionHistoryKey(normalized.collectionId, normalized.id)
    if (this.collectionHistory.has(key)) {
      return false
    }

    this.collectionHistory.set(key, normalized)

    while (this.collectionHistory.size > COLLECTION_HISTORY_LIMIT) {
      const oldestKey = this.collectionHistory.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.collectionHistory.delete(oldestKey)
    }

    await this.scheduleCollectionPersist()
    this.ctx.emit('collection:post', normalized)
    return true
  }

  public async publishAttachment(
    topic: string,
    targetId: string,
    kind: XmppAttachmentKind,
    value?: string,
    options: { itemId?: string } = {}
  ): Promise<string> {
    const pubsub = this.ctx.getPubSubService()
    this.ctx.ensureTopicValidator(topic, 'attachment')
    await pubsub.subscribe(topic)

    const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
    const publishedAt = new Date().toISOString()
    const attachmentElement = kind === 'noticed'
      ? xml('noticed', { xmlns: ATTACHMENT_XMLNS }, value ? value : null)
      : xml('reactions', { xmlns: ATTACHMENT_XMLNS }, xml('reaction', value ? { emoji: value } : {}, value ? value : null))
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
          { node: topic },
          xml(
            'item',
            { id: itemId, targetId },
            attachmentElement
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(topic, bytes)

    await this.recordAttachment({
      id: itemId,
      topic,
      targetId,
      from: this.ctx.jid,
      kind,
      value,
      publishedAt,
      receivedAt: publishedAt
    })

    return itemId
  }

  public async recordAttachment(attachment: XmppAttachment): Promise<boolean> {
    await this.ctx.ready
    const normalized = normalizeAttachment(attachment)
    const key = attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from)
    const existing = this.attachmentHistory.get(key)
    if (existing && existing.kind === normalized.kind && existing.value === normalized.value) {
      return false
    }

    this.attachmentHistory.set(key, normalized)

    while (this.attachmentHistory.size > ATTACHMENT_HISTORY_LIMIT) {
      const oldestKey = this.attachmentHistory.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.attachmentHistory.delete(oldestKey)
    }

    await this.scheduleAttachmentPersist()
    this.ctx.emit('attachment:post', normalized)
    this.ctx.emit('attachment:summary', this.buildAttachmentSummary(normalized.topic, normalized.targetId))
    return true
  }

  public buildAttachmentSummary(topic: string, targetId: string): XmppAttachmentSummary {
    const attachments = Array.from(this.attachmentHistory.values()).filter(attachment => attachment.topic === topic && attachment.targetId === targetId)
    return buildAttachmentSummary(topic, targetId, attachments)
  }

  public async getCollections(): Promise<XmppCollectionNode[]> {
    await this.ctx.ready
    return Array.from(this.collections.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  public async getCollectionSubscriptions(): Promise<XmppCollectionSubscription[]> {
    await this.ctx.ready
    return Array.from(this.collectionSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  public async getCollectionPosts(collectionId?: string): Promise<XmppCollectionPost[]> {
    await this.ctx.ready
    const posts = Array.from(this.collectionHistory.values())
    return collectionId ? posts.filter(post => post.collectionId === collectionId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) : posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  public async getAttachments(topic?: string, targetId?: string): Promise<XmppAttachment[]> {
    await this.ctx.ready
    const attachments = Array.from(this.attachmentHistory.values())
    return attachments
      .filter(attachment => topic ? attachment.topic === topic : true)
      .filter(attachment => targetId ? attachment.targetId === targetId : true)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  public async getAttachmentSummaries(topic?: string): Promise<XmppAttachmentSummary[]> {
    await this.ctx.ready
    const summaries = new Map<string, XmppAttachmentSummary>()
    for (const attachment of this.attachmentHistory.values()) {
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

  public async close(): Promise<void> {
    await this.collectionSaveQueue
    await this.persistCollectionState()
    await this.attachmentSaveQueue
    await this.persistAttachmentHistory()
  }
}
