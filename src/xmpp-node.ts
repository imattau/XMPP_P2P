import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { Libp2p } from 'libp2p'
import { xml, Element, Parser } from '@xmpp/xml'
import { EventEmitter } from 'events'
import { XmppStream } from './xmpp-stream.js'
import { multiaddr, Multiaddr } from '@multiformats/multiaddr'
import { TopicValidatorResult } from '@libp2p/gossipsub'

const ROSTER_XMLNS = 'jabber:iq:roster'
const PUBSUB_EVENT_XMLNS = 'http://jabber.org/protocol/pubsub#event'
const FEED_XMLNS = 'urn:xmpp:feed:0'
const COLLECTION_XMLNS = 'urn:xmpp:collection:0'
const FEED_HISTORY_LIMIT = 50
const COLLECTION_HISTORY_LIMIT = 100
const FEED_TOPIC_PREFIX = 'xmpp-feed:'
const COLLECTION_TOPIC_PREFIX = 'xmpp-collection:'

export type XmppPresenceType =
  | 'available'
  | 'unavailable'
  | 'subscribe'
  | 'subscribed'
  | 'unsubscribe'
  | 'unsubscribed'
  | 'probe'

export type XmppRosterSubscription = 'none' | 'to' | 'from' | 'both'

export interface XmppMessage {
  from: string
  to: string
  body: string
  id?: string
  type?: string
}

export interface XmppPresence {
  from: string
  to: string
  type?: XmppPresenceType | string
  status?: string
  show?: string
}

export interface XmppRosterPresenceState {
  type: 'available' | 'unavailable'
  status?: string
  show?: string
  receivedAt: string
}

export interface XmppRosterEntry {
  jid: string
  name?: string
  groups?: string[]
  subscription: XmppRosterSubscription
  ask?: 'subscribe' | 'unsubscribe'
  presence?: XmppRosterPresenceState
  updatedAt: string
}

export interface XmppPubSubMessage {
  topic: string
  node?: string
  from: string
  body: string
  itemId?: string
}

export interface XmppFeedPost {
  id: string
  topic: string
  from: string
  body: string
  publishedAt: string
  receivedAt: string
  node?: string
  title?: string
  author?: string
}

export interface XmppFeedSubscription {
  peerId: string
  jid: string
  topic: string
  subscribedAt: string
}

export interface XmppCollectionMember {
  jid: string
  peerId: string
  feedTopic: string
  addedAt: string
}

export interface XmppCollectionNode {
  id: string
  name?: string
  topic: string
  members: XmppCollectionMember[]
  createdAt: string
  updatedAt: string
}

export interface XmppCollectionPost extends XmppFeedPost {
  collectionId: string
  sourceTopic: string
}

export interface XmppCollectionSubscription {
  id: string
  topic: string
  subscribedAt: string
}

export interface XmppNodeOptions {
  rosterPath?: string
  feedPath?: string
  collectionPath?: string
}

interface PendingIq {
  resolve: (element: Element) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface XmppRosterFile {
  version: number
  entries: XmppRosterEntry[]
}

interface XmppFeedFile {
  version: number
  posts: XmppFeedPost[]
}

interface XmppCollectionFile {
  version: number
  collections: XmppCollectionNode[]
  posts: XmppCollectionPost[]
}

export class XmppNode extends EventEmitter {
  private libp2p: Libp2p
  private streams = new Map<string, XmppStream>()
  private roster = new Map<string, XmppRosterEntry>()
  private feedHistory = new Map<string, XmppFeedPost>()
  private feedSubscriptions = new Map<string, XmppFeedSubscription>()
  private collections = new Map<string, XmppCollectionNode>()
  private collectionSubscriptions = new Map<string, XmppCollectionSubscription>()
  private collectionHistory = new Map<string, XmppCollectionPost>()
  private collectionFeedIndex = new Map<string, Set<string>>()
  private pendingIq = new Map<string, PendingIq>()
  private rosterSaveQueue: Promise<void> = Promise.resolve()
  private feedSaveQueue: Promise<void> = Promise.resolve()
  private collectionSaveQueue: Promise<void> = Promise.resolve()
  private selfPresence: { type: 'available' | 'unavailable'; status?: string; show?: string } = {
    type: 'available'
  }
  private readonly rosterPath: string
  private readonly feedPath: string
  private readonly collectionPath: string
  public readonly jid: string
  public readonly ready: Promise<void>

  constructor(libp2p: Libp2p, options: XmppNodeOptions = {}) {
    super()
    this.libp2p = libp2p
    this.jid = `${this.libp2p.peerId.toString()}@p2p`
    this.rosterPath = options.rosterPath ?? process.env.XMPP_ROSTER_PATH ?? join(process.cwd(), `.xmpp-roster.${this.libp2p.peerId.toString()}.json`)
    this.feedPath = options.feedPath ?? process.env.XMPP_FEED_PATH ?? join(dirname(this.rosterPath), `.xmpp-feed.${this.libp2p.peerId.toString()}.json`)
    this.collectionPath = options.collectionPath ?? process.env.XMPP_COLLECTION_PATH ?? join(dirname(this.rosterPath), `.xmpp-collection.${this.libp2p.peerId.toString()}.json`)
    this.ready = this.loadRoster()
      .then(() => this.loadFeedHistory())
      .then(() => this.loadCollectionState())
      .then(() => this.ensureOwnFeedSubscription())

    // Register protocol handler for inbound connections
    this.libp2p.handle('/xmpp/1.0.0', (stream: any, connection?: any) => {
      const conn = connection || stream.connection
      const peerId = conn?.remotePeer?.toString() || 'unknown'
      console.log(`[DEBUG] Inbound connection handler triggered from peer: ${peerId}`)
      const xmppStream = new XmppStream(stream, peerId)
      this.registerStream(peerId, xmppStream)
      this.emit('stream', { peerId, direction: 'inbound', stream: xmppStream })
    })

    // Register Gossipsub PubSub listener if available
    const pubsub = (this.libp2p.services as any).pubsub
    if (pubsub) {
      pubsub.addEventListener('message', (evt: any) => {
        const topic = evt.detail.topic
        const data = evt.detail.data
        const xmlStr = new TextDecoder().decode(data)
        void this.handlePubSubPayload(topic, xmlStr).catch(() => {})
      })
    }
  }

