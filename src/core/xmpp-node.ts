/**
 * @packageDocumentation Main XMPP runtime node that wires libp2p transport, roster
 * state, feeds, collections, MUC, uploads, and secure messaging together.
 */

import { Libp2p } from 'libp2p'
import { peerIdFromString } from '@libp2p/peer-id'
import { jid as xmppJid } from '@xmpp/client'
import { xml, Element, Parser } from '@xmpp/xml'
import { XmppChatManager } from './xmpp-chat.js'
import { XmppClientBridge, type ServerConnectionInfo, type ServerMessageEvent, type ServerMucMessageEvent, type ServerPubsubEvent, type ServerDiscoInfoResult, type ServerDiscoItemsResult, type ServerMucRoomInfo, type ServerPubsubSubscriptionStatus } from './xmpp-client-bridge.js'
import { buildXepElements, parseXepMetadata } from './xmpp-xep-helpers.js'
import { bufferToBase64 } from './xmpp-utils.js'
import { EventEmitter } from 'events'
import { XmppStream } from './xmpp-stream.js'
import * as openpgp from 'openpgp'
import { XmppReliabilityManager } from './xmpp-reliability.js'
import { MAX_PEER_UPLOAD_BYTES, XmppUploadManager, UPLOAD_ANNOUNCEMENTS_TOPIC } from './xmpp-uploads.js'
import {
  buildCapsElement,
  buildDiscoInfoQuery,
  buildDiscoItemsQuery,
  getCapsCacheKey,
  parseCapsPresence,
  parseDiscoInfoQuery,
  parseDiscoItemsQuery,
  DISCOVERY_NODE,
  ATOM_XMLNS,
  DISCO_INFO_XMLNS,
  DISCO_ITEMS_XMLNS,
  CAPS_XMLNS,
  PUBSUB_EVENT_XMLNS,
  COLLECTION_XMLNS,
  ATTACHMENT_XMLNS,
  HTTP_UPLOAD_XMLNS,
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
  type XmppEntityCapabilities,
  type XmppDiscoveryContext,
  XmppDiscoveryManager
} from './xmpp-discovery.js'
import {
  XmppOmemoStateManager,
  type XmppOmemoBundle
} from './xmpp-omemo-state.js'
import { XmppOpenPgpStateManager } from './xmpp-openpgp.js'
import {
  fetchOmemoDeviceList as fetchOmemoDeviceListFromModule,
  fetchOmemoBundle as fetchOmemoBundleFromModule,
  getPeerOmemoDevices as getPeerOmemoDevicesFromModule,
  getPeerOmemoBundle as getPeerOmemoBundleFromModule,
  parseOmemoDeviceListQuery as parseOmemoDeviceListQueryFromModule,
  parseOmemoBundleQuery as parseOmemoBundleQueryFromModule,
  type XmppOmemoContext
} from './xmpp-omemo.js'
import {
  sendIqRequest as sendIqRequestFromModule,
  sendIqResult as sendIqResultFromModule,
  sendIqError as sendIqErrorFromModule,
  handleStanza as handleStanzaFromModule,
  type PendingIq,
  type XmppRouterContext
} from './xmpp-router.js'
import {
  handlePubSubPayload as handlePubSubPayloadFromModule,
  handlePubSubMessageElement as handlePubSubMessageElementFromModule,
  type XmppPubSubContext
} from './xmpp-pubsub.js'
import { XmppRosterManager } from './xmpp-roster.js'
import { XmppFeedManager, type XmppFeedContext } from './xmpp-feed.js'
import { XmppCollectionManager, type XmppCollectionContext } from './xmpp-collection.js'
import {
  fetchOpenPgpPublicKey as fetchOpenPgpPublicKeyFromModule,
  getPeerOpenPgpKey as getPeerOpenPgpKeyFromModule,
  handleSecureMessageStanza as handleSecureMessageStanzaFromModule,
  publishEncrypted as publishEncryptedFromModule,
  registerPeerOpenPgpPublicKey as registerPeerOpenPgpPublicKeyFromModule,
  sendEncryptedMessage as sendEncryptedMessageFromModule,
  type XmppSecureContext
} from './xmpp-secure.js'
import { XmppMucManager, type XmppMucContext } from './xmpp-muc.js'
import { loadOmemoModule as loadNodeOmemoModule, type OmemoModule } from './omemo-runtime.js'
import {
  readDhtJson,
  writeDhtJson,
  loadMucStateFromDht,
  persistMucStateToDht,
  bufferStanzaToDht,
  flushDhtMailbox,
  mucSettingsKey,
  mucSettingsIndexKey,
  mailboxKey
} from './xmpp-dht.js'

import {
  loadAttachmentHistoryState,
  loadCollectionState,
  loadFeedHistoryState,
  loadFollowerState,
  loadMucState as loadMucStateFile,
  loadMucHistoryState,
  loadChatHistoryState,
  loadRosterState,
  loadVCardState,
  loadSubscriptionState,
  persistAttachmentHistoryState,
  persistCollectionState,
  persistFeedHistoryState,
  persistFollowerState,
  persistMucState as persistMucStateFile,
  persistMucHistoryState,
  persistChatHistoryState,
  persistOpenPgpState as persistOpenPgpStateFile,
  persistRosterState,
  persistVCardState,
  persistSubscriptionState
} from './xmpp-persistence.js'
import type { XmppStorage } from './storage/types.js'
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
  type XmppUploadManifest,
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
  type XmppMucRoomSettings,
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
  normalizeMucRoomSettings,
  normalizeMucMessage,
  normalizeVCardProfile,
  normalizeRosterEntry,
  parsePeerReference,
  peerIdFromJid,
  type XmppUploadProvider,
  type XmppSubscriptionFile,
  type XmppVCardProfile,
  subscriptionToFlags,
  type XmppMucMessage,
  type XmppMessage
} from './xmpp-records.js'
import { buildMicroblogEntry, buildTagUri, deriveMicroblogTitle, parseMicroblogEntry } from './xmpp-atom.js'
import type {
  OmemoDirection
} from './omemo-runtime.js'
import { multiaddr, Multiaddr } from '@multiformats/multiaddr'
import { isPrivate } from '@libp2p/utils'
import { TopicValidatorResult } from '@libp2p/gossipsub'
import { buildVCard } from './xmpp-vcard.js'

const OPENPGP_IQ_XMLNS = 'urn:xmpp:openpgp:0'
const FEED_HISTORY_LIMIT = 50
const COLLECTION_HISTORY_LIMIT = 100
const ATTACHMENT_HISTORY_LIMIT = 200
const SUBSCRIPTION_HISTORY_LIMIT = 200
const MUC_HISTORY_LIMIT = 500
const CHAT_HISTORY_LIMIT = 500
const MUC_SETTINGS_INDEX_PREFIX = '/xmpp/muc/index/'
const MUC_SETTINGS_PREFIX = '/xmpp/muc/room/'
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

/**
 * Optional configuration for the XMPP node wrapper.
 */
export interface XmppNodeOptions {
  nickname?: string
  omemoModuleLoader?: () => Promise<import('./omemo-runtime.js').OmemoModule>
  httpUploadServer?: boolean
  /** Enable native XMPP TCP in a runtime whose environment globals are ambiguous. */
  allowNativeXmppTcp?: boolean
}

/**
 * High-level facade around the XMPP protocol managers and libp2p streams.
 */
export class XmppNode extends EventEmitter {
  private readonly httpUploadAvailable: boolean
  private readonly omemoModuleLoader: () => Promise<OmemoModule>
  private libp2p: Libp2p
  private streams = new Map<string, XmppStream>()
  private peerAddrs = new Map<string, Multiaddr>()
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private reconnectAttempts = new Map<string, number>()
  private readonly maxReconnectDelay = 30000
  private readonly minReconnectDelay = 1000
  private reliabilityManager = new XmppReliabilityManager()
  private dhtMailboxPeerListener?: EventListener
  private discoveredPeerListener?: EventListener
  private disconnectedPeerListener?: EventListener
  public readonly rosterManager: XmppRosterManager
  public get roster() {
    return this.rosterManager.entries
  }
  public readonly feedManager: XmppFeedManager
  public readonly collectionManager: XmppCollectionManager
  public readonly discoveryManager: XmppDiscoveryManager
  private chat!: XmppChatManager
  public get chatHistory() {
    return this.chat.chatHistory
  }
  private pendingIq = new Map<string, PendingIq>()
  private topicValidationKinds = new Map<string, Set<'feed' | 'collection' | 'attachment' | 'subscription' | 'secure'>>()
  public get selfPresence() {
    return this.rosterManager.selfPresence
  }
  public get selfVCard() {
    return this.rosterManager.selfVCard
  }
  private get peerLocalpart(): string {
    return this.libp2p.peerId.toString()
  }
  public readonly storage: XmppStorage
  public readonly uploadHost: string
  public readonly uploadPort: number
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
  private readonly openPgpStateManager: XmppOpenPgpStateManager
  private readonly peerOpenPgpKeys = new Map<string, string>()
  private readonly encryptedTopicSecrets = new Map<string, XmppEncryptedTopicSecret>()
  public readonly jid: string
  public readonly muc: XmppMucManager
  public readonly uploads: XmppUploadManager
  public readonly clientBridge: XmppClientBridge
  public readonly ready: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (err: any) => void

