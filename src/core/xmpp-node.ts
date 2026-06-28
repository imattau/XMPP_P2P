/**
 * @packageDocumentation Main XMPP runtime node that wires libp2p transport, roster
 * state, feeds, collections, MUC, uploads, and secure messaging together.
 */

import { Libp2p } from 'libp2p'
import { xml, Element, Parser } from '@xmpp/xml'
import { XmppChatManager } from './xmpp-chat.js'
import { XmppServerBridge, type ServerConnectionInfo, type ServerMessageEvent, type ServerMucMessageEvent, type ServerPubsubEvent, type ServerDiscoInfoResult, type ServerDiscoItemsResult } from './xmpp-server-bridge.js'
import { buildXepElements, parseXepMetadata } from './xmpp-xep-helpers.js'
import { bufferToBase64 } from './xmpp-utils.js'
import { EventEmitter } from 'events'
import { XmppStream } from './xmpp-stream.js'
import * as openpgp from 'openpgp'
import { XmppReliabilityManager } from './xmpp-reliability.js'
import { XmppUploadManager, UPLOAD_ANNOUNCEMENTS_TOPIC } from './xmpp-uploads.js'
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
import { buildMicroblogEntry, deriveMicroblogTitle } from './xmpp-atom.js'
import type {
  OmemoDirection
} from './omemo-runtime.js'
import { multiaddr, Multiaddr } from '@multiformats/multiaddr'
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
}

/**
 * High-level facade around the XMPP protocol managers and libp2p streams.
 */
export class XmppNode extends EventEmitter {
  private libp2p: Libp2p
  private streams = new Map<string, XmppStream>()
  private peerAddrs = new Map<string, string | Multiaddr>()
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private reconnectAttempts = new Map<string, number>()
  private readonly maxReconnectDelay = 30000
  private readonly minReconnectDelay = 1000
  private reliabilityManager = new XmppReliabilityManager()
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
  public readonly serverBridge: XmppServerBridge
  public readonly ready: Promise<void>

  constructor(libp2p: Libp2p, storage: XmppStorage, options: XmppNodeOptions = {}) {
    super()
    this.libp2p = libp2p
    this.jid = `${this.libp2p.peerId.toString()}@p2p`
    this.storage = storage
    this.uploadHost = process.env.XMPP_UPLOAD_HOST ?? '127.0.0.1'
    this.uploadPort = Number.parseInt(process.env.XMPP_UPLOAD_PORT ?? '0', 10) || 0
    this.omemoStateManager = new XmppOmemoStateManager(storage, options.omemoModuleLoader)
    this.openPgpStateManager = new XmppOpenPgpStateManager(storage, this.jid)
    this.muc = new XmppMucManager(this.getMucContext())
    this.uploads = new XmppUploadManager(this)
    this.serverBridge = new XmppServerBridge(storage)
    this.forwardServerBridgeEvents()
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
    const self = this
    this.rosterManager = new XmppRosterManager({
      jid: this.jid,
      libp2p: this.libp2p,
      storage: this.storage,
      get ready() { return self.ready },
      getOrCreateStream: this.getOrCreateStream.bind(this),
      getStreamByJid: this.getStreamByJid.bind(this),
      getStreams: () => this.streams,
      emit: this.emit.bind(this),
      sendIqRequest: this.sendIqRequest.bind(this),
      discoveryNode: this.discoveryNode,
      discoveryIdentity: this.discoveryIdentity,
      collections: this.collectionManager.collections
    })
    this.feedManager = new XmppFeedManager(this.getFeedContext())
    if (options.nickname) {
      this.rosterManager.selfPresence.nickname = options.nickname
      this.rosterManager.selfVCard.nickname = options.nickname
    }
    this.ready = this.rosterManager.initialize()
      .then(() => this.feedManager.initialize())
      .then(() => this.collectionManager.initialize())
      .then(() => this.muc.initialize())
      .then(() => this.chat.initialize())
      .then(() => this.uploads.ensureUploadServer())
      .then(() => this.uploads.ensureUploadAnnouncementSubscription())
      .then(() => this.loadOmemoState())
      .then(() => this.openPgpStateManager.load())
      .then(() => this.initFederationSettings())

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
        if (topic.startsWith('xmpp/muc/')) {
          const fromPeerId = evt.detail.from?.toString() || 'unknown'
          void this.muc.handleIncomingPayload(topic, fromPeerId, xmlStr).catch(() => {})
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
      buildVCardQuery: () => this.rosterManager.buildVCardQuery(),
      updateVCard: (profile) => this.rosterManager.updateVCard(profile),
      discoveryIdentity: this.discoveryIdentity,
      discoveryNode: this.discoveryNode,
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
    } = {}
  ): Promise<{ roomName: string; roomJid: string }> {
    await this.ready

    const nick = options.nick ?? this.selfPresence.nickname ?? this.jid.replace('@p2p', '')
    await this.updateMucRoomSettings(roomName, {
      topic: options.topic,
      defaultMode: 'secure',
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

    if (!parsed.dialTarget) {
      throw new Error(`Peer ${peerIdStr} is not connected; provide a multiaddr or establish a stream first`)
    }

    this.peerAddrs.set(peerIdStr, parsed.dialTarget)
    const stream = await this.libp2p.dialProtocol(parsed.dialTarget, ['/xmpp/1.0.0'])
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
      this.scheduleReconnect(peerId)
    })

    // XEP-0198 negotiation or resumption
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

    void this.rosterManager.flushRosterPresenceForPeer(peerId).catch(err => this.emit('error', err))
    void this.rosterManager.sendCurrentPresenceToPeer(peerId).catch(err => this.emit('error', err))
    setTimeout(() => {
      void this.feedManager.announcePublicSubscriptionsForPeer(peerId).catch(err => this.emit('error', err))
    }, 250)
  }