  private async loadRoster(): Promise<void> {
    try {
      const raw = await fs.readFile(this.rosterPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppRosterFile | XmppRosterEntry[]
      const entries = Array.isArray(parsed) ? parsed : parsed.entries
      for (const entry of entries ?? []) {
        const normalized = this.normalizeRosterEntry(entry)
        this.roster.set(normalized.jid, normalized)
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load roster from ${this.rosterPath}:`, err)
      }
    }
  }

  private async loadFeedHistory(): Promise<void> {
    try {
      const raw = await fs.readFile(this.feedPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppFeedFile | XmppFeedPost[]
      const posts = Array.isArray(parsed) ? parsed : parsed.posts
      for (const post of posts ?? []) {
        const normalized = this.normalizeFeedPost(post)
        this.feedHistory.set(this.feedHistoryKey(normalized.topic, normalized.id), normalized)
      }
      while (this.feedHistory.size > FEED_HISTORY_LIMIT) {
        const oldestKey = this.feedHistory.keys().next().value as string | undefined
        if (!oldestKey) {
          break
        }
        this.feedHistory.delete(oldestKey)
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load feed history from ${this.feedPath}:`, err)
      }
    }
  }

  private async loadCollectionState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.collectionPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppCollectionFile | XmppCollectionNode[]
      const collections = Array.isArray(parsed) ? parsed : parsed.collections
      const posts = Array.isArray(parsed) ? [] : parsed.posts

      for (const collection of collections ?? []) {
        const normalized = this.normalizeCollection(collection)
        this.collections.set(normalized.id, normalized)
        this.indexCollectionMembers(normalized)
      }

      for (const post of posts ?? []) {
        const normalized = this.normalizeCollectionPost(post)
        this.collectionHistory.set(this.collectionHistoryKey(normalized.collectionId, normalized.id), normalized)
      }

      while (this.collectionHistory.size > COLLECTION_HISTORY_LIMIT) {
        const oldestKey = this.collectionHistory.keys().next().value as string | undefined
        if (!oldestKey) {
          break
        }
        this.collectionHistory.delete(oldestKey)
      }