  constructor(libp2p: Libp2p, storage: XmppStorage, options: XmppNodeOptions = {}) {
    super()
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.libp2p = libp2p
    this.omemoModuleLoader = options.omemoModuleLoader ?? loadNodeOmemoModule
    this.httpUploadAvailable = options.httpUploadServer !== false
    this.jid = `${this.libp2p.peerId.toString()}@p2p`
    this.storage = storage
    this.uploadHost = (typeof process !== 'undefined' ? process.env?.XMPP_UPLOAD_HOST : undefined) ?? '127.0.0.1'
    this.uploadPort = Number.parseInt((typeof process !== 'undefined' ? process.env?.XMPP_UPLOAD_PORT : undefined) ?? '0', 10) || 0
    this.omemoStateManager = new XmppOmemoStateManager(storage, this.omemoModuleLoader)
    this.openPgpStateManager = new XmppOpenPgpStateManager(storage, this.jid)
    this.muc = new XmppMucManager(this.getMucContext())
    this.uploads = new XmppUploadManager(this)
    this.clientBridge = new XmppClientBridge(options.allowNativeXmppTcp)
    this.forwardClientBridgeEvents()
    this.chat = new XmppChatManager({
      libp2p: this.libp2p,
      storage: this.storage,
      jid: this.jid,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      sendIqResult: this.sendIqResult.bind(this),
      parsePeerReference: this.parsePeerReference.bind(this),
      jidFromPeerId: this.jidFromPeerId.bind(this),
      emit: this.emit.bind(this)
    })
    this.collectionManager = new XmppCollectionManager(this.getCollectionContext())
    this.discoveryManager = new XmppDiscoveryManager(this.getDiscoveryContext())
    const rosterThis = this
    this.rosterManager = new XmppRosterManager({
      jid: this.jid,
      libp2p: this.libp2p,
      storage: this.storage,
      get ready() { return rosterThis.ready as Promise<void> },
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getStreamByJid: this.getStreamByJid.bind(this),
      getStreams: () => this.streams,
      emit: this.emit.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      discoveryNode: this.discoveryNode,
      discoveryIdentity: this.discoveryIdentity,
      httpUploadAvailable: this.httpUploadAvailable,
      collections: this.collectionManager.collections
    })
    this.feedManager = new XmppFeedManager(this.getFeedContext())
    if (options.nickname) {
      this.rosterManager.selfPresence.nickname = options.nickname
      this.rosterManager.selfVCard.nickname = options.nickname
    }
    this.rosterManager.initialize()
      .then(() => this.feedManager.initialize())
      .then(() => this.collectionManager.initialize())
      .then(() => this.muc.initialize())
      .then(() => this.chat.initialize())
      .then(() => options.httpUploadServer === false ? undefined : this.uploads.ensureUploadServer())
      .then(() => this.uploads.ensureUploadAnnouncementSubscription())
      .then(() => this.loadOmemoState())
      .then(() => this.openPgpStateManager.load())
      .then(() => this.resolveReady())
      .catch(err => this.rejectReady(err))

    this.dhtMailboxPeerListener = () => this.flushDhtMailboxWhenActive()
    this.libp2p.addEventListener('peer:connect', this.dhtMailboxPeerListener)
    void this.ready.then(() => this.flushDhtMailboxWhenActive()).catch(() => {})

    this.discoveredPeerListener = (event: Event) => {
      this.handleDiscoveredPeer((event as CustomEvent<any>).detail)
    }
    this.disconnectedPeerListener = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      const peerId = detail?.toString?.() ?? detail?.id?.toString?.()
      if (!peerId || peerId === this.libp2p.peerId.toString()) return
      void this.ready
        .then(() => this.feedManager.stopPreviewingDiscoveredFeed(peerId))
        .catch(error => console.warn(`[XMPP] Could not stop nearby peer feed preview ${peerId}:`, error))
    }
    this.libp2p.addEventListener('peer:discovery', this.discoveredPeerListener)
    this.libp2p.addEventListener('peer:disconnect', this.disconnectedPeerListener)

    // Register protocol handler for inbound connections.
    // libp2p StreamHandler signature: (stream: Stream, connection: Connection)
    // The old code tried 'stream.connection' (always undefined) before falling
    // back to the 'connection' second argument, which was also shadowed incorrectly.
    this.libp2p.handle('/xmpp/1.0.0', (stream: any, connection: any) => {
      const peerId = connection?.remotePeer?.toString() || 'unknown'
      console.log(`[DEBUG] Inbound connection handler triggered from peer: ${peerId}`)
      const xmppStream = new XmppStream(stream, peerId)
      this.registerStream(peerId, xmppStream)
      this.emit('stream', { peerId, direction: 'inbound', stream: xmppStream })
    })
    this.libp2p.handle('/xmpp/upload/1.0.0', (stream: any) => {
      void this.uploads.handlePeerUploadRequest(stream)
    })