  async getRosterEntries(): Promise<XmppRosterEntry[]> {
    await this.ready
    return this.rosterManager.getRosterEntries()
  }

  async getRosterEntry(jid: string): Promise<XmppRosterEntry | undefined> {
    await this.ready
    return this.rosterManager.getRosterEntry(jid)
  }

  async addRosterEntry(jid: string, name?: string): Promise<XmppRosterEntry> {
    return await this.rosterManager.addRosterEntry(jid, name)
  }

  async removeRosterEntry(jid: string): Promise<void> {
    await this.rosterManager.removeRosterEntry(jid)
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
      ...(this.selfVCard.photo ? { photo: this.selfVCard.photo } : {})
    }
  }

  // Send a chat message to a peer
  async sendMessage(
    peerAddr: string | Multiaddr,
    body: string,
    options: {
      replace?: string
      reply?: { id: string; to?: string }
      thread?: string
      requestReceipt?: boolean
      chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
      delay?: { stamp: string; from?: string }
      noCarbons?: boolean
    } = {}
  ): Promise<string> {
    const addrStr = peerAddr.toString()
    if (this.serverBridge.isFederatedJid(addrStr)) {
      return this.serverBridge.sendMessage(addrStr, body, { thread: options.thread }, this.peerLocalpart)
    }

    const peerId = this.parsePeerReference(peerAddr).peerId
    const toJid = this.jidFromPeerId(peerId)
    const id = Math.random().toString(36).substring(2, 15)

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
    } catch (err) {
      console.warn(`[DEBUG] Failed to send stanza directly to ${peerId}. Buffering to DHT mailbox:`, err)
      await bufferStanzaToDht(this.libp2p, peerId, stanza)
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

  async publishFeed(body: string, options: { topic?: string; itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string } = {}): Promise<string> {
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

  private forwardServerBridgeEvents() {
    this.serverBridge.on('message', (event: ServerMessageEvent) => {
      this.emit('message', {
        from: event.from,
        to: event.to,
        body: event.body,
        id: event.id,
        type: event.type,
        server: event.server,
        thread: event.thread,
        delay: event.delay ? { stamp: event.delay.stamp, from: event.delay.from } : undefined
      } as any)
    })

    this.serverBridge.on('presence', (event: any) => {
      this.emit('presence', {
        from: event.from,
        type: event.type,
        server: event.server,
        show: event.show,
        status: event.status
      })
    })

    this.serverBridge.on('muc:message', (event: ServerMucMessageEvent) => {
      this.emit('muc:message', {
        room: event.room,
        from: event.from,
        body: event.body,
        id: event.id,
        server: event.server
      })
    })

    this.serverBridge.on('connection', (info: ServerConnectionInfo) => {
      this.emit('server:connection', info)
    })

    // Phase 1: PubSub events from server
    this.serverBridge.on('pubsub:event', (event: ServerPubsubEvent) => {
      this.emit('pubsub:message', {
        topic: event.node,
        from: event.from,
        body: event.payload?.body || '',
        itemId: event.itemId,
        server: event.server
      })
    })

    // Phase 3: Feed bridge from server PubSub
    this.serverBridge.on('feed:bridge', (event: any) => {
      this.emit('feed:post', {
        id: event.itemId,
        topic: event.feedTopic,
        from: event.from,
        body: event.body,
        title: event.title,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString()
      })
    })

    // Phase 4: Service discovery results
    this.serverBridge.on('disco:info', (event: any) => {
      this.emit('disco:info', event)
    })

    this.serverBridge.on('disco:items', (event: any) => {
      this.emit('disco:items', event)
    })

    // Phase 5: Cross-MUC bridge events
    this.serverBridge.on('muc:bridge', (event: any) => {
      this.emit('muc:message', {
        room: event.p2pRoom,
        from: event.from,
        body: event.body,
        id: event.id,
        server: 'bridge:' + event.serverRoom
      })
    })

    // Phase 3: Feed-to-PubSub cross-posting hook
    this.on('feed:post', (post: any) => {
      this.serverBridge.crossPostFeedToPubSub(post).catch(() => {})
    })
  }

  isFederatedJid(target: string): boolean {
    return this.serverBridge.isFederatedJid(target)
  }

  async connectComponent(host: string, port: number, secret: string, domain: string): Promise<void> {
    return this.serverBridge.connectComponent(host, port, secret, domain)
  }

  async disconnectComponent(): Promise<void> {
    return this.serverBridge.disconnectComponent()
  }

  isComponentConnected(): boolean {
    return this.serverBridge.isComponentConnected()
  }

  setFederationEnabled(enabled: boolean): void {
    this.serverBridge.setFederationEnabled(enabled)
  }

  isFederationEnabled(): boolean {
    return this.serverBridge.isFederationEnabled()
  }

  async resolveComponentEndpoint(domain: string): Promise<{ host: string; port: number }> {
    return this.serverBridge.resolveComponentEndpoint(domain)
  }

  async initFederationSettings(): Promise<void> {
    await this.serverBridge.loadSettings()
  }

  setS2SDomain(domain: string): void {
    this.serverBridge.setS2SDomain(domain)
  }

  getServerConnections(): ServerConnectionInfo[] {
    return this.serverBridge.getConnectionInfo()
  }

  async joinServerMuc(roomJid: string, nick: string): Promise<void> {
    return this.serverBridge.joinMuc(roomJid, nick, this.peerLocalpart)
  }

  async sendServerMucMessage(roomJid: string, body: string): Promise<string> {
    return this.serverBridge.sendMucMessage(roomJid, body, this.peerLocalpart)
  }

  async leaveServerMuc(roomJid: string): Promise<void> {
    return this.serverBridge.leaveMuc(roomJid, this.peerLocalpart)
  }

  // Phase 2: PubSub operations on federated servers
  async pubsubSubscribe(nodeJid: string, node: string): Promise<void> {
    return this.serverBridge.pubsubSubscribe(nodeJid, node, this.peerLocalpart)
  }

  async pubsubPublish(nodeJid: string, node: string, itemId: string, payload: Element): Promise<string> {
    return this.serverBridge.pubsubPublish(nodeJid, node, itemId, payload, this.peerLocalpart)
  }

  async pubsubGetItems(nodeJid: string, node: string, maxItems?: number): Promise<Element[]> {
    return this.serverBridge.pubsubGetItems(nodeJid, node, maxItems, this.peerLocalpart)
  }

  async pubsubUnsubscribe(nodeJid: string, node: string): Promise<void> {
    return this.serverBridge.pubsubUnsubscribe(nodeJid, node, this.peerLocalpart)
  }

  async pubsubCreateNode(nodeJid: string, node: string): Promise<void> {
    return this.serverBridge.pubsubCreateNode(nodeJid, node, this.peerLocalpart)
  }

  // Phase 4: Service Discovery on federated servers
  async serverDiscoInfo(jid: string): Promise<ServerDiscoInfoResult> {
    return this.serverBridge.discoInfo(jid, this.peerLocalpart)
  }

  async serverDiscoItems(jid: string): Promise<ServerDiscoItemsResult> {
    return this.serverBridge.discoItems(jid, this.peerLocalpart)
  }

  // Phase 3: Feed bridge management
  async setFeedBridge(feedTopic: string, pubsubNode: string): Promise<void> {
    return this.serverBridge.setFeedBridge(feedTopic, pubsubNode)
  }

  async removeFeedBridge(feedTopic: string): Promise<void> {
    return this.serverBridge.removeFeedBridge(feedTopic)
  }

  getFeedBridge(feedTopic: string): string | undefined {
    return this.serverBridge.getFeedBridge(feedTopic)
  }

  getAllFeedBridges(): Array<{ feedTopic: string; pubsubNode: string }> {
    return this.serverBridge.getAllFeedBridges()
  }

  // Phase 5: MUC bridge management
  async setMucBridge(serverRoom: string, p2pRoom: string): Promise<void> {
    return this.serverBridge.setMucBridge(serverRoom, p2pRoom)
  }

  async removeMucBridge(serverRoom: string): Promise<void> {
    return this.serverBridge.removeMucBridge(serverRoom)
  }

  getMucBridge(serverRoom: string): string | undefined {
    return this.serverBridge.getMucBridge(serverRoom)
  }

  getAllMucBridges(): Array<{ serverRoom: string; p2pRoom: string }> {
    return this.serverBridge.getAllMucBridges()
  }

  async close() {
    await this.ready

    await this.serverBridge.disconnectAll().catch(() => {})

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
    await this.feedManager.close()
    await this.collectionManager.close()
    await this.chat.flushSaveQueue()
    await this.uploads.close()
    await this.omemoStateManager.close()
    await this.openPgpStateManager.close()
    this.reliabilityManager.clear()
    this.muc.close()
  }
}