      await this.restoreCollectionSubscriptions()
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load collection state from ${this.collectionPath}:`, err)
      }
    }
  }

  private async ensureOwnFeedSubscription(): Promise<void> {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      return
    }

    try {
      const topic = this.feedTopicForPeer(this.libp2p.peerId.toString())
      this.ensureTopicValidator(topic, 'feed')
      await pubsub.subscribe(topic)
    } catch (err) {
      console.error('[XMPP] Failed to subscribe to own feed topic:', err)
    }
  }

  private async persistRoster(): Promise<void> {
    const payload: XmppRosterFile = {
      version: 1,
      entries: Array.from(this.roster.values()).sort((a, b) => a.jid.localeCompare(b.jid))
    }

    await fs.mkdir(dirname(this.rosterPath), { recursive: true })
    await fs.writeFile(this.rosterPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private scheduleRosterPersist(): Promise<void> {
    this.rosterSaveQueue = this.rosterSaveQueue
      .then(() => this.persistRoster())
      .catch(err => {
        console.error(`[XMPP] Failed to persist roster to ${this.rosterPath}:`, err)
      })

    return this.rosterSaveQueue
  }

  private async persistFeedHistory(): Promise<void> {
    const payload: XmppFeedFile = {
      version: 1,
      posts: Array.from(this.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    }

    await fs.mkdir(dirname(this.feedPath), { recursive: true })
    await fs.writeFile(this.feedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private async persistCollectionState(): Promise<void> {
    const payload: XmppCollectionFile = {
      version: 1,
      collections: Array.from(this.collections.values()).sort((a, b) => a.id.localeCompare(b.id)),
      posts: Array.from(this.collectionHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    }

    await fs.mkdir(dirname(this.collectionPath), { recursive: true })
    await fs.writeFile(this.collectionPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private scheduleFeedPersist(): Promise<void> {
    this.feedSaveQueue = this.feedSaveQueue
      .then(() => this.persistFeedHistory())
      .catch(err => {
        console.error(`[XMPP] Failed to persist feed history to ${this.feedPath}:`, err)
      })

    return this.feedSaveQueue
  }

  private scheduleCollectionPersist(): Promise<void> {
    this.collectionSaveQueue = this.collectionSaveQueue
      .then(() => this.persistCollectionState())
      .catch(err => {
        console.error(`[XMPP] Failed to persist collection state to ${this.collectionPath}:`, err)
      })

    return this.collectionSaveQueue
  }

  private normalizeRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): XmppRosterEntry {
    const subscription: XmppRosterSubscription = entry.subscription === 'to' || entry.subscription === 'from' || entry.subscription === 'both'
      ? entry.subscription
      : 'none'

    const groups = Array.isArray(entry.groups)
      ? entry.groups.filter((group): group is string => typeof group === 'string' && group.length > 0)
      : undefined

    const presence: XmppRosterPresenceState | undefined = entry.presence != null
      ? {
          type: entry.presence.type === 'unavailable' ? 'unavailable' : 'available',
          status: entry.presence.status,
          show: entry.presence.show,
          receivedAt: entry.presence.receivedAt || new Date().toISOString()
        }
      : undefined

    return {
      jid: entry.jid,
      name: entry.name,
      groups,
      subscription,
      ask: entry.ask === 'subscribe' || entry.ask === 'unsubscribe' ? entry.ask : undefined,
      presence,
      updatedAt: entry.updatedAt || new Date().toISOString()
    }
  }

  private createRosterEntry(jid: string, name?: string): XmppRosterEntry {
    return this.normalizeRosterEntry({
      jid,
      name,
      subscription: 'none',
      updatedAt: new Date().toISOString()
    })
  }

  private parsePeerReference(peerAddr: string | Multiaddr): { peerId: string; dialTarget?: Multiaddr } {
    const addrStr = peerAddr.toString()

    if (addrStr.includes('/p2p/')) {
      return {
        peerId: addrStr.split('/p2p/').pop() || '',
        dialTarget: multiaddr(addrStr)
      }
    }

    if (addrStr.includes('/ipfs/')) {
      return {
        peerId: addrStr.split('/ipfs/').pop() || '',
        dialTarget: multiaddr(addrStr)
      }
    }

    if (addrStr.endsWith('@p2p')) {
      return {
        peerId: addrStr.slice(0, -4)
      }
    }

    if (addrStr.startsWith('/')) {
      return {
        peerId: '',
        dialTarget: multiaddr(addrStr)
      }
    }

    return {
      peerId: addrStr
    }
  }

  private subscriptionToFlags(subscription: XmppRosterSubscription): { to: boolean; from: boolean } {
    switch (subscription) {
      case 'both':
        return { to: true, from: true }
      case 'to':
        return { to: true, from: false }
      case 'from':
        return { to: false, from: true }
      default:
        return { to: false, from: false }
    }
  }

  private flagsToSubscription(to: boolean, from: boolean): XmppRosterSubscription {
    if (to && from) {
      return 'both'
    }
    if (to) {
      return 'to'
    }
    if (from) {
      return 'from'
    }
    return 'none'
  }

  private peerIdFromJid(jid: string): string {
    return jid.endsWith('@p2p') ? jid.slice(0, -4) : jid
  }

  private jidFromPeerId(peerId: string): string {
    return `${peerId}@p2p`
  }

  private feedTopicForPeer(peerId: string): string {
    return `${FEED_TOPIC_PREFIX}${peerId}`
  }

  private collectionTopicForId(id: string): string {
    return `${COLLECTION_TOPIC_PREFIX}${id}`
  }

  private feedHistoryKey(topic: string, id: string): string {
    return `${topic}:${id}`
  }

  private collectionHistoryKey(collectionId: string, id: string): string {
    return `${collectionId}:${id}`
  }

  private normalizeFeedPost(entry: Partial<XmppFeedPost> & { id: string; topic: string; from: string; body: string }): XmppFeedPost {
    return {
      id: entry.id,
      topic: entry.topic,
      from: entry.from,
      body: entry.body,
      publishedAt: entry.publishedAt || new Date().toISOString(),
      receivedAt: entry.receivedAt || new Date().toISOString(),
      node: entry.node,
      title: entry.title,
      author: entry.author
    }
  }

  private normalizeCollection(entry: Partial<XmppCollectionNode> & { id: string }): XmppCollectionNode {
    const members = Array.isArray(entry.members) ? entry.members.map(member => this.normalizeCollectionMember(member)) : []
    return {
      id: entry.id,
      name: entry.name,
      topic: entry.topic || this.collectionTopicForId(entry.id),
      members,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || new Date().toISOString()
    }
  }

  private normalizeCollectionMember(entry: Partial<XmppCollectionMember> & { jid: string; peerId: string; feedTopic: string }): XmppCollectionMember {
    return {
      jid: entry.jid,
      peerId: entry.peerId,
      feedTopic: entry.feedTopic,
      addedAt: entry.addedAt || new Date().toISOString()
    }
  }

  private normalizeCollectionPost(entry: Partial<XmppCollectionPost> & { id: string; collectionId: string; topic: string; sourceTopic: string; from: string; body: string }): XmppCollectionPost {
    return {
      ...this.normalizeFeedPost(entry),
      collectionId: entry.collectionId,
      sourceTopic: entry.sourceTopic
    }
  }

  private indexCollectionMembers(collection: XmppCollectionNode) {
    for (const member of collection.members) {
      const current = this.collectionFeedIndex.get(member.feedTopic) ?? new Set<string>()
      current.add(collection.id)
      this.collectionFeedIndex.set(member.feedTopic, current)
    }
  }

  private unindexCollectionMembers(collection: XmppCollectionNode) {
    for (const member of collection.members) {
      const current = this.collectionFeedIndex.get(member.feedTopic)
      if (!current) {
        continue
      }
      current.delete(collection.id)
      if (current.size === 0) {
        this.collectionFeedIndex.delete(member.feedTopic)
      }
    }
  }

  private getPubSubService() {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      throw new Error('PubSub/Gossipsub service is not configured')
    }
    return pubsub
  }

  private ensureTopicValidator(topic: string, kind: 'feed' | 'collection') {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub?.topicValidators) {
      return
    }

    if (pubsub.topicValidators.has(topic)) {
      return
    }

    pubsub.topicValidators.set(topic, (_peer: any, message: any) => {
      try {
        const xmlStr = new TextDecoder().decode(message.data)
        const p = new Parser()
        let valid = false
        p.write('<stream:stream>')
        p.on('element', (element: Element) => {
          if (element.name !== 'message') {
            return
          }
          const eventEl = element.getChild('event')
          if (!eventEl || eventEl.attrs.xmlns !== PUBSUB_EVENT_XMLNS) {
            return
          }
          const itemsEl = eventEl.getChild('items')
          if (!itemsEl || itemsEl.attrs.node !== topic) {
            return
          }
          const itemEl = (itemsEl.children as any[]).find(child => child?.name === 'item') as Element | undefined
          if (!itemEl?.attrs.id) {
            return
          }

          if (kind === 'feed') {
            const entryEl = itemEl.getChild('entry')
            const contentEl = entryEl?.getChild('content')
            const bodyEl = itemEl.getChild('body')
            if (!entryEl || entryEl.attrs.xmlns !== FEED_XMLNS || (!contentEl && !bodyEl)) {
              return
            }
          } else {
            const entryEl = itemEl.getChild('entry')
            if (!entryEl || entryEl.attrs.xmlns !== FEED_XMLNS || !itemEl.attrs.collectionId || !itemEl.attrs.sourceTopic) {
              return
            }
          }

          valid = true
        })
        p.write(xmlStr)
        return valid ? TopicValidatorResult.Accept : TopicValidatorResult.Reject
      } catch {
        return TopicValidatorResult.Reject
      }
    })
  }

  private async syncCollectionTopic(collection: XmppCollectionNode) {
    this.ensureTopicValidator(collection.topic, 'collection')
    await this.getPubSubService().subscribe(collection.topic)
    this.collectionSubscriptions.set(collection.id, {
      id: collection.id,
      topic: collection.topic,
      subscribedAt: new Date().toISOString()
    })
  }

  private async restoreCollectionSubscriptions() {
    for (const collection of this.collections.values()) {
      await this.syncCollectionTopic(collection)
      for (const member of collection.members) {
        this.ensureTopicValidator(member.feedTopic, 'feed')
        await this.getPubSubService().subscribe(member.feedTopic)
      }
    }
  }

  private async recordFeedPost(post: XmppFeedPost): Promise<boolean> {
    await this.ready
    const normalized = this.normalizeFeedPost(post)
    const key = this.feedHistoryKey(normalized.topic, normalized.id)
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
    this.emit('feed:post', normalized)
    await this.propagateFeedToCollections(normalized)
    return true
  }

  private async recordCollectionPost(post: XmppCollectionPost): Promise<boolean> {
    await this.ready
    const normalized = this.normalizeCollectionPost(post)
    const key = this.collectionHistoryKey(normalized.collectionId, normalized.id)
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
    this.emit('collection:post', normalized)
    return true
  }

  private getFeedSubscriptionByTopic(topic: string): XmppFeedSubscription | undefined {
    return this.feedSubscriptions.get(topic)
  }

  private parseFeedPost(topic: string, itemEl: Element, from: string, node?: string): XmppFeedPost | undefined {
    const id = itemEl.attrs.id
    if (!id) {
      return undefined
    }

    const entryEl = (itemEl.children as any[]).find(child => child?.name === 'entry' && child?.attrs?.xmlns === FEED_XMLNS) as Element | undefined
    const bodyEl = (itemEl.children as any[]).find(child => child?.name === 'body') as Element | undefined
    const contentEl = entryEl?.getChild('content')
    const publishedEl = entryEl?.getChild('published')
    const titleEl = entryEl?.getChild('title')
    const authorEl = entryEl?.getChild('author')
    const body = contentEl?.text() || bodyEl?.text()
    if (!body) {
      return undefined
    }

    return this.normalizeFeedPost({
      id,
      topic,
      from,
      body,
      node,
      publishedAt: publishedEl?.text(),
      title: titleEl?.text(),
      author: authorEl?.text(),
      receivedAt: new Date().toISOString()
    })
  }

  private parseCollectionPost(topic: string, itemEl: Element, from: string): XmppCollectionPost | undefined {
    const collectionId = itemEl.attrs.collectionId
    const sourceTopic = itemEl.attrs.sourceTopic
    if (!collectionId || !sourceTopic) {
      return undefined
    }

    const feedPost = this.parseFeedPost(topic, itemEl, from, sourceTopic)
    if (!feedPost) {
      return undefined
    }

    return {
      ...feedPost,
      collectionId,
      sourceTopic
    }
  }

  private async handlePubSubPayload(topic: string, xmlStr: string): Promise<void> {
    try {
      const p = new Parser()
      p.write('<stream:stream>')
      p.on('element', (element: Element) => {
        if (element.name !== 'message') {
          return
        }

        const eventEl = element.getChild('event')
        if (!eventEl || eventEl.attrs.xmlns !== PUBSUB_EVENT_XMLNS) {
          return
        }

        const itemsEl = eventEl.getChild('items')
        const nodeName = itemsEl?.attrs.node
        const itemEls = (itemsEl?.children as any[] ?? []).filter(child => child?.name === 'item') as Element[]
        for (const itemEl of itemEls) {
          const bodyEl = itemEl.getChild('body')
          if (bodyEl) {
            const pubSubMsg: XmppPubSubMessage = {
              topic,
              node: nodeName,
              from: element.attrs.from || 'unknown',
              body: bodyEl.text(),
              itemId: itemEl.attrs.id
            }
            this.emit('pubsub:message', pubSubMsg)
          }

          const collectionPost = this.parseCollectionPost(topic, itemEl, element.attrs.from || 'unknown')
          if (collectionPost) {
            void this.recordCollectionPost(collectionPost).catch(err => this.emit('error', err))
            continue
          }

          const feedPost = this.parseFeedPost(topic, itemEl, element.attrs.from || 'unknown', nodeName)
          if (feedPost) {
            void this.recordFeedPost(feedPost).catch(err => this.emit('error', err))
          }
        }
      })
      p.write(xmlStr)
    } catch (err) {
      // ignore parsing error for malformed pubsub elements
    }
  }

  private async propagateFeedToCollections(feedPost: XmppFeedPost): Promise<void> {
    const collectionIds = this.collectionFeedIndex.get(feedPost.topic)
    if (!collectionIds || collectionIds.size === 0) {
      return
    }

    for (const collectionId of collectionIds) {
      await this.publishCollectionPost(collectionId, feedPost)
    }
  }

  private async publishCollectionPost(collectionId: string, feedPost: XmppFeedPost): Promise<string> {
    const collection = this.collections.get(collectionId)
    if (!collection) {
      throw new Error(`Unknown collection ${collectionId}`)
    }

    const pubsub = this.getPubSubService()
    const itemId = `${collectionId}:${feedPost.id}`
    const publishedAt = new Date().toISOString()
    const stanza = xml(
      'message',
      {
        from: this.jid,
        to: 'pubsub.p2p',
        type: 'headline'
      },
      xml(
        'event',
        { xmlns: PUBSUB_EVENT_XMLNS },
        xml(
          'items',
          { node: collection.topic },
          xml(
            'item',
            { id: itemId, collectionId, sourceTopic: feedPost.topic },
            xml(
              'entry',
              { xmlns: FEED_XMLNS },
              xml('id', {}, feedPost.id),
              xml('published', {}, feedPost.publishedAt),
              xml('author', {}, feedPost.author ?? feedPost.from),
              feedPost.title ? xml('title', {}, feedPost.title) : null,
              xml('content', { type: 'text' }, feedPost.body),
              xml('body', {}, feedPost.body)
            )
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

  private getStreamByJid(jid: string): XmppStream | undefined {
    return this.streams.get(this.peerIdFromJid(jid))
  }

  private async sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs = 10000): Promise<Element> {
    const xmppStream = await this.getOrCreateStream(target)
    const id = stanza.attrs.id
    if (!id) {
      throw new Error('IQ stanza missing id')
    }

    return await new Promise<Element>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIq.delete(id)
        reject(new Error(`Timed out waiting for IQ response ${id}`))
      }, timeoutMs)

      this.pendingIq.set(id, {
        resolve: (element) => {
          clearTimeout(timer)
          resolve(element)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
        timer
      })

      xmppStream.send(stanza)
    })
  }

  private async sendIqResult(peerId: string, id: string, payload?: Element) {
    const xmppStream = this.streams.get(peerId)
    if (!xmppStream) {
      return
    }

    const stanza = payload
      ? xml('iq', { to: this.jidFromPeerId(peerId), from: this.jid, type: 'result', id }, payload)
      : xml('iq', { to: this.jidFromPeerId(peerId), from: this.jid, type: 'result', id })

    xmppStream.send(stanza)
  }

  private buildRosterQuery(): Element {
    return xml(
      'query',
      { xmlns: ROSTER_XMLNS },
      ...Array.from(this.roster.values()).map(entry => this.buildRosterItem(entry))
    )
  }

  private buildRosterItem(entry: XmppRosterEntry): Element {
    const attrs: Record<string, string> = {
      jid: entry.jid,
      subscription: entry.subscription
    }
    if (entry.name) {
      attrs.name = entry.name
    }
    if (entry.ask) {
      attrs.ask = entry.ask
    }

    return xml(
      'item',
      attrs,
      ...(entry.groups ?? []).map(group => xml('group', {}, group))
    )
  }

  private parseRosterQuery(query: Element): XmppRosterEntry[] {
    return (query.children as any[])
      .filter(child => child?.name === 'item')
      .map((child: Element) => {
        const groups = (child.children as any[])
          .filter(group => group?.name === 'group')
          .map((group: Element) => group.text())

        return this.normalizeRosterEntry({
          jid: child.attrs.jid,
          name: child.attrs.name,
          subscription: child.attrs.subscription as XmppRosterSubscription | undefined,
          ask: child.attrs.ask as 'subscribe' | 'unsubscribe' | undefined,
          groups,
          updatedAt: new Date().toISOString()
        })
      })
  }

  private async upsertRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): Promise<XmppRosterEntry> {
    await this.ready
    const current = this.roster.get(entry.jid) ?? this.createRosterEntry(entry.jid)
    const next = this.normalizeRosterEntry({
      ...current,
      ...entry,
      groups: entry.groups ?? current.groups,
      presence: entry.presence ?? current.presence
    })

    this.roster.set(next.jid, next)
    await this.scheduleRosterPersist()
    this.emit('roster:change', next)
    return next
  }

  private async deleteRosterEntry(jid: string): Promise<void> {
    await this.ready
    if (this.roster.delete(jid)) {
      await this.scheduleRosterPersist()
      this.emit('roster:remove', jid)
    }
  }

  private async recordPresence(peerJid: string, presence: XmppPresence) {
    const next = await this.upsertRosterEntry({
      jid: peerJid,
      presence: {
        type: presence.type === 'unavailable' ? 'unavailable' : 'available',
        status: presence.status,
        show: presence.show,
        receivedAt: new Date().toISOString()
      }
    })

    this.emit('roster:presence', next)
  }

  private async handleSubscribe(peerId: string, fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = this.subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: this.flagsToSubscription(flags.to, true),
      ask: undefined
    })
    await this.sendPresenceToPeer(peerId, 'subscribed')
    await this.sendCurrentPresenceToPeer(peerId)
    this.emit('presence:subscribe', { from: fromJid })
  }

  private async handleSubscribed(fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = this.subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: this.flagsToSubscription(true, flags.from),
      ask: undefined
    })
    this.emit('presence:subscribed', { from: fromJid })
  }

  private async handleUnsubscribe(peerId: string, fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = this.subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: this.flagsToSubscription(false, flags.from),
      ask: undefined
    })
    await this.sendPresenceToPeer(peerId, 'unsubscribed')
    this.emit('presence:unsubscribe', { from: fromJid })
  }

  private async handleUnsubscribed(fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = this.subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: this.flagsToSubscription(flags.to, false),
      ask: undefined
    })
    this.emit('presence:unsubscribed', { from: fromJid })
  }

  private async sendCurrentPresenceToPeer(peerId: string) {
    const presenceType = this.selfPresence.type === 'unavailable' ? 'unavailable' : undefined
    await this.sendPresenceToPeer(peerId, presenceType, this.selfPresence.status, this.selfPresence.show)
  }

  private async sendPresenceToPeer(peerId: string, type?: string, status?: string, show?: string) {
    const xmppStream = this.streams.get(peerId)
    if (!xmppStream) {
      return
    }

    const presAttrs: Record<string, string> = {
      to: this.jidFromPeerId(peerId),
      from: this.jid
    }
    if (type) {
      presAttrs.type = type
    }

    const children: Element[] = []
    if (show) {
      children.push(xml('show', {}, show))
    }
    if (status) {
      children.push(xml('status', {}, status))
    }

    const pres = children.length > 0
      ? xml('presence', presAttrs, ...children)
      : xml('presence', presAttrs)

    xmppStream.send(pres)
  }

  private async handleIqStanza(peerId: string, element: Element) {
    const id = element.attrs.id
    if (!id) {
      return
    }

    const type = element.attrs.type
    if (type === 'result') {
      const pending = this.pendingIq.get(id)
      if (pending) {
        this.pendingIq.delete(id)
        clearTimeout(pending.timer)
        pending.resolve(element)
      }
      return
    }

    if (type === 'error') {
      const pending = this.pendingIq.get(id)
      if (pending) {
        this.pendingIq.delete(id)
        clearTimeout(pending.timer)
        pending.reject(new Error(`IQ error response for ${id}`))
      }
      return
    }

    const query = element.getChild('query')
    if (!query || query.attrs.xmlns !== ROSTER_XMLNS) {
      return
    }

    if (type === 'get') {
      await this.sendIqResult(peerId, id, this.buildRosterQuery())
      return
    }

    if (type === 'set') {
      const item = query.getChild('item')
      if (item) {
        const jid = item.attrs.jid
        if (jid) {
          if (item.attrs.subscription === 'remove') {
            await this.deleteRosterEntry(jid)
          } else {
            const groups = (item.children as any[])
              .filter(child => child?.name === 'group')
              .map((child: Element) => child.text())

            await this.upsertRosterEntry({
              jid,
              name: item.attrs.name,
              subscription: item.attrs.subscription as XmppRosterSubscription | undefined,
              ask: item.attrs.ask as 'subscribe' | 'unsubscribe' | undefined,
              groups
            })
          }
        }
      }

      await this.sendIqResult(peerId, id, this.buildRosterQuery())
    }
  }

  private async handlePresenceStanza(peerId: string, element: Element) {
    const fromJid = element.attrs.from || `${peerId}@p2p`
    const toJid = element.attrs.to || this.jid
    const type = element.attrs.type as XmppPresenceType | undefined
    const statusEl = element.getChild('status')
    const showEl = element.getChild('show')
    const presence: XmppPresence = {
      from: fromJid,
      to: toJid,
      type,
      status: statusEl ? statusEl.text() : undefined,
      show: showEl ? showEl.text() : undefined
    }

    this.emit('presence', presence)

    switch (type) {
      case 'subscribe':
        await this.handleSubscribe(peerId, fromJid)
        return
      case 'subscribed':
        await this.handleSubscribed(fromJid)
        return
      case 'unsubscribe':
        await this.handleUnsubscribe(peerId, fromJid)
        return
      case 'unsubscribed':
        await this.handleUnsubscribed(fromJid)
        return
      case 'probe':
        await this.sendCurrentPresenceToPeer(peerId)
        return
      case 'unavailable':
      default:
        await this.recordPresence(fromJid, {
          ...presence,
          type: type === 'unavailable' ? 'unavailable' : 'available'
        })
    }
  }

  private async handleStanza(peerId: string, element: Element) {
    const fromJid = element.attrs.from || `${peerId}@p2p`
    const toJid = element.attrs.to || this.jid

    if (element.name === 'message') {
      const bodyEl = element.getChild('body')
      if (bodyEl) {
        const message: XmppMessage = {
          from: fromJid,
          to: toJid,
          body: bodyEl.text(),
          id: element.attrs.id,
          type: element.attrs.type || 'chat'
        }
        this.emit('message', message)
      }
      return
    }

    if (element.name === 'presence') {
      await this.handlePresenceStanza(peerId, element)
      return
    }

    if (element.name === 'iq') {
      await this.handleIqStanza(peerId, element)
      return
    }

    this.emit('stanza', { from: fromJid, to: toJid, element })
  }

  private async requestRosterFromPeer(peerAddr: string | Multiaddr): Promise<XmppRosterEntry[]> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'

    const iq = xml(
      'iq',
      {
        to: toJid,
        from: this.jid,
        type: 'get',
        id
      },
      xml('query', { xmlns: ROSTER_XMLNS })
    )

    const result = await this.sendIqRequest(peerAddr, iq)
    const query = result.getChild('query')
    if (!query) {
      return []
    }

    return this.parseRosterQuery(query)
  }

  // Dial a peer and establish XmppStream
  async getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream> {
    const parsed = this.parsePeerReference(peerAddr)
    const peerIdStr = parsed.peerId

    if (!peerIdStr) {
      throw new Error('Address does not contain a peer ID')
    }

    const existing = this.streams.get(peerIdStr)
    if (existing) {
      return existing
    }

    if (!parsed.dialTarget) {
      throw new Error(`Peer ${peerIdStr} is not connected; provide a multiaddr or establish a stream first`)
    }

    const stream = await this.libp2p.dialProtocol(parsed.dialTarget, ['/xmpp/1.0.0'])
    const xmppStream = new XmppStream(stream, peerIdStr)
    this.registerStream(peerIdStr, xmppStream)
    this.emit('stream', { peerId: peerIdStr, direction: 'outbound', stream: xmppStream })
    return xmppStream
  }

  private registerStream(peerId: string, xmppStream: XmppStream) {
    const existing = this.streams.get(peerId)
    if (existing) {
      existing.close()
    }

    this.streams.set(peerId, xmppStream)

    xmppStream.on('element', (element: Element) => {
      void this.handleStanza(peerId, element).catch(err => this.emit('error', err))
    })

    xmppStream.on('error', (err) => {
      this.emit('error', err)
    })

    xmppStream.on('close', () => {
      if (this.streams.get(peerId) === xmppStream) {
        this.streams.delete(peerId)
      }
      this.emit('stream-closed', peerId)
    })

    void this.flushRosterPresenceForPeer(peerId).catch(err => this.emit('error', err))
    void this.sendCurrentPresenceToPeer(peerId).catch(err => this.emit('error', err))
  }

  private async flushRosterPresenceForPeer(peerId: string) {
    await this.ready
    const jid = this.jidFromPeerId(peerId)
    const entry = this.roster.get(jid)
    if (!entry) {
      return
    }

    if (entry.ask === 'subscribe') {
      await this.sendPresenceToPeer(peerId, 'subscribe')
    } else if (entry.ask === 'unsubscribe') {
      await this.sendPresenceToPeer(peerId, 'unsubscribe')
    }
  }

  async getRosterEntries(): Promise<XmppRosterEntry[]> {
    await this.ready
    return Array.from(this.roster.values()).sort((a, b) => a.jid.localeCompare(b.jid))
  }

  async getRosterEntry(jid: string): Promise<XmppRosterEntry | undefined> {
    await this.ready
    return this.roster.get(jid)
  }

  async addRosterEntry(jid: string, name?: string): Promise<XmppRosterEntry> {
    const entry = await this.upsertRosterEntry({
      jid,
      name,
      subscription: 'to',
      ask: 'subscribe'
    })

    const stream = this.getStreamByJid(jid)
    if (stream) {
      await this.sendPresenceToPeer(stream.remotePeer, 'subscribe')
    }

    return entry
  }

  async removeRosterEntry(jid: string): Promise<void> {
    const stream = this.getStreamByJid(jid)
    if (stream) {
      await this.sendPresenceToPeer(stream.remotePeer, 'unsubscribe')
    }

    await this.deleteRosterEntry(jid)
  }

  async fetchRoster(peerAddr: string | Multiaddr): Promise<XmppRosterEntry[]> {
    await this.ready
    return await this.requestRosterFromPeer(peerAddr)
  }

  async subscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const jid = xmppStream.remotePeer.toString() + '@p2p'
    await this.upsertRosterEntry({
      jid,
      subscription: 'to',
      ask: 'subscribe'
    })
    await this.sendPresence(peerAddr, 'subscribe')
  }

  async unsubscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const jid = xmppStream.remotePeer.toString() + '@p2p'
    await this.upsertRosterEntry({
      jid,
      subscription: 'none',
      ask: 'unsubscribe'
    })
    await this.sendPresence(peerAddr, 'unsubscribe')
  }

  async broadcastPresence(type?: string, status?: string, show?: string) {
    await this.ready
    const normalizedType = type === 'unavailable' ? 'unavailable' : 'available'
    this.selfPresence = {
      type: normalizedType,
      status,
      show
    }

    for (const peerId of this.streams.keys()) {
      await this.sendCurrentPresenceToPeer(peerId)
    }
  }

  // Send a chat message to a peer
  async sendMessage(peerAddr: string | Multiaddr, body: string): Promise<string> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'
    const id = Math.random().toString(36).substring(2, 11)

    const msg = xml(
      'message',
      {
        to: toJid,
        from: this.jid,
        type: 'chat',
        id
      },
      xml('body', {}, body)
    )

    xmppStream.send(msg)
    return id
  }

  // Send presence updates
  async sendPresence(peerAddr: string | Multiaddr, type?: string, status?: string, show?: string) {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'

    const presAttrs: Record<string, string> = {
      to: toJid,
      from: this.jid
    }
    if (type) {
      presAttrs.type = type
    }

    const children: Element[] = []
    if (show) {
      children.push(xml('show', {}, show))
    }
    if (status) {
      children.push(xml('status', {}, status))
    }

    const pres = children.length > 0
      ? xml('presence', presAttrs, ...children)
      : xml('presence', presAttrs)

    xmppStream.send(pres)
  }

  // Subscribe to a Gossipsub/PubSub topic
  async subscribe(topic: string) {
    const pubsub = this.getPubSubService()
    await pubsub.subscribe(topic)
  }

  // Unsubscribe from a Gossipsub/PubSub topic
  async unsubscribe(topic: string) {
    const pubsub = this.getPubSubService()
    await pubsub.unsubscribe(topic)
  }

  // Publish a message to a topic wrapped in a XEP-0060 compliant stanza
  async publish(topic: string, body: string): Promise<string> {
    const pubsub = this.getPubSubService()

    const itemId = Math.random().toString(36).substring(2, 11)
    const stanza = xml(
      'message',
      {
        from: this.jid,
        to: 'pubsub.p2p',
        type: 'headline'
      },
      xml(
        'event',
        { xmlns: 'http://jabber.org/protocol/pubsub#event' },
        xml(
          'items',
          { node: topic },
          xml(
            'item',
            { id: itemId },
            xml('body', {}, body)
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(topic, bytes)
    return itemId
  }

  async subscribeFeed(peerAddr: string | Multiaddr): Promise<XmppFeedSubscription> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const topic = this.feedTopicForPeer(peerId)
    const pubsub = this.getPubSubService()
    this.ensureTopicValidator(topic, 'feed')
    await pubsub.subscribe(topic)
    const subscription: XmppFeedSubscription = {
      peerId,
      jid: this.jidFromPeerId(peerId),
      topic,
      subscribedAt: new Date().toISOString()
    }
    this.feedSubscriptions.set(topic, subscription)
    this.emit('feed:subscribe', subscription)
    return subscription
  }

  async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; author?: string } = {}): Promise<string> {
    const pubsub = this.getPubSubService()
    const topic = options.topic ?? this.feedTopicForPeer(this.libp2p.peerId.toString())
    this.ensureTopicValidator(topic, 'feed')
    await pubsub.subscribe(topic)
    const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
    const publishedAt = new Date().toISOString()
    const entryChildren: Element[] = [
      xml('id', {}, itemId),
      xml('published', {}, publishedAt),
      xml('author', {}, options.author ?? this.jid),
      xml('content', { type: 'text' }, body),
      xml('body', {}, body)
    ]
    if (options.title) {
      entryChildren.push(xml('title', {}, options.title))
    }
    const stanza = xml(
      'message',
      {
        from: this.jid,
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
              { id: itemId },
              xml('entry', { xmlns: FEED_XMLNS }, ...entryChildren)
            )
          )
        )
      )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(topic, bytes)

    await this.recordFeedPost({
      id: itemId,
      topic,
      from: this.jid,
      body,
      publishedAt,
      receivedAt: publishedAt,
      title: options.title,
      author: options.author ?? this.jid
    })

    return itemId
  }

  async createCollection(id: string, name?: string): Promise<XmppCollectionNode> {
    // TODO(XEP-0248): add collection roles, affiliations, and admin/configuration
    // so communities can control membership instead of auto-creating and auto-subscribing.
    const existing = this.collections.get(id)
    const collection = this.normalizeCollection({
      ...(existing ?? { id, createdAt: new Date().toISOString() }),
      id,
      name: name ?? existing?.name,
      topic: this.collectionTopicForId(id),
      members: existing?.members ?? [],
      updatedAt: new Date().toISOString()
    })

    this.collections.set(id, collection)
    this.indexCollectionMembers(collection)
    this.ensureTopicValidator(collection.topic, 'collection')
    await this.getPubSubService().subscribe(collection.topic)
    this.collectionSubscriptions.set(id, {
      id,
      topic: collection.topic,
      subscribedAt: new Date().toISOString()
    })
    await this.scheduleCollectionPersist()
    this.emit('collection:change', collection)
    return collection
  }

  async addFeedToCollection(collectionId: string, peerAddr: string | Multiaddr): Promise<XmppCollectionNode> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const jid = this.jidFromPeerId(peerId)
    const feedTopic = this.feedTopicForPeer(peerId)
    const current = this.collections.get(collectionId) ?? await this.createCollection(collectionId)

    this.ensureTopicValidator(feedTopic, 'feed')
    await this.getPubSubService().subscribe(feedTopic)

    const existingMember = current.members.find(member => member.feedTopic === feedTopic)
    const nextMember = this.normalizeCollectionMember({
      jid,
      peerId,
      feedTopic,
      addedAt: existingMember?.addedAt
    })
    const members = existingMember
      ? current.members.map(member => member.feedTopic === feedTopic ? nextMember : member)
      : [...current.members, nextMember]

    const next = this.normalizeCollection({
      ...current,
      members,
      updatedAt: new Date().toISOString()
    })

    this.unindexCollectionMembers(current)
    this.collections.set(collectionId, next)
    this.indexCollectionMembers(next)
    await this.scheduleCollectionPersist()
    this.emit('collection:change', next)
    return next
  }

  async subscribeCollection(id: string): Promise<XmppCollectionSubscription> {
    const collection = this.collections.get(id) ?? await this.createCollection(id)
    this.ensureTopicValidator(collection.topic, 'collection')
    await this.getPubSubService().subscribe(collection.topic)
    const subscription: XmppCollectionSubscription = {
      id,
      topic: collection.topic,
      subscribedAt: new Date().toISOString()
    }
    this.collectionSubscriptions.set(id, subscription)
    this.emit('collection:subscribe', subscription)
    return subscription
  }

  async publishCollection(id: string, body: string, options: { itemId?: string; title?: string; author?: string } = {}): Promise<string> {
    const collection = this.collections.get(id) ?? await this.createCollection(id)
    const feedPost: XmppFeedPost = {
      id: options.itemId ?? Math.random().toString(36).substring(2, 11),
      topic: collection.topic,
      from: this.jid,
      body,
      publishedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      title: options.title,
      author: options.author ?? this.jid
    }

    return await this.publishCollectionPost(id, feedPost)
  }

  async getFeedPosts(): Promise<XmppFeedPost[]> {
    await this.ready
    return Array.from(this.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  async getFeedSubscriptions(): Promise<XmppFeedSubscription[]> {
    await this.ready
    return Array.from(this.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  async getCollections(): Promise<XmppCollectionNode[]> {
    await this.ready
    return Array.from(this.collections.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  async getCollectionSubscriptions(): Promise<XmppCollectionSubscription[]> {
    await this.ready
    return Array.from(this.collectionSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  async getCollectionPosts(collectionId?: string): Promise<XmppCollectionPost[]> {
    await this.ready
    const posts = Array.from(this.collectionHistory.values())
    return collectionId ? posts.filter(post => post.collectionId === collectionId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) : posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  // Close all streams
  async close() {
    await this.ready

    for (const pending of this.pendingIq.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('XmppNode closed before IQ completed'))
    }
    this.pendingIq.clear()

    for (const stream of this.streams.values()) {
      await stream.close()
    }
    this.streams.clear()

    await this.rosterSaveQueue
    await this.persistRoster()
    await this.feedSaveQueue
    await this.persistFeedHistory()
    await this.collectionSaveQueue
    await this.persistCollectionState()
  }
}