    // Register Gossipsub PubSub listener if available
    const pubsub = (this.libp2p.services as any).pubsub
    if (pubsub) {
      pubsub.addEventListener('message', (evt: any) => {
        const topic = evt.detail.topic
        const data = evt.detail.data
        const xmlStr = new TextDecoder().decode(data)
        if (topic.startsWith('xmpp/muc/')) {
          const fromPeerId = evt.detail.from?.toString() || 'unknown'
          void this.ready.then(() => this.muc.handleIncomingPayload(topic, fromPeerId, xmlStr)).catch(() => {})
        } else if (topic === UPLOAD_ANNOUNCEMENTS_TOPIC) {
          void this.handlePubSubPayload(topic, xmlStr).catch(() => {})
        } else {
          void this.handlePubSubPayload(topic, xmlStr).catch(() => {})
        }
      })
    }
  }

  private getPersistenceLoadContext() {
    return {
      storage: this.storage,
      roster: this.roster,
      feedHistory: this.feedManager?.feedHistory ?? new Map(),
      feedSubscriptions: this.feedManager?.feedSubscriptions ?? new Map(),
      followers: this.feedManager?.followers ?? new Map(),
      collections: this.collectionManager?.collections ?? new Map(),
      collectionHistory: this.collectionManager?.collectionHistory ?? new Map(),
      attachmentHistory: this.collectionManager?.attachmentHistory ?? new Map(),
      mucRooms: this.muc.mucRooms,
      mucHistory: this.muc.mucHistory,
      chatHistory: this.chatHistory,
      vCard: this.selfVCard,
      normalizeRosterEntry: normalizeRosterEntry,
      normalizeFeedPost: normalizeFeedPost,
      normalizeFeedSubscription: normalizeFeedSubscription,
      normalizeFollower: normalizeFollower,
      normalizeCollection: this.normalizeCollection.bind(this),
      normalizeCollectionPost: this.normalizeCollectionPost.bind(this),
      normalizeAttachment: this.normalizeAttachment.bind(this),
      normalizeMucRoomSettings: normalizeMucRoomSettings,
      normalizeMucMessage: normalizeMucMessage,
      feedHistoryKey: (topic: string, id: string) => feedHistoryKey(topic, id),
      feedSubscriptionKey: (topic: string) => feedSubscriptionKey(topic),
      followerKey: (feedPeerId: string, followerPeerId: string) => followerKey(feedPeerId, followerPeerId),
      collectionHistoryKey: this.collectionHistoryKey.bind(this),
      attachmentHistoryKey: this.attachmentHistoryKey.bind(this),
      mucHistoryKey: this.mucHistoryKey.bind(this),
      restoreFeedSubscriptions: () => this.feedManager?.restoreFeedSubscriptions(),
      restoreFollowerSubscriptions: () => this.feedManager?.restoreFollowerSubscriptions(),
      restoreCollectionSubscriptions: () => this.collectionManager?.restoreCollectionSubscriptions(),
      onCollectionLoaded: (col: any) => this.collectionManager?.indexCollectionMembers(col)
    }
  }

  private getPersistenceSaveContext() {
    return {
      storage: this.storage,
      roster: this.roster,
      feedHistory: this.feedManager?.feedHistory ?? new Map(),
      feedSubscriptions: this.feedManager?.feedSubscriptions ?? new Map(),
      followers: this.feedManager?.followers ?? new Map(),
      collections: this.collectionManager?.collections ?? new Map(),
      collectionHistory: this.collectionManager?.collectionHistory ?? new Map(),
      attachmentHistory: this.collectionManager?.attachmentHistory ?? new Map(),
      mucRooms: this.muc.mucRooms,
      mucHistory: this.muc.mucHistory,
      chatHistory: this.chatHistory,
      vCard: this.selfVCard,
      openPgpState: this.openPgpStateManager.getState()
    }
  }

  private async loadRoster(): Promise<void> {
    await loadRosterState(this.getPersistenceLoadContext())
  }



  private async loadCollectionState(): Promise<void> {
    await loadCollectionState(this.getPersistenceLoadContext(), COLLECTION_HISTORY_LIMIT)
  }

  private async loadAttachmentHistory(): Promise<void> {
    await loadAttachmentHistoryState(this.getPersistenceLoadContext(), ATTACHMENT_HISTORY_LIMIT)
  }

  public async recordChatMessage(msg: XmppMessage): Promise<void> {
    await this.chat.recordChatMessage(msg)
  }

  private getDhtContext(): import('./xmpp-dht.js').XmppDhtContext {
    return {
      libp2p: this.libp2p,
      mucRooms: this.muc.mucRooms,
      ensureMucRoomSettings: (roomName) => this.muc.ensureMucRoomSettings(roomName),
      handleStanza: this.handleStanza.bind(this),
      emit: this.emit.bind(this)
    }
  }

  private async loadVCard(): Promise<void> {
    await loadVCardState(this.getPersistenceLoadContext())
    if (this.selfVCard.nickname && !this.selfPresence.nickname) {
      this.selfPresence.nickname = this.selfVCard.nickname
    }
  }

  private getPubSubContext(): XmppPubSubContext {
    return {
      localJid: this.jid,
      feedTopicForPeer: this.feedTopicForPeer.bind(this),
      getEncryptedTopicSecret: (topic: string) => this.encryptedTopicSecrets.get(topic)?.secret,
      removeFollower: (feedPeerId, followerPeerId) => this.feedManager.removeFollower(feedPeerId, followerPeerId),
      recordFollower: (follower) => this.feedManager.recordFollower(follower),
      recordAttachment: (attachment) => this.collectionManager.recordAttachment(attachment),
      recordCollectionPost: (post) => this.collectionManager.recordCollectionPost(post),
      recordFeedPost: (post) => this.feedManager.recordFeedPost(post),
      recordUploadManifest: (manifest, sourceJid) => this.uploads.recordUploadManifest(manifest, sourceJid),
      emitPubSubMessage: (message) => this.emit('pubsub:message', message),
      emitError: (error) => this.emit('error', error)
    }
  }

  private getFeedContext(): XmppFeedContext {
    return {
      jid: this.jid,
      ready: this.ready,
      libp2p: this.libp2p,
      storage: this.storage,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getStreamByJid: this.getStreamByJid.bind(this),
      getPubSubService: this.getPubSubService.bind(this),
      ensureTopicValidator: this.ensureTopicValidator.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      emit: this.emit.bind(this),
      propagateFeedToCollections: this.propagateFeedToCollections.bind(this),
      requestFollowersFromPeer: this.requestFollowersFromPeer.bind(this)
    }
  }

  private getCollectionContext(): XmppCollectionContext {
    return {
      jid: this.jid,
      ready: this.ready,
      storage: this.storage,
      libp2p: this.libp2p,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getPubSubService: this.getPubSubService.bind(this),
      ensureTopicValidator: this.ensureTopicValidator.bind(this),
      emit: this.emit.bind(this)
    }
  }

  private getSecureContext(): XmppSecureContext {
    return {
      jid: this.jid,
      ready: this.ready,
      loadOmemoModule: this.omemoModuleLoader,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      emitMessage: (message) => {
        void this.recordChatMessage(message).catch(err => this.emit('error', err))
        this.emit('message', message)
      },
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
      },
      sendOrBufferStanza: this.sendOrBufferStanza.bind(this)
    }
  }

  private getMucContext(): XmppMucContext {
    return {
      jid: this.jid,
      loadOmemoModule: this.omemoModuleLoader,
      libp2p: this.libp2p,
      storage: this.storage,
      ready: this.ready,
      getPubSubService: this.getPubSubService.bind(this),
      getOrCreateStream: this.getOrCreateStream.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      sendIqResult: this.sendIqResult.bind(this),
      sendIqError: this.sendIqError.bind(this),
      emit: this.emit.bind(this),
      handleStanza: this.handleStanza.bind(this),
      getSelfNick: () => this.selfPresence.nickname ?? this.jid.replace('@p2p', ''),
      getPeerOmemoDevices: (jid) => this.getPeerOmemoDevices(jid),
      getOmemoStore: () => this.getOmemoStore(),
      getSecureContext: () => this.getSecureContext(),
      getOmemoDeviceIdOrThrow: () => this.getOmemoDeviceIdOrThrow()
    }
  }

  private getOmemoContext(): XmppOmemoContext {
    return {
      ready: this.ready,
      jid: this.jid,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      jidFromPeerId: this.jidFromPeerId.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      peerOmemoDeviceLists: this.peerOmemoDeviceLists,
      peerOmemoBundles: this.peerOmemoBundles
    }
  }

  private getDiscoveryContext(): XmppDiscoveryContext {
    return {
      ready: this.ready,
      jid: this.jid,
      discoveryNode: this.discoveryNode,
      discoveryIdentity: this.discoveryIdentity,
      httpUploadAvailable: this.httpUploadAvailable,
      libp2p: this.libp2p,
      getCollections: () => this.collectionManager.collections,
      getCollectionSubscriptions: () => this.collectionManager.collectionSubscriptions,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      emit: this.emit.bind(this)
    }
  }

  private getRouterContext(): XmppRouterContext {
    return {
      jid: this.jid,
      pendingIq: this.pendingIq,
      streams: this.streams,
      getOrCreateStream: this.getOrCreateStream.bind(this),
      jidFromPeerId: this.jidFromPeerId.bind(this),
      buildOmemoDevicesQuery: this.buildOmemoDevicesQuery.bind(this),
      buildOmemoBundleQuery: this.buildOmemoBundleQuery.bind(this),
      buildRosterQuery: () => this.rosterManager.buildRosterQuery(),
      buildFollowersQuery: this.buildFollowersQuery.bind(this),
      getFeedHistoryForPeer: (peerId) => this.feedManager.getFeedPostsForPeer(peerId),
      buildVCardQuery: () => this.rosterManager.buildVCardQuery(),
      updateVCard: (profile) => this.rosterManager.updateVCard(profile),
      discoveryIdentity: this.discoveryIdentity,
      discoveryNode: this.discoveryNode,
      httpUploadAvailable: this.httpUploadAvailable,
      collections: this.collectionManager.collections,
      collectionSubscriptions: this.collectionManager.collectionSubscriptions,
      openPgpState: this.openPgpStateManager.getState(),
      openPgpFingerprint: this.openPgpStateManager.getFingerprint(),
      deleteRosterEntry: (jid) => this.rosterManager.deleteRosterEntry(jid),
      upsertRosterEntry: (entry) => this.rosterManager.upsertRosterEntry(entry),
      handleSubscribe: (peerId, fromJid) => this.rosterManager.handleSubscribe(peerId, fromJid),
      handleSubscribed: (fromJid) => this.rosterManager.handleSubscribed(fromJid),
      handleUnsubscribe: (peerId, fromJid) => this.rosterManager.handleUnsubscribe(peerId, fromJid),
      handleUnsubscribed: (fromJid) => this.rosterManager.handleUnsubscribed(fromJid),
      sendCurrentPresenceToPeer: (peerId) => this.rosterManager.sendCurrentPresenceToPeer(peerId),
      recordPresence: (peerJid, presence) => this.rosterManager.recordPresence(peerJid, presence),
      setPeerClientState: this.setPeerClientState.bind(this),
      createUploadSlot: (slotId, filename, contentType, size) => this.uploads.createUploadSlot(slotId, filename, contentType, size),
      discoInfoCache: this.discoveryManager.discoInfoCache,
      ensurePeerCapabilities: (peerId, node, ver, hash) => this.discoveryManager.ensurePeerCapabilities(peerId, node, ver, hash),
      entityCapabilities: this.discoveryManager.entityCapabilities,
      getPubSubContext: this.getPubSubContext.bind(this),
      getSecureContext: this.getSecureContext.bind(this),
      emit: this.emit.bind(this),
      handleIncomingMamQuery: this.handleIncomingMamQuery.bind(this),
      handleIncomingMamResult: this.handleIncomingMamResult.bind(this),
      muc: this.muc
    }
  }


  private async loadOmemoState(): Promise<void> {
    await this.omemoStateManager.load()
  }

  public getOmemoStore(): {
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
    return this.openPgpStateManager.getPublicKeyOrThrow()
  }



  private async persistCollectionState(): Promise<void> {
    await persistCollectionState(this.getPersistenceSaveContext())
  }

  private async persistAttachmentHistory(): Promise<void> {
    await persistAttachmentHistoryState(this.getPersistenceSaveContext())
  }







  private parsePeerReference(peerAddr: string | Multiaddr): { peerId: string; dialTarget?: Multiaddr } {
    return parsePeerReference(peerAddr)
  }

  getLocalPeerAddresses(): string[] {
    const peerId = this.libp2p.peerId.toString()
    const candidates = this.libp2p.getMultiaddrs().flatMap((address) => {
      const value = address.toString()
      const host = address.getComponents().find(({ name }) => name === 'ip4' || name === 'ip6')?.value?.toLowerCase()
      // Wildcard and loopback binds are local implementation details, never
      // useful peer addresses. In particular, do not show 127.0.0.1 as a
      // shareable address in the desktop profile.
      if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:0' || host === '0:0:0:0:0:0:0:1'
        || host === '0.0.0.0' || host?.startsWith('0.') || host?.startsWith('127.')) return []
      if (address.getComponents().some(({ name, value }) => name.startsWith('dns') && typeof value === 'string'
        && (value === 'localhost' || value.endsWith('.localhost')))) return []
      // A relay on a private address is no more internet-routable than a
      // private interface address, so do not present either as public.
      if (isPrivate(address)) return []
      if (value.includes('/p2p-circuit')) {
        const relayAddress = value.split('/p2p-circuit')[0]
        return [{ value: `${relayAddress}/p2p-circuit/webrtc/p2p/${peerId}`, relay: true }]
      }
      return [{
        value: value.includes(`/p2p/${peerId}`) ? value : `${value}/p2p/${peerId}`,
        relay: false,
      }]
    })
    candidates.sort((a, b) => Number(b.relay) - Number(a.relay))
    return [...new Set(candidates.map(({ value }) => value))]
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

  private mucHistoryKey(room: string, id: string): string {
    return `${room}:${id}`
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
    return await this.discoveryManager.queryDiscoInfo(peerAddr, node)
  }

  private async queryDiscoItems(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoItem[]> {
    return await this.discoveryManager.queryDiscoItems(peerAddr, node)
  }

  private async ensurePeerCapabilities(peerId: string, node: string, ver: string, hash?: string) {
    await this.discoveryManager.ensurePeerCapabilities(peerId, node, ver, hash)
  }



  public async joinMucRoom(roomName: string, nick: string): Promise<void> {
    const topic = this.muc.getRoomTopic(roomName)
    const pubsub = (this.libp2p.services as any).pubsub
    if (pubsub && pubsub.topicValidators) {
      if (!pubsub.topicValidators.has(topic)) {
        pubsub.topicValidators.set(topic, (_peer: any, message: any) => {
          try {
            const xmlStr = new TextDecoder().decode(message.data)
            const p = new Parser()
            let valid = false
            p.write('<stream:stream>')
            p.on('element', (element: Element) => {
              if (element.name === 'presence' || (element.name === 'message' && element.attrs.type === 'groupchat')) {
                valid = true
              }
            })
            p.write(xmlStr)
            return valid ? TopicValidatorResult.Accept : TopicValidatorResult.Reject
          } catch {
            return TopicValidatorResult.Reject
          }
        })
      }
    }

    await this.muc.joinRoom(roomName, nick)
  }

  public async createPrivateMucRoom(
    roomName: string,
    options: {
      topic?: string
      nick?: string
      communityId?: string
      autoJoin?: boolean
      archived?: boolean
      defaultMode?: 'secure' | 'open'
    } = {}
  ): Promise<{ roomName: string; roomJid: string }> {
    await this.ready

    const nick = options.nick ?? this.selfPresence.nickname ?? this.jid.replace('@p2p', '')
    await this.updateMucRoomSettings(roomName, {
      topic: options.topic,
      defaultMode: options.defaultMode ?? 'secure',
      autoJoin: options.autoJoin ?? true,
      communityId: options.communityId,
      archived: options.archived
    })
    await this.joinMucRoom(roomName, nick)

    return {
      roomName,
      roomJid: `${roomName}@muc.p2p`
    }
  }

  public async updateMucRoomSettings(roomName: string, settings: { topic?: string; defaultMode?: 'secure' | 'open'; autoJoin?: boolean; communityId?: string; archived?: boolean }): Promise<void> {
    await this.muc.updateMucRoomSettings(roomName, settings)
  }

  public async ensureMucRoomSettings(roomName: string): Promise<import('./xmpp-muc.js').MucRoomSettings | undefined> {
    return await this.muc.ensureMucRoomSettings(roomName)
  }

  public getMucRoomSettings(roomName: string): import('./xmpp-muc.js').MucRoomSettings | undefined {
    return this.muc.getMucRoomSettings(roomName)
  }

  public setMucRoomSettings(roomName: string, settings: import('./xmpp-muc.js').MucRoomSettings): void {
    this.muc.setMucRoomSettings(roomName, settings)
  }

  public getPubSubService() {
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
            const titleEl = entryEl?.getChild('title')
            if (entryEl && entryEl.attrs.xmlns === ATOM_XMLNS && (contentEl || titleEl)) {
              valid = true
              return
            }
          }

          if (allowedKinds.has('collection')) {
            const entryEl = itemEl.getChild('entry')
            if (entryEl && entryEl.attrs.xmlns === ATOM_XMLNS && itemEl.attrs.collectionId && itemEl.attrs.sourceTopic) {
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









  public async recordMucMessage(msg: XmppMucMessage): Promise<boolean> {
    return await this.muc.recordMucMessage(msg)
  }

  public getMucHistory(room: string): XmppMucMessage[] {
    return this.muc.getMucHistory(room)
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
    const collectionIds = this.collectionManager.collectionFeedIndex.get(feedPost.topic)
    if (!collectionIds || collectionIds.size === 0) {
      return
    }

    for (const collectionId of collectionIds) {
      await this.collectionManager.publishCollectionPost(collectionId, feedPost)
    }
  }



  private getStreamByJid(jid: string): XmppStream | undefined {
    return this.streams.get(this.peerIdFromJid(jid))
  }

  public async sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs = 10000): Promise<Element> {
    return await sendIqRequestFromModule(this.getRouterContext(), target, stanza, timeoutMs)
  }

  public async sendIqResult(peerId: string, id: string, payload?: Element) {
    await sendIqResultFromModule(this.getRouterContext(), peerId, id, payload)
  }

  public async sendIqError(peerId: string, element: Element, condition: string, type: 'cancel' | 'modify' | 'auth' | 'wait' = 'cancel', text?: string) {
    await sendIqErrorFromModule(this.getRouterContext(), peerId, element, condition, type, text)
  }

  public async requestUploadSlot(
    target: string | Multiaddr,
    options: { filename: string; size: number; contentType?: string }
  ): Promise<{ putUrl: string; getUrl: string; slot: Element }> {
    const parsed = this.parsePeerReference(target)
    const peerId = parsed.peerId || ''
    const to = peerId ? this.jidFromPeerId(peerId) : target.toString()
    const id = Math.random().toString(36).substring(2, 15)
    const stanza = xml(
      'iq',
      { to, from: this.jid, type: 'get', id },
      xml('request', {
        xmlns: HTTP_UPLOAD_XMLNS,
        filename: options.filename,
        size: String(options.size),
        'content-type': options.contentType ?? 'application/octet-stream'
      })
    )

    const response = await this.sendIqRequest(target, stanza)
    const slot = response.getChild('slot')
    if (!slot) {
      throw new Error('Upload service did not return a slot')
    }

    const put = slot.getChild('put')
    const get = slot.getChild('get')
    const putUrl = put?.attrs.url
    const getUrl = get?.attrs.url
    if (!putUrl || !getUrl) {
      throw new Error('Upload service returned an incomplete slot')
    }

    return { putUrl, getUrl, slot }
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
      ...this.feedManager.getFollowersForPeer(feedPeerId)
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



  private setPeerClientState(peerId: string, state: 'active' | 'inactive') {
    this.reliabilityManager.setPeerClientState(peerId, state)
    this.emit('peer:csi', { peerId, state })
  }


  public getUploadContentUrl(cid: string): string | undefined {
    return this.uploads.getUploadContentUrl(cid)
  }

  public async fetchUploadFromPeer(peerId: string, cid: string): Promise<Uint8Array | undefined> {
    if (!peerId || !cid) return undefined
    const stream = await this.libp2p.dialProtocol(peerIdFromString(peerId), ['/xmpp/upload/1.0.0'])
    const request = new TextEncoder().encode(`${JSON.stringify({ cid })}\n`)
    if (!stream.send(request)) await stream.onDrain()
    await stream.close()

    const chunks: Uint8Array[] = []
    let headerBuffer = new Uint8Array()
    let expectedSize: number | undefined
    let receivedSize = 0
    let responseValid = false
    for await (const item of stream) {
      const chunk = item instanceof Uint8Array ? item : item.subarray()
      if (!responseValid) {
        const combined = new Uint8Array(headerBuffer.length + chunk.length)
        combined.set(headerBuffer)
        combined.set(chunk, headerBuffer.length)
        const newline = combined.indexOf(10)
        if (newline === -1) {
          if (combined.length > 2048) break
          headerBuffer = combined
          continue
        }
        let header: { ok?: boolean; cid?: string; size?: number }
        try { header = JSON.parse(new TextDecoder().decode(combined.subarray(0, newline))) as typeof header } catch { break }
        if (!header.ok || header.cid !== cid || !Number.isSafeInteger(header.size) || (header.size as number) < 0 || (header.size as number) > MAX_PEER_UPLOAD_BYTES) break
        expectedSize = header.size
        responseValid = true
        const payload = combined.subarray(newline + 1)
        if (payload.length) {
          chunks.push(payload)
          receivedSize += payload.length
        }
        headerBuffer = new Uint8Array()
        continue
      }
      receivedSize += chunk.length
      if (receivedSize > (expectedSize ?? 0)) break
      chunks.push(chunk)
    }

    await stream.close().catch(() => {})
    if (!responseValid || expectedSize === undefined || receivedSize !== expectedSize) return undefined
    const output = new Uint8Array(receivedSize)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.length
    }
    return output
  }

  public async storeFile(
    data: Uint8Array,
    filename: string,
    contentType: string
  ): Promise<{ cid: string; url: string }> {
    if (!this.httpUploadAvailable && data.byteLength > MAX_PEER_UPLOAD_BYTES) {
      throw new Error('Browser peer uploads are limited to 50 MiB per file.')
    }
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const cid = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

    await this.storage.putBlob('uploads', cid, data)
    await this.storage.putRecord(
      'uploads_meta',
      cid,
      JSON.stringify({
        cid,
        filename,
        contentType,
        size: data.length,
        uploadedAt: new Date().toISOString()
      }),
      new Date().toISOString()
    )

    const manifest: XmppUploadManifest = {
      cid,
      slotId: cid,
      filename,
      contentType,
      size: data.length,
      getUrl: `upload://${cid}`,
      providers: [],
      uploadedAt: new Date().toISOString(),
      from: this.jid,
      topic: UPLOAD_ANNOUNCEMENTS_TOPIC
    }
    this.uploads['uploadManifests'].set(cid, manifest)
    await this.uploads.announceUploadManifest(manifest)

    return { cid, url: `upload://${cid}` }
  }



  private async handleStanza(peerId: string, element: Element) {
    await handleStanzaFromModule(this.getRouterContext(), peerId, element)
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

    let dialTarget = parsed.dialTarget ?? this.peerAddrs.get(peerIdStr)
    if (!dialTarget) {
      const peerInfo = await this.libp2p.peerRouting.findPeer(peerIdFromString(peerIdStr))
      dialTarget = peerInfo.multiaddrs[0]
      if (!dialTarget) {
        throw new Error(`Peer routing found no dialable addresses for ${peerIdStr}`)
      }
    }
    const stream = await this.libp2p.dialProtocol(
      dialTarget,
      ['/xmpp/1.0.0']
    )
    this.peerAddrs.set(peerIdStr, dialTarget)
    const xmppStream = new XmppStream(stream, peerIdStr)
    this.registerStream(peerIdStr, xmppStream)
    this.emit('stream', { peerId: peerIdStr, direction: 'outbound', stream: xmppStream })
    return xmppStream
  }

  private scheduleReconnect(peerId: string) {
    const existingTimer = this.reconnectTimers.get(peerId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const attempts = this.reconnectAttempts.get(peerId) ?? 0
    this.reconnectAttempts.set(peerId, attempts + 1)
    const delay = Math.min(this.minReconnectDelay * Math.pow(2, attempts), this.maxReconnectDelay)

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(peerId)
      const addr = this.peerAddrs.get(peerId)
      if (!addr) {
        this.reconnectAttempts.delete(peerId)
        return
      }
      try {
        const parsed = this.parsePeerReference(addr)
        const dialTarget = parsed.dialTarget
        if (!dialTarget) {
          console.warn(`[RECONNECT] No dial target for ${peerId}, skipping reconnection`)
          this.reconnectAttempts.delete(peerId)
          return
        }
        console.log(`[RECONNECT] Attempting reconnection to ${peerId} (attempt ${attempts + 1}, delay ${delay}ms)`)
        const stream = await this.libp2p.dialProtocol(dialTarget, ['/xmpp/1.0.0'])
        const xmppStream = new XmppStream(stream, peerId)
        this.registerStream(peerId, xmppStream)
        this.reconnectAttempts.delete(peerId)
        this.emit('stream', { peerId, direction: 'reconnect', stream: xmppStream })
        console.log(`[RECONNECT] Reconnection to ${peerId} succeeded`)
      } catch (err) {
        console.warn(`[RECONNECT] Reconnection to ${peerId} failed:`, err)
        this.scheduleReconnect(peerId)
      }
    }, delay)

    this.reconnectTimers.set(peerId, timer)
  }

  private cancelReconnect(peerId: string) {
    const timer = this.reconnectTimers.get(peerId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(peerId)
    }
    this.reconnectAttempts.delete(peerId)
  }

  private registerStream(peerId: string, xmppStream: XmppStream) {
    const existing = this.streams.get(peerId)
    if (existing) {
      this.cancelReconnect(peerId)
      void existing.close().catch(() => {})
    }

    this.streams.set(peerId, xmppStream)

    xmppStream.on('element', (element: Element) => {
      void this.handleStanza(peerId, element).catch(err => this.emit('error', err))
    })

    xmppStream.on('error', (err) => {
      this.emit('error', err)
    })

    xmppStream.on('close', () => {
      if (xmppStream.smEnabled && xmppStream.smResumable) {
        this.reliabilityManager.saveSession(peerId, {
          sessionId: xmppStream.sessionId,
          outboundStanzaCount: xmppStream.outboundStanzaCount,
          inboundStanzaCount: xmppStream.inboundStanzaCount,
          unackedQueue: xmppStream.unackedQueue
        })
      }
      if (this.streams.get(peerId) === xmppStream) {
        this.streams.delete(peerId)
      }
      this.emit('stream-closed', peerId)
      // Bug fix: only schedule reconnect for peers we originally dialled (outbound).
      // For inbound-only connections, peerAddrs has no entry and reconnect is a no-op
      // that still schedules and immediately cleans up a timer — wasted work.
      if (this.peerAddrs.has(peerId)) {
        this.scheduleReconnect(peerId)
      }
    })

    // XEP-0198 negotiation or resumption.
    // Bug fix: SM <enable>/<resume> must only be sent by the stream initiator (the dialler).
    // For inbound connections the remote peer is the initiator; they may send <enable> to us
    // and we'll respond in XmppStream.handleSmElement. Sending <enable> unsolicited to an
    // inbound peer that hasn't advertised SM support risks a protocol error.
    const isOutbound = this.peerAddrs.has(peerId)
    if (isOutbound) {
      const savedSession = this.reliabilityManager.getAndClearSession(peerId)
      if (savedSession) {
        xmppStream.sessionId = savedSession.sessionId
        xmppStream.outboundStanzaCount = savedSession.outboundStanzaCount
        xmppStream.inboundStanzaCount = savedSession.inboundStanzaCount
        xmppStream.unackedQueue = savedSession.unackedQueue

        xmppStream.send(xml('resume', {
          xmlns: 'urn:xmpp:sm:3',
          previd: savedSession.sessionId,
          h: String(savedSession.inboundStanzaCount)
        }))
      } else {
        xmppStream.send(xml('enable', { xmlns: 'urn:xmpp:sm:3', resume: 'true' }))
      }
    }

    void this.rosterManager.flushRosterPresenceForPeer(peerId).catch(err => this.emit('error', err))
    void this.rosterManager.sendCurrentPresenceToPeer(peerId).catch(err => this.emit('error', err))
    setTimeout(() => {
      void this.feedManager.announcePublicSubscriptionsForPeer(peerId).catch(err => this.emit('error', err))
    }, 250)
  }

  async getRosterEntries(): Promise<XmppRosterEntry[]> {
    await this.ready
    // The connection lifecycle syncs the server roster into this local cache.
    // Keep UI roster reads immediate instead of issuing a potentially slow IQ
    // request every time the contacts view mounts or refreshes.
    return this.rosterManager.getRosterEntries()
  }

  async getRosterEntry(jid: string): Promise<XmppRosterEntry | undefined> {
    await this.ready
    return this.rosterManager.getRosterEntry(jid)
  }

  async addRosterEntry(jid: string, name?: string): Promise<XmppRosterEntry> {
    if (!jid.toLowerCase().endsWith('@p2p') && this.clientBridge.isConnected) {
      await this.clientBridge.addRosterEntry(jid, name)
    }
    return await this.rosterManager.addRosterEntry(jid, name)
  }

  async removeRosterEntry(jid: string): Promise<void> {
    const bareJid = jid.split('/')[0]
    if (!bareJid.toLowerCase().endsWith('@p2p')) {
      if (!this.clientBridge.isConnected) throw new Error('Connect to your XMPP server before removing this contact.')
      await this.clientBridge.removeRosterEntry(bareJid)
    }
    await this.rosterManager.removeRosterEntry(bareJid)
  }

  async approveServerPresenceSubscription(jid: string): Promise<void> {
    if (!this.clientBridge.isConnected) throw new Error('Connect your XMPP account before approving contact requests.')
    await this.clientBridge.approvePresenceSubscription(jid)
  }

  async denyServerPresenceSubscription(jid: string): Promise<void> {
    if (!this.clientBridge.isConnected) throw new Error('Connect your XMPP account before declining contact requests.')
    await this.clientBridge.denyPresenceSubscription(jid)
  }

  async fetchRoster(peerAddr: string | Multiaddr): Promise<XmppRosterEntry[]> {
    await this.ready
    return await this.rosterManager.requestRosterFromPeer(peerAddr)
  }

  async subscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    await this.rosterManager.subscribePresence(peerAddr)
  }

  async unsubscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    await this.rosterManager.unsubscribePresence(peerAddr)
  }

  async broadcastPresence(type?: string, status?: string, show?: string, nickname?: string) {
    await this.rosterManager.broadcastPresence(type, status, show, nickname)
  }

  async setNickname(nickname: string): Promise<void> {
    const next = nickname.trim()
    if (!next) {
      throw new Error('Nickname is required')
    }

    await this.rosterManager.updateVCard({ nickname: next })
  }

  async setVCard(profile: XmppVCardProfile): Promise<XmppVCardProfile> {
    return await this.rosterManager.updateVCard(profile)
  }

  async getVCard(): Promise<XmppVCardProfile> {
    await this.ready
    return {
      fn: this.selfVCard.fn,
      nickname: this.selfPresence.nickname ?? this.selfVCard.nickname,
      desc: this.selfVCard.desc,
      ...(this.selfVCard.photo ? { photo: this.selfVCard.photo } : {})
    }
  }

  // Send a chat message to a peer
  async sendMessage(
    peerAddr: string | Multiaddr,
    body: string,
    options: {
      originId?: string
      replace?: string
      reply?: { id: string; to?: string }
      thread?: string
      requestReceipt?: boolean
      chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
      attachments?: Array<{ url: string; desc: string }>
      delay?: { stamp: string; from?: string }
      noCarbons?: boolean
    } = {}
  ): Promise<string> {
    const addrStr = peerAddr.toString()
    if (!addrStr) {
      throw new Error('Cannot send message: peer address is empty')
    }

    // Route standard XMPP JIDs through the connected home server. The home server
    // may federate the stanza to another XMPP domain, so the target domain does
    // not need to match the domain of the local client connection.
    if (!addrStr.split('/')[0].toLowerCase().endsWith('@p2p') && addrStr.includes('@')) {
      if (this.clientBridge.isConnected) {
        return this.clientBridge.sendMessage(addrStr, body, {
          type: 'chat',
          ...(options.originId !== undefined ? { originId: options.originId } : {}),
          ...(options.thread ? { thread: options.thread } : {}),
          ...(options.replace ? { replace: options.replace } : {}),
          ...(options.reply ? { reply: options.reply } : {}),
          ...(options.requestReceipt !== undefined ? { requestReceipt: options.requestReceipt } : {}),
          ...(options.chatState ? { chatState: options.chatState } : {}),
          ...(options.attachments ? { attachments: options.attachments } : {}),
        })
      }
      if (!this.clientBridge.isConnected) {
        throw new Error(`Server bridge is not connected — cannot send to ${addrStr}`)
      }
    }

    const peerId = this.parsePeerReference(peerAddr).peerId
    const toJid = this.jidFromPeerId(peerId)
    const id = options.originId || Math.random().toString(36).substring(2, 15)

    const children: Element[] = []
    if (body) {
      children.push(xml('body', {}, body))
    }

    children.push(...buildXepElements({
      ...options,
      nick: this.selfPresence.nickname,
      delay: options.delay ? {
        stamp: options.delay.stamp,
        from: options.delay.from ?? this.jid
      } : undefined,
      thread: options.thread,
      originId: id,
      stanzaId: { id, by: this.jid },
      private: options.noCarbons
    }))

    const msg = xml(
      'message',
      {
        to: toJid,
        from: this.jid,
        type: 'chat',
        id
      },
      ...children
    )

    await this.sendOrBufferStanza(peerId, msg, peerAddr)
    void this.recordChatMessage({
      from: this.jid,
      to: toJid,
      body,
      id,
      type: 'chat',
      delay: { stamp: new Date().toISOString() },
      private: options.noCarbons
    }).catch(err => this.emit('error', err))
    return id
  }

  // Enable XEP-0280 Message Carbons
  async enableCarbons(target?: string | Multiaddr): Promise<string> {
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = target ? this.jidFromPeerId(this.parsePeerReference(target).peerId) : this.jid
    const iq = xml('iq', { type: 'set', id, to: toJid, from: this.jid },
      xml('enable', { xmlns: 'urn:xmpp:carbons:2' })
    )
    await this.sendIqRequest(toJid, iq)
    return id
  }

  // Disable XEP-0280 Message Carbons
  async disableCarbons(target?: string | Multiaddr): Promise<string> {
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = target ? this.jidFromPeerId(this.parsePeerReference(target).peerId) : this.jid
    const iq = xml('iq', { type: 'set', id, to: toJid, from: this.jid },
      xml('disable', { xmlns: 'urn:xmpp:carbons:2' })
    )
    await this.sendIqRequest(toJid, iq)
    return id
  }

  // Handle incoming MAM query (XEP-0313) for 1-to-1 chats
  // Handle incoming MAM query (XEP-0313) for 1-to-1 chats
  async handleIncomingMamQuery(element: Element, peerId: string): Promise<void> {
    await this.chat.handleIncomingMamQuery(element, peerId)
  }

  // Handle incoming MAM result (XEP-0313) for 1-to-1 chats
  async handleIncomingMamResult(element: Element, peerId: string): Promise<void> {
    await this.chat.handleIncomingMamResult(element, peerId)
  }

  // Query 1-to-1 MAM message history from a peer
  async queryChatHistory(targetPeerJid: string, withJid?: string, queryId?: string): Promise<string> {
    return this.chat.queryChatHistory(targetPeerJid, withJid, queryId)
  }

  async queryServerChatHistory(withJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    return this.clientBridge.queryMamHistory(withJid, before)
  }

  async queryServerMucHistory(roomJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    return this.clientBridge.queryMucMamHistory(roomJid, before)
  }

  async discoverServerMucRooms(): Promise<ServerMucRoomInfo[]> {
    return this.clientBridge.discoverMucRooms()
  }

  private getServerMicroblogContactJid(jid: string): string {
    if (!this.clientBridge.isConnected) throw new Error('Connect your XMPP account before managing microblogs.')
    const bareJid = jid.trim().split('/')[0].toLowerCase()
    if (!bareJid.includes('@') || bareJid.endsWith('@p2p')) {
      throw new Error('Choose a valid XMPP account JID.')
    }
    if (bareJid === this.clientBridge.accountJid?.toLowerCase().split('/')[0]) {
      throw new Error('Choose another account to follow its microblog.')
    }
    // Following a public microblog is independent of the XMPP presence roster.
    return bareJid
  }

  private serverMicroblogSubscriptionKey(jid: string): string {
    const accountJid = this.clientBridge.accountJid?.toLowerCase().split('/')[0]
    if (!accountJid) throw new Error('Your XMPP account JID is unavailable.')
    return `${encodeURIComponent(accountJid)}::${encodeURIComponent(jid.toLowerCase())}`
  }

  async subscribeServerMicroblog(jid: string): Promise<ServerPubsubSubscriptionStatus> {
    const contactJid = this.getServerMicroblogContactJid(jid)
    const status = await this.clientBridge.pubsubSubscribe(contactJid, 'urn:xmpp:microblog:0')
    if (status !== 'unconfigured') {
      const updatedAt = new Date().toISOString()
      try {
        await this.storage.putRecord('server_microblog_subscriptions', this.serverMicroblogSubscriptionKey(contactJid), JSON.stringify({
          accountJid: this.clientBridge.accountJid?.toLowerCase().split('/')[0],
          jid: contactJid,
          node: 'urn:xmpp:microblog:0',
          status,
          updatedAt,
        }), updatedAt)
      } catch (error) {
        try { await this.clientBridge.pubsubUnsubscribe(contactJid, 'urn:xmpp:microblog:0') } catch { /* server may not support rollback */ }
        throw error
      }
    }
    return status
  }

  async unsubscribeServerMicroblog(jid: string): Promise<void> {
    const contactJid = this.getServerMicroblogContactJid(jid)
    const key = this.serverMicroblogSubscriptionKey(contactJid)
    const raw = await this.storage.getRecord('server_microblog_subscriptions', key)
    let status: string | undefined
    try { status = raw ? (JSON.parse(raw) as { status?: string }).status : undefined } catch { status = undefined }
    if (status !== 'polling') await this.clientBridge.pubsubUnsubscribe(contactJid, 'urn:xmpp:microblog:0')
    await this.storage.deleteRecord('server_microblog_subscriptions', key)
  }

  async getServerMicroblogSubscriptions(): Promise<Array<{ jid: string; node: string; status: 'subscribed' | 'pending' | 'polling'; updatedAt: string }>> {
    await this.ready
    const accountJid = this.clientBridge.accountJid?.toLowerCase().split('/')[0]
    if (!accountJid) return []
    const records = await this.storage.listRecords('server_microblog_subscriptions')
    return records.flatMap(({ key, value, updatedAt }) => {
      try {
        const parsed = JSON.parse(value) as { accountJid?: unknown; jid?: unknown; node?: unknown; status?: unknown; updatedAt?: unknown }
        if (typeof parsed.accountJid !== 'string' || parsed.accountJid.toLowerCase() !== accountJid) return []
        if (typeof parsed.jid !== 'string' || !parsed.jid.includes('@')) return []
        const status = parsed.status
        if (status !== 'subscribed' && status !== 'pending' && status !== 'polling') return []
        const subscriptionStatus = status as 'subscribed' | 'pending' | 'polling'
        return [{
          jid: parsed.jid || key,
          node: typeof parsed.node === 'string' ? parsed.node : 'urn:xmpp:microblog:0',
          status: subscriptionStatus,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : updatedAt,
        }]
      } catch {
        return []
      }
    }).sort((a, b) => a.jid.localeCompare(b.jid))
  }

  async refreshServerMicroblog(jid: string): Promise<number> {
    const contactJid = this.getServerMicroblogContactJid(jid)
    const items = await this.clientBridge.pubsubGetItems(contactJid, 'urn:xmpp:microblog:0', 20)
    let imported = 0
    for (const item of items) {
      if (item.name !== 'item' || !item.attrs.id) continue
      const post = parseMicroblogEntry('urn:xmpp:microblog:0', item, contactJid, 'urn:xmpp:microblog:0')
      if (!post) continue
      // Keep every PEP author's items in a separate local feed and do not
      // automatically copy server content into the peer network.
      post.topic = `xmpp-pep:${contactJid}`
      post.id = `${contactJid}:${item.attrs.id}`
      if (await this.feedManager.recordFeedPost(post, { propagateToCollections: false, updateExisting: true })) imported += 1
    }
    return imported
  }

  async publishServerMicroblog(body: string, options: { itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string; displayContent?: string; articlePayload?: string } = {}): Promise<string> {
    if (!this.clientBridge.isConnected) {
      throw new Error('Connect your XMPP account before publishing a server microblog.')
    }
    const accountJid = this.clientBridge.accountJid?.split('/')[0]
    if (!accountJid) throw new Error('Your XMPP account JID is unavailable.')

    const itemId = options.itemId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const node = 'urn:xmpp:microblog:0'
    const topic = `xmpp-pep:${accountJid}`
    const publishedAt = new Date().toISOString()
    const title = options.title?.trim() || deriveMicroblogTitle(body)
    const post = {
      id: itemId,
      topic,
      from: accountJid,
      body,
      publishedAt,
      updatedAt: publishedAt,
      receivedAt: publishedAt,
      title,
      summary: options.summary,
      categories: options.categories,
      author: options.author ?? accountJid,
      node,
    }
    const payload = buildMicroblogEntry(post, {
      title,
      summary: options.summary,
      categories: options.categories,
      author: post.author,
      publishedAt,
      updatedAt: publishedAt,
      displayContent: options.displayContent,
      articlePayload: options.articlePayload,
      alternateHref: `xmpp:${accountJid}?;node=${encodeURIComponent(node)};item=${encodeURIComponent(itemId)}`,
    })

    // Wait for the server's PubSub acknowledgement so the composer can report
    // failures without clearing the user's text or claiming the post succeeded.
    await this.clientBridge.pubsubPublish(accountJid, node, itemId, payload)
    await this.feedManager.recordFeedPost({
      ...post,
      id: `${accountJid}:${itemId}`,
      atomId: buildTagUri(accountJid, publishedAt, itemId),
    }, { propagateToCollections: false, updateExisting: true })
    return itemId
  }

  async joinServerMuc(roomJid: string, nick: string): Promise<void> {
    if (!this.clientBridge.isConnected) throw new Error('Connect to your XMPP server before joining a room.')
    await this.clientBridge.joinMuc(roomJid, nick)
  }

  getServerJid(): string | undefined {
    return this.clientBridge.accountJid
  }

  async leaveServerMuc(roomJid: string, nick: string): Promise<void> {
    if (!this.clientBridge.isConnected) throw new Error('Connect to your XMPP server before leaving a room.')
    await this.clientBridge.leaveMuc(roomJid, nick)
  }

  async sendServerMucMessage(roomJid: string, body: string, options?: {
    originId?: string
    thread?: string
    replace?: string
    reply?: { id: string; to?: string }
  }): Promise<string> {
    if (!this.clientBridge.isConnected) throw new Error('Connect to your XMPP server before sending to a room.')
    return this.clientBridge.sendMucMessage(roomJid, body, options)
  }

  async sendServerMucChatState(roomJid: string, state: 'composing' | 'paused' | 'active'): Promise<void> {
    if (!this.clientBridge.isConnected) return
    await this.clientBridge.sendMucChatState(roomJid, state)
  }

  // Query MUC MAM message history from a peer
  async queryMucChatHistory(roomName: string, targetPeerId: string, queryId?: string): Promise<void> {
    return this.muc.queryHistory(roomName, targetPeerId, queryId)
  }

  public get clientState(): 'active' | 'inactive' {
    return this.reliabilityManager.clientState
  }

  public async setClientState(state: 'active' | 'inactive'): Promise<void> {
    this.reliabilityManager.clientState = state
    const csiEl = xml(state, { xmlns: 'urn:xmpp:csi:0' })
    for (const stream of this.streams.values()) {
      stream.send(csiEl)
    }
    if (state === 'active') {
      await flushDhtMailbox(this.getDhtContext())
    }
  }

  private flushDhtMailboxWhenActive(): void {
    if (this.reliabilityManager.clientState !== 'active') return
    void this.ready
      .then(() => flushDhtMailbox(this.getDhtContext()))
      .catch((error) => console.debug('[DHT] Mailbox flush deferred until network is available:', error))
  }

  private isPeerInactive(peerId: string): boolean {
    return this.reliabilityManager.isPeerInactive(peerId)
  }

  public async sendOrBufferStanza(peerId: string, stanza: Element, peerAddr?: string | Multiaddr): Promise<void> {
    if (this.isPeerInactive(peerId)) {
      console.log(`[DEBUG] Peer ${peerId} is inactive. Buffering stanza to DHT mailbox...`)
      await bufferStanzaToDht(this.libp2p, peerId, stanza)
      return
    }

    try {
      const dialTarget = peerAddr || `${peerId}@p2p`
      const stream = await this.getOrCreateStream(dialTarget)
      stream.send(stanza)
    } catch (directError) {
      console.warn(`[DEBUG] Failed to send stanza directly to ${peerId}. Buffering to DHT mailbox:`, directError)
      try {
        await bufferStanzaToDht(this.libp2p, peerId, stanza)
      } catch (mailboxError) {
        const directMessage = directError instanceof Error ? directError.message : String(directError)
        const mailboxMessage = mailboxError instanceof Error ? mailboxError.message : String(mailboxError)
        throw new Error(`Could not reach peer ${peerId}: ${directMessage}. Offline delivery also failed: ${mailboxMessage}`)
      }
    }
  }

  public getOmemoDeviceIdOrThrow(): number {
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
    return parseOmemoDeviceListQueryFromModule(items)
  }

  private parseOmemoBundleQuery(items: Element): XmppOmemoBundle | undefined {
    return parseOmemoBundleQueryFromModule(items)
  }

  async fetchOmemoDeviceList(peerAddr: string | Multiaddr): Promise<number[]> {
    return await fetchOmemoDeviceListFromModule(this.getOmemoContext(), peerAddr)
  }

  async fetchOmemoBundle(peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle> {
    return await fetchOmemoBundleFromModule(this.getOmemoContext(), peerAddr, deviceId)
  }

  public async getPeerOmemoDevices(peerAddr: string | Multiaddr): Promise<number[]> {
    return await getPeerOmemoDevicesFromModule(this.getOmemoContext(), peerAddr)
  }

  public async getPeerOmemoBundle(peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle> {
    return await getPeerOmemoBundleFromModule(this.getOmemoContext(), peerAddr, deviceId)
  }

  async sendEncryptedMessage(
    peerAddr: string | Multiaddr,
    body: string,
    options: {
      originId?: string
      replace?: string
      reply?: { id: string; to?: string }
      thread?: string
      requestReceipt?: boolean
      chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
      delay?: { stamp: string; from?: string }
      nick?: string
      noCarbons?: boolean
    } = {}
  ): Promise<string> {
    const id = await sendEncryptedMessageFromModule(peerAddr, body, this.getSecureContext(), {
      ...options,
      nick: options.nick ?? this.selfPresence.nickname
    })
    const peerId = this.parsePeerReference(peerAddr).peerId
    const toJid = this.jidFromPeerId(peerId)
    void this.recordChatMessage({
      from: this.jid,
      to: toJid,
      body,
      id,
      type: 'chat',
      encrypted: true,
      encryption: 'omemo',
      delay: { stamp: new Date().toISOString() },
      private: options.noCarbons
    }).catch(err => this.emit('error', err))
    return id
  }

  async ping(peerAddr: string | Multiaddr): Promise<number> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'
    const id = Math.random().toString(36).substring(2, 11)

    const iq = xml(
      'iq',
      {
        to: toJid,
        from: this.jid,
        type: 'get',
        id
      },
      xml('ping', { xmlns: 'urn:xmpp:ping' })
    )

    const startTime = Date.now()
    await this.sendIqRequest(peerAddr, iq)
    return Date.now() - startTime
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
    return bufferToBase64(this.getOmemoIdentityKeyPairOrThrow().pubKey)
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
    return this.openPgpStateManager.getPublicKeyText()
  }

  async getOpenPgpFingerprint(): Promise<string> {
    await this.ready
    return this.openPgpStateManager.getFingerprint()
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
    return this.openPgpStateManager.getPrivateKeyOrThrow()
  }

  // Send presence updates
  async sendPresence(peerAddr: string | Multiaddr, type?: string, status?: string, show?: string) {
    await this.rosterManager.sendPresence(peerAddr, type, status, show)
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
    return await this.feedManager.subscribeFeed(peerAddr, options)
  }

  async setFeedSubscriptionVisibility(peerAddr: string | Multiaddr, visibility: XmppFeedVisibility): Promise<XmppFeedSubscriptionRecord> {
    return await this.feedManager.setFeedSubscriptionVisibility(peerAddr, visibility)
  }

  async unsubscribeFeed(peerAddr: string | Multiaddr): Promise<void> {
    await this.feedManager.unsubscribeFeed(peerAddr)
  }

  async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string; replyTo?: string; links?: Array<{ rel: string; href: string; type?: string; title?: string; ref?: string }> } = {}): Promise<string> {
    return await this.feedManager.publishFeed(body, options)
  }

  async createCollection(id: string, name?: string): Promise<XmppCollectionNode> {
    return await this.collectionManager.createCollection(id, name)
  }

  async addFeedToCollection(collectionId: string, peerAddr: string | Multiaddr): Promise<XmppCollectionNode> {
    return await this.collectionManager.addFeedToCollection(collectionId, peerAddr)
  }

  async subscribeCollection(id: string): Promise<XmppCollectionSubscription> {
    return await this.collectionManager.subscribeCollection(id)
  }

  async unsubscribeCollection(id: string): Promise<void> {
    await this.collectionManager.unsubscribeCollection(id)
  }

  async publishCollection(id: string, body: string, options: { itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string } = {}): Promise<string> {
    return await this.collectionManager.publishCollection(id, body, options)
  }

  async notice(topic: string, targetId: string, value?: string): Promise<string> {
    return await this.collectionManager.publishAttachment(topic, targetId, 'noticed', value)
  }

  async react(topic: string, targetId: string, reaction: string): Promise<string> {
    return await this.collectionManager.publishAttachment(topic, targetId, 'reaction', reaction)
  }

  async getFeedPosts(): Promise<XmppFeedPost[]> {
    return await this.feedManager.getFeedPosts()
  }

  async getFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    return await this.feedManager.getFeedSubscriptions()
  }

  async getPublicFeedSubscriptions(): Promise<XmppFeedSubscriptionRecord[]> {
    return await this.feedManager.getPublicFeedSubscriptions()
  }

  async watchFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFollowerWatch> {
    return await this.feedManager.watchFeedFollowers(peerAddr)
  }

  async getFeedFollowers(peerAddr: string | Multiaddr): Promise<XmppFeedFollower[]> {
    return await this.feedManager.getFeedFollowers(peerAddr)
  }

  async getDiscoInfo(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoInfo> {
    return await this.discoveryManager.getDiscoInfo(peerAddr, node)
  }

  async getDiscoItems(peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoItem[]> {
    return await this.discoveryManager.getDiscoItems(peerAddr, node)
  }

  async getEntityCapabilities(peerAddr: string | Multiaddr): Promise<XmppEntityCapabilities | undefined> {
    return await this.discoveryManager.getEntityCapabilities(peerAddr)
  }

  async getCollections(): Promise<XmppCollectionNode[]> {
    return await this.collectionManager.getCollections()
  }

  async getCollectionSubscriptions(): Promise<XmppCollectionSubscription[]> {
    return await this.collectionManager.getCollectionSubscriptions()
  }

  async getCollectionPosts(collectionId?: string): Promise<XmppCollectionPost[]> {
    return await this.collectionManager.getCollectionPosts(collectionId)
  }

  async getAttachments(topic?: string, targetId?: string): Promise<XmppAttachment[]> {
    return await this.collectionManager.getAttachments(topic, targetId)
  }

  async getAttachmentSummaries(topic?: string): Promise<XmppAttachmentSummary[]> {
    return await this.collectionManager.getAttachmentSummaries(topic)
  }

  private forwardClientBridgeEvents() {
    this.clientBridge.on('message', (event: any) => {
      const msg = {
        from: event.from,
        to: event.to,
        body: event.body || '',
        id: event.id || Math.random().toString(36).substring(2, 15),
        type: event.type || 'chat',
        thread: event.thread,
        delay: event.delay ? { stamp: event.delay.stamp, from: event.delay.from } : undefined,
        receipt: event.receipt,
        replace: event.replace,
        reply: event.reply,
        chatState: event.chatState,
        mam: event.mam,
        queryId: event.queryId,
        fromSelf: event.fromSelf,
        stanzaError: event.stanzaError,
      }
      if (event.type === 'error') {
        this.emit('message', { ...msg, server: event.server })
        return
      }
      if (this.chat) {
        this.chat.recordChatMessage(msg).catch(err => this.emit('error', err))
      } else {
        console.warn('[XMPP] Chat manager not available — server message not recorded to history:', msg.id)
      }
      this.emit('message', { ...msg, server: event.server })
    })

    this.clientBridge.on('presence', (event: any) => {
      // Subscription stanzas are relationship requests, not online state.
      if (event.type && event.type !== 'available' && event.type !== 'unavailable') return
      const from = String(event.from || '').split('/')[0]
      if (!from) return
      const presence = {
        from,
        to: '',
        type: event.type || 'available',
        show: event.show,
        status: event.status
      }
      void this.rosterManager.recordPresence(from, presence).catch(err => this.emit('error', err))
      this.emit('presence', presence)
    })

    this.clientBridge.on('presence:subscribe', (event: { from: string; server: string }) => {
      this.emit('server:presence-subscription-request', event)
    })

    this.clientBridge.on('muc:message', (event: any) => {
      this.emit('muc:message', {
        room: event.room,
        roomJid: event.roomJid,
        from: event.from,
        nick: event.nick,
        fromSelf: event.fromSelf,
        mam: event.mam,
        body: event.body,
        id: event.id,
        server: event.server,
        delay: event.delay,
        chatState: event.chatState,
      })
    })

    this.clientBridge.on('muc:join', (event: any) => {
      this.emit('muc:join', {
        room: event.room,
        roomJid: event.roomJid,
        from: event.from,
        nick: event.nick,
        fromSelf: event.fromSelf,
        server: event.server,
        occupantJid: event.occupantJid,
        peerJid: event.occupantJid,
        role: event.role,
        affiliation: event.affiliation,
        statusCodes: event.statusCodes,
      })
    })

    this.clientBridge.on('muc:leave', (event: any) => {
      this.emit('muc:leave', {
        room: event.room,
        roomJid: event.roomJid,
        from: event.from,
        nick: event.nick,
        fromSelf: event.fromSelf,
        server: event.server,
        occupantJid: event.occupantJid,
        peerJid: event.occupantJid,
        role: event.role,
        affiliation: event.affiliation,
        statusCodes: event.statusCodes,
      })
    })

    this.clientBridge.on('muc:error', (event: any) => {
      this.emit('muc:error', event)
    })

    this.clientBridge.on('connection', (info: ServerConnectionInfo) => {
      this.emit('server:connection', info)
      if (info.status === 'connected') {
        // Also refresh after automatic stream resumption/reconnection.
        void this.syncServerRoster().catch((error) => {
          console.warn('[XMPP] Server connected, but roster sync did not complete:', error)
        })
      }
    })

    this.clientBridge.on('roster:change', (items: Array<{ jid: string; name?: string; subscription: string }> = []) => {
      void (async () => {
        for (const item of items) {
          if (item.subscription === 'remove') await this.rosterManager.removeRosterEntry(item.jid)
          else await this.rosterManager.upsertRosterEntry({
            jid: item.jid,
            name: item.name,
            subscription: item.subscription as XmppRosterEntry['subscription'],
            ask: undefined,
          })
        }
        this.emit('server:roster')
      })().catch((error) => this.emit('error', error))
    })

    this.clientBridge.on('pubsub:event', (event: any) => {
      const entry = event.payload?.entry
      if (event.node === 'urn:xmpp:microblog:0' && entry && event.itemId) {
        const item = xml('item', { id: event.itemId }, entry)
        const post = parseMicroblogEntry(event.node, item, event.from, event.node)
        if (post) {
          const authorJid = event.from.split('/')[0].toLowerCase()
          // PEP reuses the same node name for every account, so keep the author
          // in the local storage topic to prevent identical item IDs colliding.
          post.topic = `xmpp-pep:${authorJid}`
          post.id = `${authorJid}:${event.itemId}`
          // XMPP microblog items are local timeline content; do not bridge them back
          // into P2P collections without an explicit publish action from the user.
          void this.feedManager.recordFeedPost(post, { propagateToCollections: false, updateExisting: true }).catch((error) => {
            console.warn('[XMPP] Could not save a server microblog item:', error)
          })
          return
        }
      }
      this.emit('pubsub:message', {
        topic: event.node,
        from: event.from,
        body: entry?.getChild('content')?.text() || entry?.getChild('summary')?.text() || '',
        itemId: event.itemId,
        server: event.server
      })
    })
  }

  async connectServer(credentials: { jid: string; password: string; service?: string }): Promise<void> {
    await this.clientBridge.connect(credentials)
  }

  async uploadFileToServer(data: Uint8Array, filename: string, contentType: string): Promise<string> {
    return this.clientBridge.uploadFile(data, filename, contentType)
  }

  async registerServer(jid: string, password: string, service: string, registrationFields?: Record<string, string>): Promise<void> {
    const account = xmppJid(jid)
    if (!account.local) throw new Error('Enter a full XMPP JID to create an account.')
    const resolvedService = await this.clientBridge.register(service, account.local, password, account.domain, registrationFields)
    await this.clientBridge.connect({ jid, password, service: resolvedService })
  }

  private async syncServerRoster(): Promise<void> {
    await this.ready
    const savedContacts = this.rosterManager.getRosterEntries()
      .filter((entry) => !entry.jid.toLowerCase().split('/')[0].endsWith('@p2p'))
    let serverContacts: Array<{ jid: string; name?: string; subscription: string }> = []
    let serverRosterAvailable = false
    try {
      serverContacts = await this.clientBridge.getRosterEntries()
      serverRosterAvailable = true
    } catch (error) {
      // A roster read failure should not undo a successful account connection.
      console.warn('[XMPP] Connected, but could not load the server roster:', error)
    }

    const serverJids = new Set(serverContacts.map((entry) => entry.jid.split('/')[0].toLowerCase()))
    for (const entry of serverContacts) {
      await this.rosterManager.upsertRosterEntry({
        jid: entry.jid,
        name: entry.name,
        subscription: entry.subscription as XmppRosterEntry['subscription'],
        ask: undefined,
      })
    }

    // Push local contacts to the newly connected account only when they are
    // absent from its roster. Re-sending subscription requests on every login
    // can annoy contacts and produce repeated authorization prompts.
    const contactsToAdd = serverRosterAvailable
      ? savedContacts.filter((entry) => !serverJids.has(entry.jid.split('/')[0].toLowerCase()))
      : []
    await Promise.allSettled(contactsToAdd.map((entry) => this.clientBridge.addRosterEntry(entry.jid, entry.name ?? entry.nickname)))
    this.emit('server:roster')
  }

  async disconnectServer(): Promise<void> {
    await this.clientBridge.disconnect()
  }

  /** Process peer discoveries received while the runtime wrapper was starting. */
  public replayDiscoveredPeers(peers: any[]): void {
    for (const peer of peers) this.handleDiscoveredPeer(peer)
  }

  private handleDiscoveredPeer(detail: any): void {
    const peerId = detail?.id?.toString?.()
    if (!peerId || peerId === this.libp2p.peerId.toString()) return
    const localAddress = (detail.multiaddrs ?? []).find((address: Multiaddr) => isPrivate(address))
    if (!localAddress) return
    const address = localAddress.toString()
    const peerAddress = address.includes('/p2p/') ? address : `${address}/p2p/${peerId}`
    void this.ready
      .then(() => this.feedManager.previewDiscoveredFeed(peerId, peerAddress))
      .catch(error => console.warn(`[XMPP] Could not preview nearby peer feed ${peerId}:`, error))
  }

  isServerConnected(): boolean {
    return this.clientBridge.isConnected
  }

  getServerStatus(): ServerConnectionInfo {
    return this.clientBridge.connectionInfo
  }

  getServerConnections(): ServerConnectionInfo[] {
    const info = this.clientBridge.connectionInfo
    return info.domain ? [info] : []
  }

  async close() {
    await this.ready

    if (this.dhtMailboxPeerListener) {
      this.libp2p.removeEventListener('peer:connect', this.dhtMailboxPeerListener)
      this.dhtMailboxPeerListener = undefined
    }
    if (this.discoveredPeerListener) {
      this.libp2p.removeEventListener('peer:discovery', this.discoveredPeerListener)
      this.discoveredPeerListener = undefined
    }
    if (this.disconnectedPeerListener) {
      this.libp2p.removeEventListener('peer:disconnect', this.disconnectedPeerListener)
      this.disconnectedPeerListener = undefined
    }

    await this.clientBridge.disconnect().catch(() => {})

    for (const pending of this.pendingIq.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('XmppNode closed before IQ completed'))
    }
    this.pendingIq.clear()

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()
    this.reconnectAttempts.clear()
    this.peerAddrs.clear()

    for (const stream of this.streams.values()) {
      await stream.close()
    }
    this.streams.clear()

    await this.rosterManager.close()
    await this.feedManager.stopAllDiscoveredFeedPreviews()
    await this.feedManager.close()
    await this.collectionManager.close()
    await this.chat.flushSaveQueue()
    await this.uploads.close()
    await this.omemoStateManager.close()
    await this.openPgpStateManager.close()
    this.reliabilityManager.clear()
    await this.muc.close()
    await this.storage.close()
  }
}
