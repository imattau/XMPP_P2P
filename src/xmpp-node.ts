import { promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { Libp2p } from 'libp2p'
import { xml, Element, Parser } from '@xmpp/xml'
import { EventEmitter } from 'events'
import * as openpgp from 'openpgp'
import { XmppStream } from './xmpp-stream.js'
import { loadOmemoModule } from './omemo-runtime.js'
import {
  buildCapsElement,
  buildDiscoInfoQuery,
  buildDiscoItemsQuery,
  getCapsCacheKey,
  parseCapsPresence,
  parseDiscoInfoQuery,
  parseDiscoItemsQuery,
  DISCOVERY_NODE,
  DISCO_INFO_XMLNS,
  DISCO_ITEMS_XMLNS,
  CAPS_XMLNS,
  PUBSUB_EVENT_XMLNS,
  FEED_XMLNS,
  COLLECTION_XMLNS,
  ATTACHMENT_XMLNS,
  PAM_XMLNS,
  FOLLOWERS_XMLNS,
  ROSTER_XMLNS,
  OMEMO_FEATURE,
  OMEMO_PTE_FEATURE,
  OPENPGP_FEATURE,
  OPENPGP_PUBSUB_FEATURE,
  type XmppCapsPresence,
  type XmppDiscoIdentity,
  type XmppDiscoInfo,
  type XmppDiscoItem,
  type XmppEntityCapabilities
} from './xmpp-discovery.js'
import {
  XmppOmemoStateManager,
  type XmppOmemoBundle
} from './xmpp-omemo-state.js'
import {
  buildAttachmentSummary,
  attachmentHistoryKey,
  collectionHistoryKey,
  collectionTopicForId,
  type XmppAttachment,
  type XmppAttachmentFile,
  type XmppAttachmentSummary,
  type XmppAttachmentKind,
  type XmppCollectionFile,
  type XmppEncryptedTopicSecret,
  createRosterEntry,
  feedHistoryKey,
  type XmppFeedFile,
  type XmppFeedFollower,
  type XmppFeedPost,
  type XmppFeedSubscription,
  type XmppFeedSubscriptionRecord,
  type XmppFeedVisibility,
  feedSubscriptionKey,
  feedTopicForPeer,
  type XmppFollowerFile,
  type XmppFollowerWatch,
  flagsToSubscription,
  followerKey,
  followerTopicForPeer,
  type XmppCollectionMember,
  type XmppCollectionNode,
  type XmppCollectionPost,
  type XmppCollectionSubscription,
  jidFromPeerId,
  type XmppMessage,
  type XmppOpenPgpPublicKeyResponse,
  type XmppOpenPgpStateFile,
  type XmppPubSubMessage,
  type XmppPresence,
  type XmppPresenceType,
  type XmppRosterEntry,
  type XmppRosterFile,
  type XmppRosterPresenceState,
  type XmppRosterSubscription,
  normalizeAttachment,
  normalizeCollection,
  normalizeCollectionMember,
  normalizeCollectionPost,
  normalizeFeedPost,
  normalizeFeedSubscription,
  normalizeFollower,
  normalizeRosterEntry,
  parsePeerReference,
  peerIdFromJid,
  type XmppSubscriptionFile,
  subscriptionToFlags
} from './xmpp-records.js'
import type {
  OmemoDirection,
  OmemoAddress
} from './omemo-runtime.js'
import { multiaddr, Multiaddr } from '@multiformats/multiaddr'
import { TopicValidatorResult } from '@libp2p/gossipsub'

const OPENPGP_IQ_XMLNS = 'urn:xmpp:openpgp:0'
const FEED_HISTORY_LIMIT = 50
const COLLECTION_HISTORY_LIMIT = 100
const ATTACHMENT_HISTORY_LIMIT = 200
const SUBSCRIPTION_HISTORY_LIMIT = 200
const FEED_TOPIC_PREFIX = 'xmpp-feed:'
const COLLECTION_TOPIC_PREFIX = 'xmpp-collection:'
const FOLLOWERS_TOPIC_PREFIX = 'xmpp-followers:'
const OMEMO_XMLNS = 'urn:xmpp:omemo:2'
const OMEMO_DEVICES_XMLNS = 'urn:xmpp:omemo:2:devices'
const OMEMO_BUNDLES_XMLNS = 'urn:xmpp:omemo:2:bundles'
const OMEMO_DEVICES_NODE = 'urn:xmpp:omemo:2:devices'
const OMEMO_BUNDLES_NODE = 'urn:xmpp:omemo:2:bundles'
const OMEMO_PTE_XMLNS = 'urn:xmpp:pte:0'
const OPENPGP_XMLNS = 'urn:xmpp:openpgp:0'
const OPENPGP_PUBSUB_XMLNS = 'urn:xmpp:openpgp:pubsub:0'

export interface XmppNodeOptions {
  rosterPath?: string
  feedPath?: string
  collectionPath?: string
  attachmentPath?: string
  omemoPath?: string
  openPgpPath?: string
}

interface PendingIq {
  resolve: (element: Element) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class XmppNode extends EventEmitter {
  private libp2p: Libp2p
  private streams = new Map<string, XmppStream>()
  private roster = new Map<string, XmppRosterEntry>()
  private feedHistory = new Map<string, XmppFeedPost>()
  private feedSubscriptions = new Map<string, XmppFeedSubscriptionRecord>()
  private followers = new Map<string, XmppFeedFollower>()
  private followerWatches = new Map<string, XmppFollowerWatch>()
  private collections = new Map<string, XmppCollectionNode>()
  private collectionSubscriptions = new Map<string, XmppCollectionSubscription>()
  private collectionHistory = new Map<string, XmppCollectionPost>()
  private collectionFeedIndex = new Map<string, Set<string>>()
  private attachmentHistory = new Map<string, XmppAttachment>()
  private discoInfoCache = new Map<string, XmppDiscoInfo>()
  private entityCapabilities = new Map<string, XmppEntityCapabilities>()
  private pendingIq = new Map<string, PendingIq>()
  private topicValidationKinds = new Map<string, Set<'feed' | 'collection' | 'attachment' | 'subscription' | 'secure'>>()
  private rosterSaveQueue: Promise<void> = Promise.resolve()
  private feedSaveQueue: Promise<void> = Promise.resolve()
  private subscriptionSaveQueue: Promise<void> = Promise.resolve()
  private followerSaveQueue: Promise<void> = Promise.resolve()
  private collectionSaveQueue: Promise<void> = Promise.resolve()
  private attachmentSaveQueue: Promise<void> = Promise.resolve()
  private selfPresence: { type: 'available' | 'unavailable'; status?: string; show?: string } = {
    type: 'available'
  }
  private readonly rosterPath: string
  private readonly feedPath: string
  private readonly subscriptionPath: string
  private readonly followerPath: string
  private readonly collectionPath: string
  private readonly attachmentPath: string
  private readonly omemoPath: string
  private readonly openPgpPath: string
  private readonly discoveryNode: string = DISCOVERY_NODE
  private readonly discoveryIdentity: XmppDiscoIdentity = {
    category: 'client',
    type: 'pc',
    name: 'XMPP P2P'
  }
  private readonly omemoStateManager: XmppOmemoStateManager
  private readonly peerOmemoDeviceLists = new Map<string, number[]>()
  private readonly peerOmemoBundles = new Map<string, Map<number, XmppOmemoBundle>>()
  private readonly peerOmemoIdentityKeys = new Map<string, string>()
  private openPgpState?: XmppOpenPgpStateFile
  private openPgpPrivateKey?: openpgp.PrivateKey
  private openPgpPublicKey?: openpgp.PublicKey
  private openPgpFingerprint?: string
  private readonly peerOpenPgpKeys = new Map<string, string>()
  private readonly encryptedTopicSecrets = new Map<string, XmppEncryptedTopicSecret>()
  private openPgpSaveQueue: Promise<void> = Promise.resolve()
  public readonly jid: string
  public readonly ready: Promise<void>

  constructor(libp2p: Libp2p, options: XmppNodeOptions = {}) {
    super()
    this.libp2p = libp2p
    this.jid = `${this.libp2p.peerId.toString()}@p2p`
    this.rosterPath = options.rosterPath ?? process.env.XMPP_ROSTER_PATH ?? join(process.cwd(), `.xmpp-roster.${this.libp2p.peerId.toString()}.json`)
    this.feedPath = options.feedPath ?? process.env.XMPP_FEED_PATH ?? join(dirname(this.rosterPath), `.xmpp-feed.${this.libp2p.peerId.toString()}.json`)
    const rosterBaseName = basename(this.rosterPath).replace(/\.[^.]+$/, '')
    this.subscriptionPath = join(dirname(this.rosterPath), `.xmpp-subscriptions.${rosterBaseName}.json`)
    this.followerPath = join(dirname(this.rosterPath), `.xmpp-followers.${rosterBaseName}.json`)
    this.collectionPath = options.collectionPath ?? process.env.XMPP_COLLECTION_PATH ?? join(dirname(this.rosterPath), `.xmpp-collection.${this.libp2p.peerId.toString()}.json`)
    this.attachmentPath = options.attachmentPath ?? process.env.XMPP_ATTACHMENT_PATH ?? join(dirname(this.rosterPath), `.xmpp-attachments.${this.libp2p.peerId.toString()}.json`)
    this.omemoPath = options.omemoPath ?? process.env.XMPP_OMEMO_PATH ?? join(dirname(this.rosterPath), `.xmpp-omemo.${rosterBaseName}.json`)
    this.openPgpPath = options.openPgpPath ?? process.env.XMPP_OPENPGP_PATH ?? join(dirname(this.rosterPath), `.xmpp-openpgp.${rosterBaseName}.json`)
    this.omemoStateManager = new XmppOmemoStateManager(this.omemoPath)
    this.ready = this.loadRoster()
      .then(() => this.loadFeedHistory())
      .then(() => this.loadSubscriptionState())
      .then(() => this.loadFollowerState())
      .then(() => this.loadCollectionState())
      .then(() => this.loadAttachmentHistory())
      .then(() => this.loadOmemoState())
      .then(() => this.loadOpenPgpState())
      .then(() => this.ensureOwnFeedSubscription())
      .then(() => this.ensureOwnFollowerSubscription())

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

  private async loadSubscriptionState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.subscriptionPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppSubscriptionFile | XmppFeedSubscriptionRecord[]
      const subscriptions = Array.isArray(parsed) ? parsed : parsed.subscriptions
      for (const subscription of subscriptions ?? []) {
        const normalized = this.normalizeFeedSubscription(subscription)
        this.feedSubscriptions.set(normalized.topic, normalized)
      }

      while (this.feedSubscriptions.size > SUBSCRIPTION_HISTORY_LIMIT) {
        const oldestKey = this.feedSubscriptions.keys().next().value as string | undefined
        if (!oldestKey) {
          break
        }
        this.feedSubscriptions.delete(oldestKey)
      }

      await this.restoreFeedSubscriptions()
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load subscription state from ${this.subscriptionPath}:`, err)
      }
    }
  }

  private async loadFollowerState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.followerPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppFollowerFile | XmppFeedFollower[]
      const followers = Array.isArray(parsed) ? parsed : parsed.followers
      for (const follower of followers ?? []) {
        const normalized = this.normalizeFollower(follower)
        this.followers.set(this.followerKey(normalized.feedPeerId, normalized.followerPeerId), normalized)
      }

      while (this.followers.size > SUBSCRIPTION_HISTORY_LIMIT) {
        const oldestKey = this.followers.keys().next().value as string | undefined
        if (!oldestKey) {
          break
        }
        this.followers.delete(oldestKey)
      }

      await this.restoreFollowerSubscriptions()
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load follower state from ${this.followerPath}:`, err)
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

  private async loadAttachmentHistory(): Promise<void> {
    try {
      const raw = await fs.readFile(this.attachmentPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppAttachmentFile | XmppAttachment[]
      const attachments = Array.isArray(parsed) ? parsed : parsed.attachments
      for (const attachment of attachments ?? []) {
        const normalized = this.normalizeAttachment(attachment)
        this.attachmentHistory.set(this.attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from), normalized)
      }

      while (this.attachmentHistory.size > ATTACHMENT_HISTORY_LIMIT) {
        const oldestKey = this.attachmentHistory.keys().next().value as string | undefined
        if (!oldestKey) {
          break
        }
        this.attachmentHistory.delete(oldestKey)
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load attachment history from ${this.attachmentPath}:`, err)
      }
    }
  }

  private bufferToBase64(value: ArrayBuffer | Uint8Array): string {
    return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString('base64')
  }

  private base64ToArrayBuffer(value: string): ArrayBuffer {
    const bytes = Buffer.from(value, 'base64')
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }

  private serializeKeyPair(keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) {
    return {
      pubKey: this.bufferToBase64(keyPair.pubKey),
      privKey: this.bufferToBase64(keyPair.privKey)
    }
  }

  private deserializeKeyPair(keyPair: { pubKey: string; privKey: string }) {
    return {
      pubKey: this.base64ToArrayBuffer(keyPair.pubKey),
      privKey: this.base64ToArrayBuffer(keyPair.privKey)
    }
  }

  private async loadOmemoState(): Promise<void> {
    await this.omemoStateManager.load()
  }

  private getOmemoStore(): {
    store: Record<string, unknown>
    put: (key: string, value: unknown) => void
    get: <T = unknown>(key: string, defaultValue?: T) => T | undefined
    remove: (key: string) => void
    isTrustedIdentity: (address: string, identityKey: ArrayBuffer, direction: OmemoDirection) => boolean | Promise<boolean>
    loadIdentityKey: (address: string) => ArrayBuffer | undefined
    saveIdentity: (address: string, identityKey: ArrayBuffer) => boolean
    loadPreKey: (keyId: number) => Promise<{ keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer } } | undefined>
    storePreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => void
    removePreKey: (keyId: number) => void
    loadSignedPreKey: (keyId: number) => { keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer } } | undefined
    storeSignedPreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => void
    removeSignedPreKey: (keyId: number) => void
    loadSession: (address: string) => string | undefined
    removeAllSessions: (jid: string) => void
    removeSession: (address: string) => void
    storeSession: (address: string, record: string) => void
    getIdentityKeyPair: () => Promise<{ pubKey: ArrayBuffer; privKey: ArrayBuffer } | undefined>
    getLocalRegistrationId: () => Promise<number | undefined>
  } {
    return this.omemoStateManager.getStore()
  }

  private async loadOpenPgpState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.openPgpPath, 'utf8')
      const parsed = JSON.parse(raw) as XmppOpenPgpStateFile
      if (!parsed.privateKey || !parsed.publicKey || !parsed.fingerprint) {
        throw new Error('OpenPGP state file is missing key material')
      }

      this.openPgpState = parsed
      this.openPgpPrivateKey = await openpgp.readPrivateKey({ armoredKey: parsed.privateKey })
      this.openPgpPublicKey = await openpgp.readKey({ armoredKey: parsed.publicKey })
      this.openPgpFingerprint = parsed.fingerprint
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load OpenPGP state from ${this.openPgpPath}:`, err)
      }

      await this.generateOpenPgpState()
    }
  }

  private async generateOpenPgpState(): Promise<void> {
    const generated = await openpgp.generateKey({
      userIDs: [{ name: this.jid, email: this.jid }],
      type: 'curve25519',
      format: 'armored'
    })

    const publicKey = await openpgp.readKey({ armoredKey: generated.publicKey })
    this.openPgpState = {
      version: 1,
      privateKey: generated.privateKey,
      publicKey: generated.publicKey,
      fingerprint: publicKey.getFingerprint(),
      createdAt: new Date().toISOString()
    }
    this.openPgpPrivateKey = await openpgp.readPrivateKey({ armoredKey: generated.privateKey })
    this.openPgpPublicKey = publicKey
    this.openPgpFingerprint = publicKey.getFingerprint()
    await this.persistOpenPgpState()
  }

  private async persistOpenPgpState(): Promise<void> {
    if (!this.openPgpState) {
      return
    }

    await fs.mkdir(dirname(this.openPgpPath), { recursive: true })
    await fs.writeFile(this.openPgpPath, `${JSON.stringify(this.openPgpState, null, 2)}\n`, 'utf8')
  }

  private scheduleOpenPgpPersist(): Promise<void> {
    this.openPgpSaveQueue = this.openPgpSaveQueue
      .then(() => this.persistOpenPgpState())
      .catch(err => {
        console.error(`[XMPP] Failed to persist OpenPGP state to ${this.openPgpPath}:`, err)
      })

    return this.openPgpSaveQueue
  }

  private async ensureOwnFeedSubscription(): Promise<void> {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      return
    }

    try {
      const topic = this.feedTopicForPeer(this.libp2p.peerId.toString())
      this.ensureTopicValidator(topic, 'feed')
      this.ensureTopicValidator(topic, 'attachment')
      await pubsub.subscribe(topic)
    } catch (err) {
      console.error('[XMPP] Failed to subscribe to own feed topic:', err)
    }
  }

  private async ensureOwnFollowerSubscription(): Promise<void> {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      return
    }

    try {
      const topic = this.followerTopicForPeer(this.libp2p.peerId.toString())
      this.ensureTopicValidator(topic, 'subscription')
      await pubsub.subscribe(topic)
    } catch (err) {
      console.error('[XMPP] Failed to subscribe to own follower topic:', err)
    }
  }

  private getOpenPgpPublicKeyOrThrow(): openpgp.PublicKey {
    if (!this.openPgpPublicKey) {
      throw new Error('OpenPGP public key is not loaded')
    }
    return this.openPgpPublicKey
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

  private async publishSubscriptionDeclaration(subscription: XmppFeedSubscriptionRecord, action: 'upsert' | 'remove') {
    const pubsub = this.getPubSubService()
    const itemId = this.feedSubscriptionKey(subscription.topic)
    const followerTopic = this.followerTopicForPeer(subscription.peerId)
    const updatedAt = new Date().toISOString()
    this.ensureTopicValidator(followerTopic, 'subscription')

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
          { node: followerTopic },
          xml(
            'item',
            {
              id: itemId,
              feedPeerId: subscription.peerId,
              followerPeerId: this.libp2p.peerId.toString(),
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
              xml('follower', { peerId: this.libp2p.peerId.toString(), jid: this.jid })
            )
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(followerTopic, bytes)

    const stream = this.streams.get(subscription.peerId)
    if (stream) {
      stream.send(stanza)
    }
  }

  private async persistSubscriptionState(): Promise<void> {
    const payload: XmppSubscriptionFile = {
      version: 1,
      subscriptions: Array.from(this.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
    }

    await fs.mkdir(dirname(this.subscriptionPath), { recursive: true })
    await fs.writeFile(this.subscriptionPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private async persistFollowerState(): Promise<void> {
    const payload: XmppFollowerFile = {
      version: 1,
      followers: Array.from(this.followers.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
    }

    await fs.mkdir(dirname(this.followerPath), { recursive: true })
    await fs.writeFile(this.followerPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
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

  private async persistAttachmentHistory(): Promise<void> {
    const payload: XmppAttachmentFile = {
      version: 1,
      attachments: Array.from(this.attachmentHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    }

    await fs.mkdir(dirname(this.attachmentPath), { recursive: true })
    await fs.writeFile(this.attachmentPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  private scheduleFeedPersist(): Promise<void> {
    this.feedSaveQueue = this.feedSaveQueue
      .then(() => this.persistFeedHistory())
      .catch(err => {
        console.error(`[XMPP] Failed to persist feed history to ${this.feedPath}:`, err)
      })

    return this.feedSaveQueue
  }

  private scheduleSubscriptionPersist(): Promise<void> {
    this.subscriptionSaveQueue = this.subscriptionSaveQueue
      .then(() => this.persistSubscriptionState())
      .catch(err => {
        console.error(`[XMPP] Failed to persist subscription state to ${this.subscriptionPath}:`, err)
      })

    return this.subscriptionSaveQueue
  }

  private scheduleFollowerPersist(): Promise<void> {
    this.followerSaveQueue = this.followerSaveQueue
      .then(() => this.persistFollowerState())
      .catch(err => {
        console.error(`[XMPP] Failed to persist follower state to ${this.followerPath}:`, err)
      })

    return this.followerSaveQueue
  }

  private scheduleCollectionPersist(): Promise<void> {
    this.collectionSaveQueue = this.collectionSaveQueue
      .then(() => this.persistCollectionState())
      .catch(err => {
        console.error(`[XMPP] Failed to persist collection state to ${this.collectionPath}:`, err)
      })

    return this.collectionSaveQueue
  }

  private scheduleAttachmentPersist(): Promise<void> {
    this.attachmentSaveQueue = this.attachmentSaveQueue
      .then(() => this.persistAttachmentHistory())
      .catch(err => {
        console.error(`[XMPP] Failed to persist attachment history to ${this.attachmentPath}:`, err)
      })

    return this.attachmentSaveQueue
  }

  private normalizeRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): XmppRosterEntry {
    return normalizeRosterEntry(entry)
  }

  private createRosterEntry(jid: string, name?: string): XmppRosterEntry {
    return createRosterEntry(jid, name)
  }

  private parsePeerReference(peerAddr: string | Multiaddr): { peerId: string; dialTarget?: Multiaddr } {
    return parsePeerReference(peerAddr)
  }

  private subscriptionToFlags(subscription: XmppRosterSubscription): { to: boolean; from: boolean } {
    return subscriptionToFlags(subscription)
  }

  private flagsToSubscription(to: boolean, from: boolean): XmppRosterSubscription {
    return flagsToSubscription(to, from)
  }

  private peerIdFromJid(jid: string): string {
    return peerIdFromJid(jid)
  }

  private jidFromPeerId(peerId: string): string {
    return jidFromPeerId(peerId)
  }

  private feedTopicForPeer(peerId: string): string {
    return feedTopicForPeer(peerId)
  }

  private collectionTopicForId(id: string): string {
    return collectionTopicForId(id)
  }

  private feedHistoryKey(topic: string, id: string): string {
    return feedHistoryKey(topic, id)
  }

  private feedSubscriptionKey(topic: string): string {
    return feedSubscriptionKey(topic)
  }

  private collectionHistoryKey(collectionId: string, id: string): string {
    return collectionHistoryKey(collectionId, id)
  }

  private attachmentHistoryKey(topic: string, targetId: string, from: string): string {
    return attachmentHistoryKey(topic, targetId, from)
  }

  private followerKey(feedPeerId: string, followerPeerId: string): string {
    return followerKey(feedPeerId, followerPeerId)
  }

  private followerTopicForPeer(peerId: string): string {
    return followerTopicForPeer(peerId)
  }

  private normalizeFeedPost(entry: Partial<XmppFeedPost> & { id: string; topic: string; from: string; body: string }): XmppFeedPost {
    return normalizeFeedPost(entry)
  }

  private normalizeCollection(entry: Partial<XmppCollectionNode> & { id: string }): XmppCollectionNode {
    return normalizeCollection(entry)
  }

  private normalizeCollectionMember(entry: Partial<XmppCollectionMember> & { jid: string; peerId: string; feedTopic: string }): XmppCollectionMember {
    return normalizeCollectionMember(entry)
  }

  private normalizeCollectionPost(entry: Partial<XmppCollectionPost> & { id: string; collectionId: string; topic: string; sourceTopic: string; from: string; body: string }): XmppCollectionPost {
    return normalizeCollectionPost(entry)
  }

  private normalizeFeedSubscription(entry: Partial<XmppFeedSubscriptionRecord> & { peerId: string; jid: string; topic: string }): XmppFeedSubscriptionRecord {
    return normalizeFeedSubscription(entry)
  }

  private normalizeFollower(entry: Partial<XmppFeedFollower> & { followerPeerId: string; followerJid: string; feedPeerId: string; feedTopic: string }): XmppFeedFollower {
    return normalizeFollower(entry)
  }

  private normalizeAttachment(entry: Partial<XmppAttachment> & { id: string; topic: string; targetId: string; from: string; kind: XmppAttachmentKind }): XmppAttachment {
    return normalizeAttachment(entry)
  }

  private async queryDiscoInfo(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoInfo> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'
    const queryNode = node ?? this.discoveryNode

    const iq = xml(
      'iq',
      {
        to: toJid,
        from: this.jid,
        type: 'get',
        id
      },
      xml('query', { xmlns: DISCO_INFO_XMLNS, node: queryNode })
    )

    const result = await this.sendIqRequest(peerAddr, iq)
    const query = result.getChild('query')
    if (!query) {
      throw new Error('Disco info response missing query payload')
    }

    const info = parseDiscoInfoQuery(query)
    this.discoInfoCache.set(queryNode, info)
    this.entityCapabilities.set(xmppStream.remotePeer.toString(), {
      peerId: xmppStream.remotePeer.toString(),
      jid: toJid,
      node: queryNode,
      ver: info.ver,
      hash: 'sha-1',
      info,
      discoveredAt: new Date().toISOString()
    })
    this.emit('disco:info', { peerId: xmppStream.remotePeer.toString(), info })
    return info
  }

  private async queryDiscoItems(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoItem[]> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'
    const queryNode = node ?? this.discoveryNode

    const iq = xml(
      'iq',
      {
        to: toJid,
        from: this.jid,
        type: 'get',
        id
      },
      xml('query', { xmlns: DISCO_ITEMS_XMLNS, node: queryNode })
    )

    const result = await this.sendIqRequest(peerAddr, iq)
    const query = result.getChild('query')
    if (!query) {
      return []
    }

    const items = parseDiscoItemsQuery(query)
    this.emit('disco:items', { peerId: xmppStream.remotePeer.toString(), items })
    return items
  }

  private async ensurePeerCapabilities(peerId: string, node: string, ver: string) {
    const cacheKey = getCapsCacheKey(node, ver)
    if (this.discoInfoCache.has(cacheKey)) {
      this.entityCapabilities.set(peerId, {
        peerId,
        jid: this.jidFromPeerId(peerId),
        node,
        ver,
        hash: 'sha-1',
        info: this.discoInfoCache.get(cacheKey)!,
        discoveredAt: new Date().toISOString()
      })
      return
    }

    try {
      const info = await this.queryDiscoInfo(peerId, cacheKey)
      this.entityCapabilities.set(peerId, {
        peerId,
        jid: this.jidFromPeerId(peerId),
        node: cacheKey,
        ver: info.ver,
        hash: info.hash,
        info,
        discoveredAt: new Date().toISOString()
      })
      this.emit('caps:discovered', this.entityCapabilities.get(peerId))
    } catch (err) {
      this.emit('error', err)
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

  private ensureTopicValidator(topic: string, kind: 'feed' | 'collection' | 'attachment' | 'subscription' | 'secure') {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub?.topicValidators) {
      return
    }

    const allowedKinds = this.topicValidationKinds.get(topic) ?? new Set<'feed' | 'collection' | 'attachment' | 'subscription' | 'secure'>()
    allowedKinds.add(kind)
    this.topicValidationKinds.set(topic, allowedKinds)

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

          if (allowedKinds.has('attachment')) {
            const noticedEl = itemEl.getChild('noticed')
            const reactionsEl = itemEl.getChild('reactions')
            if (noticedEl && noticedEl.attrs.xmlns === ATTACHMENT_XMLNS && itemEl.attrs.targetId) {
              valid = true
              return
            }
            if (reactionsEl && reactionsEl.attrs.xmlns === ATTACHMENT_XMLNS && itemEl.attrs.targetId) {
              const reactionEl = (reactionsEl.children as any[]).find(child => child?.name === 'reaction') as Element | undefined
              if (reactionEl || reactionsEl.text()) {
                valid = true
                return
              }
            }
          }

          if (allowedKinds.has('secure')) {
            const encryptedEl = itemEl.getChild('encrypted')
            if (encryptedEl && encryptedEl.attrs.xmlns === OPENPGP_PUBSUB_XMLNS && itemEl.attrs.key) {
              valid = true
              return
            }
          }

          if (allowedKinds.has('subscription')) {
            const subscriptionEl = itemEl.getChild('subscription')
            if (subscriptionEl && subscriptionEl.attrs.xmlns === PAM_XMLNS && itemEl.attrs.feedPeerId && itemEl.attrs.followerPeerId) {
              valid = true
              return
            }
          }

          if (allowedKinds.has('feed')) {
            const entryEl = itemEl.getChild('entry')
            const contentEl = entryEl?.getChild('content')
            const bodyEl = itemEl.getChild('body')
            if (entryEl && entryEl.attrs.xmlns === FEED_XMLNS && (contentEl || bodyEl)) {
              valid = true
              return
            }
          }

          if (allowedKinds.has('collection')) {
            const entryEl = itemEl.getChild('entry')
            if (entryEl && entryEl.attrs.xmlns === FEED_XMLNS && itemEl.attrs.collectionId && itemEl.attrs.sourceTopic) {
              valid = true
              return
            }
          }
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
    this.ensureTopicValidator(collection.topic, 'attachment')
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
        this.ensureTopicValidator(member.feedTopic, 'attachment')
        await this.getPubSubService().subscribe(member.feedTopic)
      }
    }
  }

  private async restoreFeedSubscriptions() {
    for (const subscription of this.feedSubscriptions.values()) {
      if (subscription.visibility === 'public') {
        await this.publishSubscriptionDeclaration(subscription, 'upsert')
      }
      await this.watchFollowerTopic(subscription.peerId)
    }
  }

  private async announcePublicSubscriptionsForPeer(peerId: string) {
    for (const subscription of this.feedSubscriptions.values()) {
      if (subscription.peerId !== peerId || subscription.visibility !== 'public') {
        continue
      }
      await this.publishSubscriptionDeclaration(subscription, 'upsert')
    }
  }

  private async restoreFollowerSubscriptions() {
    await this.watchFollowerTopic(this.libp2p.peerId.toString())
  }

  private async watchFollowerTopic(peerId: string): Promise<void> {
    const topic = this.followerTopicForPeer(peerId)
    if (this.followerWatches.has(topic)) {
      return
    }

    this.ensureTopicValidator(topic, 'subscription')
    await this.getPubSubService().subscribe(topic)
    this.followerWatches.set(topic, {
      peerId,
      topic,
      watchedAt: new Date().toISOString()
    })
  }

  private getFollowersForPeer(peerId: string): XmppFeedFollower[] {
    return Array.from(this.followers.values()).filter(follower => follower.feedPeerId === peerId)
  }

  private buildAttachmentSummary(topic: string, targetId: string): XmppAttachmentSummary {
    const attachments = Array.from(this.attachmentHistory.values()).filter(attachment => attachment.topic === topic && attachment.targetId === targetId)
    return buildAttachmentSummary(topic, targetId, attachments)
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

  private async recordAttachment(attachment: XmppAttachment): Promise<boolean> {
    await this.ready
    const normalized = this.normalizeAttachment(attachment)
    const key = this.attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from)
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
    this.emit('attachment:post', normalized)
    this.emit('attachment:summary', this.buildAttachmentSummary(normalized.topic, normalized.targetId))
    return true
  }

  private async recordFeedSubscription(subscription: XmppFeedSubscriptionRecord, announce = true): Promise<boolean> {
    await this.ready
    const normalized = this.normalizeFeedSubscription(subscription)
    const key = this.feedSubscriptionKey(normalized.topic)
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
      this.emit('feed:subscribe', normalized)
      this.emit('feed:visibility', normalized)
    }
    return true
  }

  private async recordFollower(follower: XmppFeedFollower): Promise<boolean> {
    await this.ready
    const normalized = this.normalizeFollower(follower)
    const key = this.followerKey(normalized.feedPeerId, normalized.followerPeerId)
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
    this.emit('feed:follower', normalized)
    return true
  }

  private async removeFollower(feedPeerId: string, followerPeerId: string): Promise<void> {
    const key = this.followerKey(feedPeerId, followerPeerId)
    if (!this.followers.delete(key)) {
      return
    }
    await this.scheduleFollowerPersist()
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

  private parseAttachment(topic: string, itemEl: Element, from: string): XmppAttachment | undefined {
    const targetId = itemEl.attrs.targetId
    if (!targetId) {
      return undefined
    }

    const noticedEl = itemEl.getChild('noticed')
    if (noticedEl && noticedEl.attrs.xmlns === ATTACHMENT_XMLNS) {
      return this.normalizeAttachment({
        id: itemEl.attrs.id,
        topic,
        targetId,
        from,
        kind: 'noticed',
        value: noticedEl.text() || noticedEl.attrs.value,
        publishedAt: noticedEl.attrs.publishedAt,
        receivedAt: new Date().toISOString()
      })
    }

    const reactionsEl = itemEl.getChild('reactions')
    if (reactionsEl && reactionsEl.attrs.xmlns === ATTACHMENT_XMLNS) {
      const reactionEl = (reactionsEl.children as any[]).find(child => child?.name === 'reaction') as Element | undefined
      const value = reactionEl?.attrs.emoji || reactionEl?.text() || reactionsEl.text()
      return this.normalizeAttachment({
        id: itemEl.attrs.id,
        topic,
        targetId,
        from,
        kind: 'reaction',
        value,
        publishedAt: reactionEl?.attrs.publishedAt,
        receivedAt: new Date().toISOString()
      })
    }

    return undefined
  }

  private async handlePubSubMessageElement(topic: string, element: Element): Promise<void> {
    const eventEl = element.getChild('event')
    if (!eventEl || eventEl.attrs.xmlns !== PUBSUB_EVENT_XMLNS) {
      return
    }

    const itemsEl = eventEl.getChild('items')
    const nodeName = itemsEl?.attrs.node
    const itemEls = (itemsEl?.children as any[] ?? []).filter(child => child?.name === 'item') as Element[]
    for (const itemEl of itemEls) {
      const subscriptionEl = itemEl.getChild('subscription')
      if (subscriptionEl && subscriptionEl.attrs.xmlns === PAM_XMLNS) {
        const followerPeerId = itemEl.attrs.followerPeerId
        const feedPeerId = itemEl.attrs.feedPeerId
        const visibility = itemEl.attrs.visibility === 'public' ? 'public' : 'private'
        const action = itemEl.attrs.action === 'remove' ? 'remove' : 'upsert'
        const followerJid = itemEl.attrs.followerJid || element.attrs.from || 'unknown'
        if (feedPeerId && followerPeerId) {
          if (action === 'remove') {
            void this.removeFollower(feedPeerId, followerPeerId).catch(err => this.emit('error', err))
          } else {
            void this.recordFollower({
              followerPeerId,
              followerJid,
              feedPeerId,
              feedTopic: this.feedTopicForPeer(feedPeerId),
              visibility,
              subscribedAt: itemEl.attrs.subscribedAt || new Date().toISOString(),
              updatedAt: itemEl.attrs.updatedAt || new Date().toISOString()
            }).catch(err => this.emit('error', err))
          }
        }
        continue
      }

      const attachment = this.parseAttachment(topic, itemEl, element.attrs.from || 'unknown')
      if (attachment) {
        void this.recordAttachment(attachment).catch(err => this.emit('error', err))
        continue
      }

      const encrypted = await this.parseEncryptedPubSubItem(topic, itemEl, element.attrs.from || 'unknown')
      if (encrypted) {
        this.emit('pubsub:message', encrypted)
        continue
      }

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
  }

  private async parseEncryptedPubSubItem(topic: string, itemEl: Element, from: string): Promise<XmppPubSubMessage | undefined> {
    const encryptedEl = itemEl.getChild('encrypted')
    if (!encryptedEl || encryptedEl.attrs.xmlns !== OPENPGP_PUBSUB_XMLNS) {
      return undefined
    }

    const keyId = encryptedEl.attrs.key
    const payload = encryptedEl.text().trim()
    if (!payload) {
      return undefined
    }

    const secret = this.encryptedTopicSecrets.get(topic)?.secret
    if (!secret) {
      return undefined
    }

    const bytes = Buffer.from(payload, 'base64')
    const message = await openpgp.readMessage({ binaryMessage: bytes })
    const decrypted = await openpgp.decrypt({
      message,
      passwords: secret,
      format: 'utf8'
    })
    const body = typeof decrypted.data === 'string' ? decrypted.data : new TextDecoder().decode(decrypted.data as Uint8Array)
    return {
      topic,
      node: itemEl.attrs.node,
      from,
      body,
      itemId: itemEl.attrs.id,
      encrypted: true,
      encryption: 'openpgp',
      keyId
    }
  }

  private async decryptOpenPgpMessage(payload: string): Promise<string> {
    await this.ready
    const bytes = Buffer.from(payload.trim(), 'base64')
    const message = await openpgp.readMessage({ binaryMessage: bytes })
    const decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: this.getOpenPgpPrivateKeyOrThrow(),
      format: 'utf8'
    })
    return typeof decrypted.data === 'string' ? decrypted.data : new TextDecoder().decode(decrypted.data as Uint8Array)
  }

  async fetchOpenPgpPublicKey(peerAddr: string | Multiaddr): Promise<XmppOpenPgpPublicKeyResponse> {
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
      xml('query', { xmlns: OPENPGP_IQ_XMLNS })
    )

    const result = await this.sendIqRequest(peerAddr, iq)
    const query = result.getChild('query')
    if (!query) {
      throw new Error('OpenPGP key response missing query payload')
    }

    const pubkeyEl = query.getChild('pubkey')
    const publicKey = pubkeyEl?.text().trim()
    const fingerprint = pubkeyEl?.attrs.fingerprint || ''
    if (!publicKey || !fingerprint) {
      throw new Error('OpenPGP key response missing public key material')
    }

    return { fingerprint, publicKey }
  }

  private async handlePubSubPayload(topic: string, xmlStr: string): Promise<void> {
    try {
      const p = new Parser()
      p.write('<stream:stream>')
      p.on('element', (element: Element) => {
        if (element.name !== 'message') {
          return
        }

        void this.handlePubSubMessageElement(topic, element).catch(err => this.emit('error', err))
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

  private async publishAttachment(
    topic: string,
    targetId: string,
    kind: XmppAttachmentKind,
    value?: string,
    options: { itemId?: string } = {}
  ): Promise<string> {
    const pubsub = this.getPubSubService()
    this.ensureTopicValidator(topic, 'attachment')
    await pubsub.subscribe(topic)

    const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
    const publishedAt = new Date().toISOString()
    const attachmentElement = kind === 'noticed'
      ? xml('noticed', { xmlns: ATTACHMENT_XMLNS }, value ? value : null)
      : xml('reactions', { xmlns: ATTACHMENT_XMLNS }, xml('reaction', value ? { emoji: value } : {}, value ? value : null))
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
      from: this.jid,
      kind,
      value,
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

  private buildFollowersQuery(): Element {
    const feedPeerId = this.libp2p.peerId.toString()
    return xml(
      'query',
      { xmlns: FOLLOWERS_XMLNS, feedPeerId },
      ...this.getFollowersForPeer(feedPeerId)
        .filter(follower => follower.visibility === 'public')
        .map(follower => xml(
          'item',
          {
            feedPeerId: follower.feedPeerId,
            followerPeerId: follower.followerPeerId,
            followerJid: follower.followerJid,
            visibility: follower.visibility,
            subscribedAt: follower.subscribedAt,
            updatedAt: follower.updatedAt
          }
        ))
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

  private parseFollowersQuery(query: Element): XmppFeedFollower[] {
    return (query.children as any[])
      .filter(child => child?.name === 'item')
      .map((child: Element) => this.normalizeFollower({
        feedPeerId: child.attrs.feedPeerId,
        followerPeerId: child.attrs.followerPeerId,
        followerJid: child.attrs.followerJid,
        feedTopic: this.feedTopicForPeer(child.attrs.feedPeerId),
        visibility: child.attrs.visibility === 'public' ? 'public' : 'private',
        subscribedAt: child.attrs.subscribedAt,
        updatedAt: child.attrs.updatedAt
      }))
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
    if (!type || type === 'available') {
      children.push(buildCapsElement(this.discoveryNode, this.discoveryIdentity, this.collections))
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
    if (!query) {
      const pubsub = element.getChild('pubsub')
      if (pubsub) {
        const items = pubsub.getChild('items')
        const node = items?.attrs.node
        if (type === 'get' && node === OMEMO_DEVICES_NODE) {
          await this.sendIqResult(peerId, id, this.buildOmemoDevicesQuery())
          return
        }

        if (type === 'get' && node === OMEMO_BUNDLES_NODE) {
          const item = items?.getChild('item')
          const deviceId = Number(item?.attrs.id ?? 0)
          if (Number.isFinite(deviceId) && deviceId > 0) {
            await this.sendIqResult(peerId, id, this.buildOmemoBundleQuery(deviceId))
            return
          }
        }
      }

      return
    }

    if (query.attrs.xmlns === ROSTER_XMLNS) {
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
      return
    }

    if (query.attrs.xmlns === FOLLOWERS_XMLNS) {
      if (type === 'get') {
        await this.sendIqResult(peerId, id, this.buildFollowersQuery())
      }
      return
    }

    if (query.attrs.xmlns === DISCO_INFO_XMLNS) {
      if (type === 'get') {
        await this.sendIqResult(peerId, id, buildDiscoInfoQuery(this.discoveryIdentity, this.collections, query.attrs.node))
      }
      return
    }

    if (query.attrs.xmlns === DISCO_ITEMS_XMLNS) {
      if (type === 'get') {
        await this.sendIqResult(peerId, id, buildDiscoItemsQuery(this.discoveryNode, this.collections, this.collectionSubscriptions, this.jid, query.attrs.node))
      }
      return
    }

    if (query.attrs.xmlns === OPENPGP_IQ_XMLNS) {
      if (type === 'get') {
        const publicKey = this.openPgpState?.publicKey
        const fingerprint = this.openPgpFingerprint ?? this.openPgpState?.fingerprint
        if (!publicKey || !fingerprint) {
          await this.sendIqResult(peerId, id, xml('query', { xmlns: OPENPGP_IQ_XMLNS }))
          return
        }

        await this.sendIqResult(
          peerId,
          id,
          xml(
            'query',
            { xmlns: OPENPGP_IQ_XMLNS },
            xml('pubkey', { fingerprint }, publicKey)
          )
        )
      }
      return
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

    const caps = parseCapsPresence(element)
    if (caps) {
      const cacheKey = getCapsCacheKey(caps.node, caps.ver)
      if (!this.discoInfoCache.has(cacheKey) && caps.hash === 'sha-1') {
        void this.ensurePeerCapabilities(peerId, caps.node, caps.ver)
      } else {
        const cached = this.discoInfoCache.get(cacheKey)
        if (cached) {
          this.entityCapabilities.set(peerId, {
            peerId,
            jid: fromJid,
            node: caps.node,
            ver: caps.ver,
            hash: 'sha-1',
            info: cached,
            discoveredAt: new Date().toISOString()
          })
        }
      }
    }

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
      const eventEl = element.getChild('event')
      if (eventEl && eventEl.attrs.xmlns === PUBSUB_EVENT_XMLNS) {
        await this.handlePubSubMessageElement(peerId, element)
        return
      }

      const omemoEl = element.getChild('encrypted')
      if (omemoEl && omemoEl.attrs.xmlns === OMEMO_XMLNS) {
        const headerEl = omemoEl.getChild('header')
        const payloadEl = omemoEl.getChild('payload')
        const sid = Number(headerEl?.attrs.sid ?? 0)
        const ivEl = headerEl?.getChild('iv')
        const keysEl = (headerEl?.children as any[] ?? []).filter(child => child?.name === 'keys') as Element[]
        const payload = payloadEl?.text().trim()
        const iv = ivEl?.text().trim()
        const rid = this.getOmemoDeviceIdOrThrow()
        const keyEl = keysEl
          .flatMap(keys => (keys.children as any[]).filter(child => child?.name === 'key'))
          .find((child: Element) => Number(child.attrs.rid ?? 0) === rid)

        if (headerEl && payload && iv && keyEl && Number.isFinite(sid) && sid > 0) {
          const omemo = await loadOmemoModule()
          const remoteAddress = new omemo.OMEMOAddress(fromJid, sid)
          const encryptedKey = keyEl.text().trim()
          const payloadKey = await this.decryptOmemoKey(remoteAddress, encryptedKey)
          const body = this.decryptOmemoPayload(payload, payloadKey, iv)
          const message: XmppMessage = {
            from: fromJid,
            to: toJid,
            body,
            id: element.attrs.id,
            type: element.attrs.type || 'chat',
            encrypted: true,
            encryption: 'omemo'
          }
          this.emit('message', message)
          return
        }
      }

      const openPgpEl = element.getChild('openpgp')
      if (openPgpEl && openPgpEl.attrs.xmlns === OPENPGP_XMLNS) {
        const payload = openPgpEl.text().trim()
        if (payload) {
          const body = await this.decryptOpenPgpMessage(payload)
          const message: XmppMessage = {
            from: fromJid,
            to: toJid,
            body,
            id: element.attrs.id,
            type: element.attrs.type || 'chat',
            encrypted: true,
            encryption: 'openpgp'
          }
          this.emit('message', message)
          return
        }
      }

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

  private async requestFollowersFromPeer(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]> {
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
      xml('query', { xmlns: FOLLOWERS_XMLNS })
    )

    const result = await this.sendIqRequest(peerAddr, iq)
    const query = result.getChild('query')
    if (!query) {
      return []
    }

    return this.parseFollowersQuery(query)
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
    setTimeout(() => {
      void this.announcePublicSubscriptionsForPeer(peerId).catch(err => this.emit('error', err))
    }, 250)
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

  private getOmemoDeviceIdOrThrow(): number {
    return this.omemoStateManager.getDeviceId()
  }

  private getOmemoIdentityKeyPairOrThrow() {
    return this.omemoStateManager.getIdentityKeyPair()
  }

  private getOmemoSignedPreKeyOrThrow() {
    return this.omemoStateManager.getSignedPreKey()
  }

  private getOmemoBundle(): XmppOmemoBundle {
    return this.omemoStateManager.getBundle()
  }

  private buildOmemoDevicesQuery(): Element {
    return this.omemoStateManager.buildDevicesQuery()
  }

  private buildOmemoBundleQuery(deviceId: number): Element {
    return this.omemoStateManager.buildBundleQuery(deviceId)
  }

  private parseOmemoDeviceListQuery(items: Element): number[] {
    const list = items.getChild('item')?.getChild('list')
    if (!list || list.attrs.xmlns !== OMEMO_DEVICES_XMLNS) {
      return []
    }

    return (list.children as any[])
      .filter(child => child?.name === 'device')
      .map((child: Element) => Number(child.attrs.id))
      .filter(deviceId => Number.isFinite(deviceId) && deviceId > 0)
  }

  private parseOmemoBundleQuery(items: Element): XmppOmemoBundle | undefined {
    const item = items.getChild('item')
    if (!item) {
      return undefined
    }

    const bundle = item.getChild('bundle')
    if (!bundle || bundle.attrs.xmlns !== OMEMO_XMLNS) {
      return undefined
    }

    const identityKey = bundle.getChild('ik')?.text().trim()
    const signedPreKeyEl = bundle.getChild('spk')
    const signedPreKeySignature = bundle.getChild('spks')?.text().trim()
    if (!identityKey || !signedPreKeyEl || !signedPreKeySignature) {
      return undefined
    }

    const preKeys = (bundle.children as any[])
      .filter(child => child?.name === 'pk')
      .map((child: Element) => ({
        keyId: Number(child.attrs.id ?? child.attrs.keyId ?? child.attrs.signedPreKeyId ?? 0),
        publicKey: child.text().trim()
      }))
      .filter(preKey => Number.isFinite(preKey.keyId) && preKey.keyId > 0 && preKey.publicKey)

    return {
      deviceId: Number(item.attrs.id),
      registrationId: Number(item.attrs.registrationId ?? 0),
      identityKey,
      signedPreKeyId: Number(signedPreKeyEl.attrs.id ?? signedPreKeyEl.attrs.signedPreKeyId ?? 0),
      signedPreKey: signedPreKeyEl.text().trim(),
      signedPreKeySignature,
      preKeys
    }
  }

  async fetchOmemoDeviceList(peerAddr: string | Multiaddr): Promise<number[]> {
    await this.ready
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const iq = xml(
      'iq',
      {
        to: this.jidFromPeerId(peerId),
        from: this.jid,
        type: 'get',
        id: Math.random().toString(36).substring(2, 11)
      },
      xml(
        'pubsub',
        { xmlns: 'http://jabber.org/protocol/pubsub' },
        xml('items', { node: OMEMO_DEVICES_NODE })
      )
    )
    const result = await this.sendIqRequest(peerAddr, iq)
    const pubsub = result.getChild('pubsub')
    const items = pubsub?.getChild('items')
    const devices = items ? this.parseOmemoDeviceListQuery(items) : []
    if (devices.length > 0) {
      this.peerOmemoDeviceLists.set(peerId, devices)
    }
    return devices
  }

  async fetchOmemoBundle(peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle> {
    await this.ready
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const iq = xml(
      'iq',
      {
        to: this.jidFromPeerId(peerId),
        from: this.jid,
        type: 'get',
        id: Math.random().toString(36).substring(2, 11)
      },
      xml(
        'pubsub',
        { xmlns: 'http://jabber.org/protocol/pubsub' },
        xml(
          'items',
          { node: OMEMO_BUNDLES_NODE },
          xml('item', { id: String(deviceId) })
        )
      )
    )
    const result = await this.sendIqRequest(peerAddr, iq)
    const pubsub = result.getChild('pubsub')
    const items = pubsub?.getChild('items')
    const bundle = items ? this.parseOmemoBundleQuery(items) : undefined
    if (!bundle) {
      throw new Error(`No OMEMO bundle returned for device ${deviceId}`)
    }

    let bundles = this.peerOmemoBundles.get(peerId)
    if (!bundles) {
      bundles = new Map()
      this.peerOmemoBundles.set(peerId, bundles)
    }
    bundles.set(deviceId, bundle)
    return bundle
  }

  private async getPeerOmemoDevices(peerAddr: string | Multiaddr): Promise<number[]> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const cached = this.peerOmemoDeviceLists.get(peerId)
    if (cached && cached.length > 0) {
      return cached
    }

    return await this.fetchOmemoDeviceList(peerAddr)
  }

  private async getPeerOmemoBundle(peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const cached = this.peerOmemoBundles.get(peerId)?.get(deviceId)
    if (cached) {
      return cached
    }

    return await this.fetchOmemoBundle(peerAddr, deviceId)
  }

  private async ensureOmemoSession(peerAddr: string | Multiaddr, deviceId: number): Promise<void> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerJid = this.jidFromPeerId(xmppStream.remotePeer.toString())
    const omemo = await loadOmemoModule()
    const remoteAddress = new omemo.OMEMOAddress(peerJid, deviceId)
    const store = this.getOmemoStore()
    const sessionCipher = new omemo.SessionCipher(store, remoteAddress)
    const hasOpenSession = await sessionCipher.hasOpenSession()
    if (hasOpenSession) {
      return
    }

    const bundle = await this.getPeerOmemoBundle(peerAddr, deviceId)
    const sessionBuilder = new omemo.SessionBuilder(store, remoteAddress)
    await sessionBuilder.processPreKey({
      registrationId: bundle.registrationId,
      identityKey: this.base64ToArrayBuffer(bundle.identityKey),
      signedPreKey: {
        keyId: bundle.signedPreKeyId,
        publicKey: this.base64ToArrayBuffer(bundle.signedPreKey),
        signature: this.base64ToArrayBuffer(bundle.signedPreKeySignature)
      },
      preKey: bundle.preKeys[0]
        ? {
            keyId: bundle.preKeys[0].keyId,
            publicKey: this.base64ToArrayBuffer(bundle.preKeys[0].publicKey)
          }
        : undefined
    })
  }

  async sendEncryptedMessage(peerAddr: string | Multiaddr, body: string): Promise<string> {
    await this.ready
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const toJid = `${peerId}@p2p`
    const itemId = Math.random().toString(36).substring(2, 11)
    const devices = await this.getPeerOmemoDevices(peerAddr)
    if (devices.length === 0) {
      throw new Error(`No OMEMO devices available for ${toJid}`)
    }

    const payloadKeyBytes = randomBytes(16)
    const iv = randomBytes(12)

    const cipher = createCipheriv('aes-128-gcm', payloadKeyBytes, iv)
    const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    const payload = Buffer.concat([ciphertext, authTag]).toString('base64')

    const keys: Element[] = []
    for (const deviceId of devices) {
      await this.ensureOmemoSession(peerAddr, deviceId)
      const omemo = await loadOmemoModule()
      const remoteAddress = new omemo.OMEMOAddress(toJid, deviceId)
      const sessionCipher = new omemo.SessionCipher(this.getOmemoStore(), remoteAddress)
      const encryptedKey = await sessionCipher.encrypt(payloadKeyBytes)
      keys.push(xml('key', { rid: String(deviceId) }, Buffer.from(encryptedKey.body, 'binary').toString('base64')))
    }

    const stanza = xml(
      'message',
      {
        to: toJid,
        from: this.jid,
        type: 'chat',
        id: itemId
      },
      xml(
        'encrypted',
        { xmlns: OMEMO_XMLNS },
        xml(
          'header',
          { sid: String(this.getOmemoDeviceIdOrThrow()) },
          xml('keys', { jid: toJid }, ...keys),
          xml('iv', {}, iv.toString('base64'))
        ),
        xml('payload', {}, payload)
      )
    )

    xmppStream.send(stanza)
    return itemId
  }

  async getOmemoDeviceId(): Promise<number> {
    await this.ready
    return this.getOmemoDeviceIdOrThrow()
  }

  async getOmemoRegistrationId(): Promise<number> {
    await this.ready
    return this.omemoStateManager.getRegistrationId()
  }

  async getOmemoIdentityKey(): Promise<string> {
    await this.ready
    return this.bufferToBase64(this.getOmemoIdentityKeyPairOrThrow().pubKey)
  }

  async getOmemoBundleSummary(): Promise<{
    deviceId: number
    registrationId: number
    preKeyCount: number
    signedPreKeyId: number
  }> {
    await this.ready
    const bundle = this.getOmemoBundle()
    return {
      deviceId: bundle.deviceId,
      registrationId: bundle.registrationId,
      preKeyCount: bundle.preKeys.length,
      signedPreKeyId: bundle.signedPreKeyId
    }
  }

  private async decryptOmemoKey(remoteAddress: OmemoAddress, payload: string): Promise<ArrayBuffer> {
    const omemo = await loadOmemoModule()
    const store = this.getOmemoStore()
    const sessionCipher = new omemo.SessionCipher(store, remoteAddress)
    try {
      return await sessionCipher.decryptPreKeyWhisperMessage(payload, 'base64')
    } catch (preKeyErr) {
      try {
        return await sessionCipher.decryptWhisperMessage(payload, 'base64')
      } catch (whisperErr) {
        throw whisperErr instanceof Error ? whisperErr : preKeyErr
      }
    }
  }

  private decryptOmemoPayload(payload: string, payloadKey: ArrayBuffer, ivB64: string): string {
    const bytes = Buffer.from(payload, 'base64')
    if (bytes.byteLength < 16) {
      throw new Error('OMEMO payload is too short')
    }

    const tag = bytes.subarray(bytes.byteLength - 16)
    const ciphertext = bytes.subarray(0, bytes.byteLength - 16)
    const iv = Buffer.from(ivB64, 'base64')
    const decipher = createDecipheriv('aes-128-gcm', Buffer.from(payloadKey), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }

  async getOpenPgpPublicKey(): Promise<string> {
    await this.ready
    return this.openPgpState?.publicKey ?? ''
  }

  async getOpenPgpFingerprint(): Promise<string> {
    await this.ready
    return this.openPgpFingerprint ?? this.openPgpState?.fingerprint ?? ''
  }

  async registerPeerOpenPgpPublicKey(peerAddr: string | Multiaddr, armoredKey: string): Promise<string> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const key = await openpgp.readKey({ armoredKey })
    this.peerOpenPgpKeys.set(peerId, armoredKey)
    return key.getFingerprint()
  }

  async setEncryptedPubSubSecret(topic: string, keyId: string, secret: string): Promise<void> {
    this.encryptedTopicSecrets.set(topic, {
      topic,
      keyId,
      secret,
      updatedAt: new Date().toISOString()
    })
  }

  async publishEncrypted(topic: string, body: string, options: { keyId?: string; secret?: string; itemId?: string } = {}): Promise<string> {
    const pubsub = this.getPubSubService()
    const secret = options.secret ?? this.encryptedTopicSecrets.get(topic)?.secret
    const keyId = options.keyId ?? this.encryptedTopicSecrets.get(topic)?.keyId ?? 'default'
    if (!secret) {
      throw new Error(`No OpenPGP shared secret configured for topic ${topic}`)
    }

    this.ensureTopicValidator(topic, 'secure')
    await pubsub.subscribe(topic)

    const message = await openpgp.createMessage({ text: body })
    const encrypted = await openpgp.encrypt({
      message,
      passwords: secret,
      format: 'binary'
    })
    const payload = Buffer.from(encrypted as Uint8Array).toString('base64')
    const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
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
            { id: itemId, key: keyId },
            xml( 'encrypted', { xmlns: OPENPGP_PUBSUB_XMLNS, key: keyId }, payload)
          )
        )
      )
    )

    await pubsub.publish(topic, new TextEncoder().encode(stanza.toString()))
    return itemId
  }

  private getOpenPgpPrivateKeyOrThrow(): openpgp.PrivateKey {
    if (!this.openPgpPrivateKey) {
      throw new Error('OpenPGP private key is not loaded')
    }
    return this.openPgpPrivateKey
  }

  private async getPeerOpenPgpKey(peerAddr: string | Multiaddr): Promise<openpgp.PublicKey> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    let armoredKey = this.peerOpenPgpKeys.get(peerId)
    if (!armoredKey) {
      const response = await this.fetchOpenPgpPublicKey(peerAddr)
      armoredKey = response.publicKey
      this.peerOpenPgpKeys.set(peerId, armoredKey)
    }
    return await openpgp.readKey({ armoredKey })
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

  async subscribeFeed(peerAddr: string | Multiaddr, options: { visibility?: XmppFeedVisibility } = {}): Promise<XmppFeedSubscriptionRecord> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const topic = this.feedTopicForPeer(peerId)
    const pubsub = this.getPubSubService()
    this.ensureTopicValidator(topic, 'feed')
    this.ensureTopicValidator(topic, 'attachment')
    await pubsub.subscribe(topic)
    const subscription = this.normalizeFeedSubscription({
      peerId,
      jid: this.jidFromPeerId(peerId),
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

  async setFeedSubscriptionVisibility(peerAddr: string | Multiaddr, visibility: XmppFeedVisibility): Promise<XmppFeedSubscriptionRecord> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const topic = this.feedTopicForPeer(peerId)
    const existing = this.feedSubscriptions.get(topic)
    if (!existing) {
      return await this.subscribeFeed(peerAddr, { visibility })
    }

    const next = this.normalizeFeedSubscription({
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

  async unsubscribeFeed(peerAddr: string | Multiaddr): Promise<void> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const peerId = xmppStream.remotePeer.toString()
    const topic = this.feedTopicForPeer(peerId)
    const pubsub = this.getPubSubService()
    const existing = this.feedSubscriptions.get(topic)
    if (existing && existing.visibility === 'public') {
      await this.publishSubscriptionDeclaration(existing, 'remove')
    }
    await pubsub.unsubscribe(topic)
    this.feedSubscriptions.delete(topic)
    await this.scheduleSubscriptionPersist()
  }

  async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; author?: string } = {}): Promise<string> {
    const pubsub = this.getPubSubService()
    const topic = options.topic ?? this.feedTopicForPeer(this.libp2p.peerId.toString())
    this.ensureTopicValidator(topic, 'feed')
    this.ensureTopicValidator(topic, 'attachment')
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
    this.ensureTopicValidator(collection.topic, 'attachment')
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
    this.ensureTopicValidator(feedTopic, 'attachment')
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
    this.ensureTopicValidator(collection.topic, 'attachment')
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

  async notice(topic: string, targetId: string, value?: string): Promise<string> {
    return await this.publishAttachment(topic, targetId, 'noticed', value)
  }

  async react(topic: string, targetId: string, reaction: string): Promise<string> {
    return await this.publishAttachment(topic, targetId, 'reaction', reaction)
  }

  async getFeedPosts(): Promise<XmppFeedPost[]> {
    await this.ready
    return Array.from(this.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  async getFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    await this.ready
    return Array.from(this.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  async getPublicFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    await this.ready
    return Array.from(this.feedSubscriptions.values())
      .filter(subscription => subscription.visibility === 'public')
      .sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  async watchFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFollowerWatch> {
    const parsed = this.parsePeerReference(peerAddr)
    const peerId = parsed.peerId || this.peerIdFromJid(peerAddr.toString())
    const topic = this.followerTopicForPeer(peerId)
    await this.watchFollowerTopic(peerId)
    return {
      peerId,
      topic,
      watchedAt: new Date().toISOString()
    }
  }

  async getFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]> {
    const parsed = this.parsePeerReference(peerAddr)
    const peerId = parsed.peerId || this.peerIdFromJid(peerAddr.toString())
    await this.watchFollowerTopic(peerId)

    if (peerId === this.libp2p.peerId.toString()) {
      return this.getFollowersForPeer(peerId)
        .filter(follower => follower.visibility === 'public')
        .sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
    }

    const remoteFollowers = await this.requestFollowersFromPeer(peerAddr)
    const merged = new Map<string, XmppFeedFollower>()

    for (const follower of [...this.getFollowersForPeer(peerId), ...remoteFollowers]) {
      if (follower.visibility !== 'public') {
        continue
      }
      merged.set(this.followerKey(follower.feedPeerId, follower.followerPeerId), follower)
    }

    return Array.from(merged.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }

  async getDiscoInfo(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoInfo> {
    await this.ready
    const parsed = this.parsePeerReference(peerAddr)
    const peerId = parsed.peerId || this.peerIdFromJid(peerAddr.toString())
    if (peerId === this.libp2p.peerId.toString()) {
      return parseDiscoInfoQuery(buildDiscoInfoQuery(this.discoveryIdentity, this.collections, node ?? this.discoveryNode))
    }
    return await this.queryDiscoInfo(peerAddr, node)
  }

  async getDiscoItems(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoItem[]> {
    await this.ready
    const parsed = this.parsePeerReference(peerAddr)
    const peerId = parsed.peerId || this.peerIdFromJid(peerAddr.toString())
    if (peerId === this.libp2p.peerId.toString()) {
      return parseDiscoItemsQuery(buildDiscoItemsQuery(this.discoveryNode, this.collections, this.collectionSubscriptions, this.jid, node ?? this.discoveryNode))
    }
    return await this.queryDiscoItems(peerAddr, node)
  }

  async getEntityCapabilities(peerAddr: string | Multiaddr): Promise<XmppEntityCapabilities | undefined> {
    await this.ready
    const parsed = this.parsePeerReference(peerAddr)
    const peerId = parsed.peerId || this.peerIdFromJid(peerAddr.toString())
    if (peerId === this.libp2p.peerId.toString()) {
      const info = parseDiscoInfoQuery(buildDiscoInfoQuery(this.discoveryIdentity, this.collections))
      return {
        peerId,
        jid: this.jid,
        node: this.discoveryNode,
        ver: info.ver,
        hash: info.hash,
        info,
        discoveredAt: new Date().toISOString()
      }
    }
    const cached = this.entityCapabilities.get(peerId)
    if (cached) {
      return cached
    }

    try {
      const info = await this.queryDiscoInfo(peerAddr)
      const discoveredAt = new Date().toISOString()
      const capabilities: XmppEntityCapabilities = {
        peerId,
        jid: this.jidFromPeerId(peerId),
        node: info.node ?? this.discoveryNode,
        ver: info.ver,
        hash: info.hash,
        info,
        discoveredAt
      }
      this.entityCapabilities.set(peerId, capabilities)
      return capabilities
    } catch {
      return undefined
    }
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

  async getAttachments(topic?: string, targetId?: string): Promise<XmppAttachment[]> {
    await this.ready
    const attachments = Array.from(this.attachmentHistory.values())
    return attachments
      .filter(attachment => topic ? attachment.topic === topic : true)
      .filter(attachment => targetId ? attachment.targetId === targetId : true)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  async getAttachmentSummaries(topic?: string): Promise<XmppAttachmentSummary[]> {
    await this.ready
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
    await this.subscriptionSaveQueue
    await this.persistSubscriptionState()
    await this.followerSaveQueue
    await this.persistFollowerState()
    await this.collectionSaveQueue
    await this.persistCollectionState()
    await this.attachmentSaveQueue
    await this.persistAttachmentHistory()
    await this.omemoStateManager.close()
    await this.openPgpSaveQueue
    await this.persistOpenPgpState()
  }
}
