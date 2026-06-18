import { promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import { Libp2p } from 'libp2p'
import { xml, Element, Parser } from '@xmpp/xml'
import { EventEmitter } from 'events'
import { XmppStream } from './xmpp-stream.js'
import * as openpgp from 'openpgp'
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
  handlePubSubPayload as handlePubSubPayloadFromModule,
  handlePubSubMessageElement as handlePubSubMessageElementFromModule,
  type XmppPubSubContext
} from './xmpp-pubsub.js'
import {
  handleSubscribe as handleSubscribeFromModule,
  handleSubscribed as handleSubscribedFromModule,
  handleUnsubscribe as handleUnsubscribeFromModule,
  handleUnsubscribed as handleUnsubscribedFromModule,
  sendPresenceToPeer as sendPresenceToPeerFromModule,
  sendCurrentPresenceToPeer as sendCurrentPresenceToPeerFromModule,
  sendPresence as sendPresenceFromModule,
  addRosterEntry as addRosterEntryFromModule,
  removeRosterEntry as removeRosterEntryFromModule,
  subscribePresence as subscribePresenceFromModule,
  unsubscribePresence as unsubscribePresenceFromModule,
  broadcastPresence as broadcastPresenceFromModule,
  type XmppRosterContext
} from './xmpp-roster.js'
import {
  subscribeFeed as subscribeFeedFromModule,
  setFeedSubscriptionVisibility as setFeedSubscriptionVisibilityFromModule,
  unsubscribeFeed as unsubscribeFeedFromModule,
  publishFeed as publishFeedFromModule,
  getFeedPosts as getFeedPostsFromModule,
  getFeedSubscriptions as getFeedSubscriptionsFromModule,
  getPublicFeedSubscriptions as getPublicFeedSubscriptionsFromModule,
  watchFeedFollowers as watchFeedFollowersFromModule,
  getFeedFollowers as getFeedFollowersFromModule,
  type XmppFeedContext
} from './xmpp-feed.js'
import {
  createCollection as createCollectionFromModule,
  addFeedToCollection as addFeedToCollectionFromModule,
  subscribeCollection as subscribeCollectionFromModule,
  publishCollection as publishCollectionFromModule,
  getCollections as getCollectionsFromModule,
  getCollectionSubscriptions as getCollectionSubscriptionsFromModule,
  getCollectionPosts as getCollectionPostsFromModule,
  getAttachments as getAttachmentsFromModule,
  getAttachmentSummaries as getAttachmentSummariesFromModule,
  type XmppCollectionContext
} from './xmpp-collection.js'
import {
  fetchOpenPgpPublicKey as fetchOpenPgpPublicKeyFromModule,
  getPeerOpenPgpKey as getPeerOpenPgpKeyFromModule,
  handleSecureMessageStanza as handleSecureMessageStanzaFromModule,
  publishEncrypted as publishEncryptedFromModule,
  registerPeerOpenPgpPublicKey as registerPeerOpenPgpPublicKeyFromModule,
  sendEncryptedMessage as sendEncryptedMessageFromModule,
  type XmppSecureContext
} from './xmpp-secure.js'
import {
  loadAttachmentHistoryState,
  loadCollectionState,
  loadFeedHistoryState,
  loadFollowerState,
  loadRosterState,
  loadSubscriptionState,
  persistAttachmentHistoryState,
  persistCollectionState,
  persistFeedHistoryState,
  persistFollowerState,
  persistOpenPgpState as persistOpenPgpStateFile,
  persistRosterState,
  persistSubscriptionState
} from './xmpp-persistence.js'
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
  OmemoDirection
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

  private getPersistenceLoadContext() {
    return {
      rosterPath: this.rosterPath,
      feedPath: this.feedPath,
      subscriptionPath: this.subscriptionPath,
      followerPath: this.followerPath,
      collectionPath: this.collectionPath,
      attachmentPath: this.attachmentPath,
      openPgpPath: this.openPgpPath,
      roster: this.roster,
      feedHistory: this.feedHistory,
      feedSubscriptions: this.feedSubscriptions,
      followers: this.followers,
      collections: this.collections,
      collectionHistory: this.collectionHistory,
      attachmentHistory: this.attachmentHistory,
      normalizeRosterEntry: this.normalizeRosterEntry.bind(this),
      normalizeFeedPost: this.normalizeFeedPost.bind(this),
      normalizeFeedSubscription: this.normalizeFeedSubscription.bind(this),
      normalizeFollower: this.normalizeFollower.bind(this),
      normalizeCollection: this.normalizeCollection.bind(this),
      normalizeCollectionPost: this.normalizeCollectionPost.bind(this),
      normalizeAttachment: this.normalizeAttachment.bind(this),
      feedHistoryKey: this.feedHistoryKey.bind(this),
      feedSubscriptionKey: this.feedSubscriptionKey.bind(this),
      followerKey: this.followerKey.bind(this),
      collectionHistoryKey: this.collectionHistoryKey.bind(this),
      attachmentHistoryKey: this.attachmentHistoryKey.bind(this),
      restoreFeedSubscriptions: this.restoreFeedSubscriptions.bind(this),
      restoreFollowerSubscriptions: this.restoreFollowerSubscriptions.bind(this),
      restoreCollectionSubscriptions: this.restoreCollectionSubscriptions.bind(this),
      onCollectionLoaded: this.indexCollectionMembers.bind(this)
    }
  }

  private getPersistenceSaveContext() {
    return {
      rosterPath: this.rosterPath,
      feedPath: this.feedPath,
      subscriptionPath: this.subscriptionPath,
      followerPath: this.followerPath,
      collectionPath: this.collectionPath,
      attachmentPath: this.attachmentPath,
      openPgpPath: this.openPgpPath,
      roster: this.roster,
      feedHistory: this.feedHistory,
      feedSubscriptions: this.feedSubscriptions,
      followers: this.followers,
      collections: this.collections,
      collectionHistory: this.collectionHistory,
      attachmentHistory: this.attachmentHistory,
      openPgpState: this.openPgpState
    }
  }

  private async loadRoster(): Promise<void> {
    await loadRosterState(this.getPersistenceLoadContext())
  }

  private async loadFeedHistory(): Promise<void> {
    await loadFeedHistoryState(this.getPersistenceLoadContext(), FEED_HISTORY_LIMIT)
  }

  private async loadSubscriptionState(): Promise<void> {
    await loadSubscriptionState(this.getPersistenceLoadContext(), SUBSCRIPTION_HISTORY_LIMIT)
  }

  private async loadFollowerState(): Promise<void> {
    await loadFollowerState(this.getPersistenceLoadContext(), SUBSCRIPTION_HISTORY_LIMIT)
  }

  private async loadCollectionState(): Promise<void> {
    await loadCollectionState(this.getPersistenceLoadContext(), COLLECTION_HISTORY_LIMIT)
  }

  private async loadAttachmentHistory(): Promise<void> {
    await loadAttachmentHistoryState(this.getPersistenceLoadContext(), ATTACHMENT_HISTORY_LIMIT)
  }

  private getPubSubContext(): XmppPubSubContext {
    return {
      feedTopicForPeer: this.feedTopicForPeer.bind(this),
      getEncryptedTopicSecret: (topic: string) => this.encryptedTopicSecrets.get(topic)?.secret,
      removeFollower: this.removeFollower.bind(this),
      recordFollower: this.recordFollower.bind(this),
      recordAttachment: this.recordAttachment.bind(this),
      recordCollectionPost: this.recordCollectionPost.bind(this),
      recordFeedPost: this.recordFeedPost.bind(this),
      emitPubSubMessage: (message) => this.emit('pubsub:message', message),
      emitError: (error) => this.emit('error', error)
    }
  }

  private getRosterContext(): XmppRosterContext {
    const self = this
    return {
      jid: this.jid,
      ready: this.ready,
      get selfPresence() {
        return self.selfPresence
      },
      setSelfPresence: (presence) => {
        this.selfPresence = presence
      },
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getStreamByJid: this.getStreamByJid.bind(this),
      getStreams: () => this.streams,
      upsertRosterEntry: this.upsertRosterEntry.bind(this),
      deleteRosterEntry: this.deleteRosterEntry.bind(this),
      requestRosterFromPeer: this.requestRosterFromPeer.bind(this),
      subscriptionToFlags: this.subscriptionToFlags.bind(this),
      flagsToSubscription: this.flagsToSubscription.bind(this),
      jidFromPeerId: this.jidFromPeerId.bind(this),
      emitPresenceSubscribe: (fromJid) => this.emit('presence:subscribe', { from: fromJid }),
      emitPresenceSubscribed: (fromJid) => this.emit('presence:subscribed', { from: fromJid }),
      emitPresenceUnsubscribe: (fromJid) => this.emit('presence:unsubscribe', { from: fromJid }),
      emitPresenceUnsubscribed: (fromJid) => this.emit('presence:unsubscribed', { from: fromJid }),
      discoveryNode: this.discoveryNode,
      discoveryIdentity: this.discoveryIdentity,
      collections: this.collections
    }
  }

  private getFeedContext(): XmppFeedContext {
    return {
      jid: this.jid,
      ready: this.ready,
      libp2p: this.libp2p,
      feedHistory: this.feedHistory,
      feedSubscriptions: this.feedSubscriptions,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getPubSubService: this.getPubSubService.bind(this),
      ensureTopicValidator: this.ensureTopicValidator.bind(this),
      normalizeFeedSubscription: this.normalizeFeedSubscription.bind(this),
      recordFeedSubscription: this.recordFeedSubscription.bind(this),
      watchFollowerTopic: this.watchFollowerTopic.bind(this),
      publishSubscriptionDeclaration: this.publishSubscriptionDeclaration.bind(this),
      scheduleSubscriptionPersist: this.scheduleSubscriptionPersist.bind(this),
      feedTopicForPeer: this.feedTopicForPeer.bind(this),
      followerTopicForPeer: this.followerTopicForPeer.bind(this),
      jidFromPeerId: this.jidFromPeerId.bind(this),
      peerIdFromJid: this.peerIdFromJid.bind(this),
      parsePeerReference: this.parsePeerReference.bind(this),
      requestFollowersFromPeer: this.requestFollowersFromPeer.bind(this),
      getFollowersForPeer: this.getFollowersForPeer.bind(this),
      followerKey: this.followerKey.bind(this),
      recordFeedPost: this.recordFeedPost.bind(this)
    }
  }

  private getCollectionContext(): XmppCollectionContext {
    return {
      jid: this.jid,
      ready: this.ready,
      collections: this.collections,
      collectionSubscriptions: this.collectionSubscriptions,
      collectionHistory: this.collectionHistory,
      attachmentHistory: this.attachmentHistory,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getPubSubService: this.getPubSubService.bind(this),
      ensureTopicValidator: this.ensureTopicValidator.bind(this),
      indexCollectionMembers: this.indexCollectionMembers.bind(this),
      unindexCollectionMembers: this.unindexCollectionMembers.bind(this),
      scheduleCollectionPersist: this.scheduleCollectionPersist.bind(this),
      normalizeCollection: this.normalizeCollection.bind(this),
      normalizeCollectionMember: this.normalizeCollectionMember.bind(this),
      collectionTopicForId: this.collectionTopicForId.bind(this),
      feedTopicForPeer: this.feedTopicForPeer.bind(this),
      jidFromPeerId: this.jidFromPeerId.bind(this),
      peerIdFromJid: this.peerIdFromJid.bind(this),
      parsePeerReference: this.parsePeerReference.bind(this),
      publishCollectionPost: this.publishCollectionPost.bind(this),
      publishAttachment: this.publishAttachment.bind(this),
      emitCollectionChange: (collection) => this.emit('collection:change', collection),
      emitCollectionSubscribe: (sub) => this.emit('collection:subscribe', sub)
    }
  }

  private getSecureContext(): XmppSecureContext {
    return {
      jid: this.jid,
      ready: this.ready,
      jidFromPeerId: this.jidFromPeerId.bind(this),
      getOrCreateStream: this.getOrCreateStream.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      emitMessage: (message) => this.emit('message', message),
      emitError: (error) => this.emit('error', error),
      getOmemoDeviceIdOrThrow: this.getOmemoDeviceIdOrThrow.bind(this),
      getOmemoStore: this.getOmemoStore.bind(this),
      getPeerOmemoDevices: this.getPeerOmemoDevices.bind(this),
      getPeerOmemoBundle: this.getPeerOmemoBundle.bind(this),
      getOpenPgpPrivateKeyOrThrow: this.getOpenPgpPrivateKeyOrThrow.bind(this),
      getPubSubService: this.getPubSubService.bind(this),
      ensureTopicValidator: (topic, kind) => this.ensureTopicValidator(topic, kind),
      getEncryptedTopicSecret: (topic: string) => this.encryptedTopicSecrets.get(topic)?.secret,
      getPeerOpenPgpArmoredKey: (peerId: string) => this.peerOpenPgpKeys.get(peerId),
      cachePeerOpenPgpKey: (peerId: string, armoredKey: string) => {
        this.peerOpenPgpKeys.set(peerId, armoredKey)
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
    await persistOpenPgpStateFile(this.openPgpPath, this.openPgpState)
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
    await persistRosterState(this.getPersistenceSaveContext())
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
    await persistFeedHistoryState(this.getPersistenceSaveContext())
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
    await persistSubscriptionState(this.getPersistenceSaveContext())
  }

  private async persistFollowerState(): Promise<void> {
    await persistFollowerState(this.getPersistenceSaveContext())
  }

  private async persistCollectionState(): Promise<void> {
    await persistCollectionState(this.getPersistenceSaveContext())
  }

  private async persistAttachmentHistory(): Promise<void> {
    await persistAttachmentHistoryState(this.getPersistenceSaveContext())
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

  async fetchOpenPgpPublicKey(peerAddr: string | Multiaddr): Promise<XmppOpenPgpPublicKeyResponse> {
    return await fetchOpenPgpPublicKeyFromModule(peerAddr, this.getSecureContext())
  }

  private async getPeerOpenPgpKey(peerAddr: string | Multiaddr): Promise<openpgp.PublicKey> {
    return await getPeerOpenPgpKeyFromModule(peerAddr, this.getSecureContext())
  }

  private async handlePubSubPayload(topic: string, xmlStr: string): Promise<void> {
    await handlePubSubPayloadFromModule(topic, xmlStr, this.getPubSubContext())
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
    await handleSubscribeFromModule(this.getRosterContext(), peerId, fromJid)
  }

  private async handleSubscribed(fromJid: string) {
    await handleSubscribedFromModule(this.getRosterContext(), fromJid)
  }

  private async handleUnsubscribe(peerId: string, fromJid: string) {
    await handleUnsubscribeFromModule(this.getRosterContext(), peerId, fromJid)
  }

  private async handleUnsubscribed(fromJid: string) {
    await handleUnsubscribedFromModule(this.getRosterContext(), fromJid)
  }

  private async sendCurrentPresenceToPeer(peerId: string) {
    await sendCurrentPresenceToPeerFromModule(this.getRosterContext(), peerId)
  }

  private async sendPresenceToPeer(peerId: string, type?: string, status?: string, show?: string) {
    await sendPresenceToPeerFromModule(this.getRosterContext(), peerId, type, status, show)
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
        await handlePubSubMessageElementFromModule(peerId, element, this.getPubSubContext())
        return
      }

      if (await handleSecureMessageStanzaFromModule(element, fromJid, toJid, this.getSecureContext())) {
        return
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
    return await addRosterEntryFromModule(this.getRosterContext(), jid, name)
  }

  async removeRosterEntry(jid: string): Promise<void> {
    await removeRosterEntryFromModule(this.getRosterContext(), jid)
  }

  async fetchRoster(peerAddr: string | Multiaddr): Promise<XmppRosterEntry[]> {
    await this.ready
    return await this.requestRosterFromPeer(peerAddr)
  }

  async subscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    await subscribePresenceFromModule(this.getRosterContext(), peerAddr)
  }

  async unsubscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    await unsubscribePresenceFromModule(this.getRosterContext(), peerAddr)
  }

  async broadcastPresence(type?: string, status?: string, show?: string) {
    await broadcastPresenceFromModule(this.getRosterContext(), type, status, show)
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

  async sendEncryptedMessage(peerAddr: string | Multiaddr, body: string): Promise<string> {
    return await sendEncryptedMessageFromModule(peerAddr, body, this.getSecureContext())
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

  async getOpenPgpPublicKey(): Promise<string> {
    await this.ready
    return this.openPgpState?.publicKey ?? ''
  }

  async getOpenPgpFingerprint(): Promise<string> {
    await this.ready
    return this.openPgpFingerprint ?? this.openPgpState?.fingerprint ?? ''
  }

  async registerPeerOpenPgpPublicKey(peerAddr: string | Multiaddr, armoredKey: string): Promise<string> {
    return await registerPeerOpenPgpPublicKeyFromModule(peerAddr, armoredKey, this.getSecureContext())
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
    return await publishEncryptedFromModule(topic, body, this.getSecureContext(), options)
  }

  private getOpenPgpPrivateKeyOrThrow(): openpgp.PrivateKey {
    if (!this.openPgpPrivateKey) {
      throw new Error('OpenPGP private key is not loaded')
    }
    return this.openPgpPrivateKey
  }

  // Send presence updates
  async sendPresence(peerAddr: string | Multiaddr, type?: string, status?: string, show?: string) {
    await sendPresenceFromModule(this.getRosterContext(), peerAddr, type, status, show)
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
    return await subscribeFeedFromModule(this.getFeedContext(), peerAddr, options)
  }

  async setFeedSubscriptionVisibility(peerAddr: string | Multiaddr, visibility: XmppFeedVisibility): Promise<XmppFeedSubscriptionRecord> {
    return await setFeedSubscriptionVisibilityFromModule(this.getFeedContext(), peerAddr, visibility)
  }

  async unsubscribeFeed(peerAddr: string | Multiaddr): Promise<void> {
    await unsubscribeFeedFromModule(this.getFeedContext(), peerAddr)
  }

  async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; author?: string } = {}): Promise<string> {
    return await publishFeedFromModule(this.getFeedContext(), body, options)
  }

  async createCollection(id: string, name?: string): Promise<XmppCollectionNode> {
    return await createCollectionFromModule(this.getCollectionContext(), id, name)
  }

  async addFeedToCollection(collectionId: string, peerAddr: string | Multiaddr): Promise<XmppCollectionNode> {
    return await addFeedToCollectionFromModule(this.getCollectionContext(), collectionId, peerAddr)
  }

  async subscribeCollection(id: string): Promise<XmppCollectionSubscription> {
    return await subscribeCollectionFromModule(this.getCollectionContext(), id)
  }

  async publishCollection(id: string, body: string, options: { itemId?: string; title?: string; author?: string } = {}): Promise<string> {
    return await publishCollectionFromModule(this.getCollectionContext(), id, body, options)
  }

  async notice(topic: string, targetId: string, value?: string): Promise<string> {
    return await this.publishAttachment(topic, targetId, 'noticed', value)
  }

  async react(topic: string, targetId: string, reaction: string): Promise<string> {
    return await this.publishAttachment(topic, targetId, 'reaction', reaction)
  }

  async getFeedPosts(): Promise<XmppFeedPost[]> {
    return await getFeedPostsFromModule(this.getFeedContext())
  }

  async getFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    return await getFeedSubscriptionsFromModule(this.getFeedContext())
  }

  async getPublicFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    return await getPublicFeedSubscriptionsFromModule(this.getFeedContext())
  }

  async watchFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFollowerWatch> {
    return await watchFeedFollowersFromModule(this.getFeedContext(), peerAddr)
  }

  async getFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]> {
    return await getFeedFollowersFromModule(this.getFeedContext(), peerAddr)
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
    return await getCollectionsFromModule(this.getCollectionContext())
  }

  async getCollectionSubscriptions(): Promise<XmppCollectionSubscription[]> {
    return await getCollectionSubscriptionsFromModule(this.getCollectionContext())
  }

  async getCollectionPosts(collectionId?: string): Promise<XmppCollectionPost[]> {
    return await getCollectionPostsFromModule(this.getCollectionContext(), collectionId)
  }

  async getAttachments(topic?: string, targetId?: string): Promise<XmppAttachment[]> {
    return await getAttachmentsFromModule(this.getCollectionContext(), topic, targetId)
  }

  async getAttachmentSummaries(topic?: string): Promise<XmppAttachmentSummary[]> {
    return await getAttachmentSummariesFromModule(this.getCollectionContext(), topic)
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
