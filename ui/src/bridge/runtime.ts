import { useEffect, useState } from 'react'
import { getNativeIdentityKeyStore, isCapacitorNative } from '../lib/native-key-store'
import { discoverNostrBootstrapAddrs, normalizeNostrBootstrapConfig, type NostrBootstrapConfig } from '../../../src/core/nostr-bootstrap.js'

export type BridgeVisibility = 'public' | 'private'

export type BridgeFeedPostRecord = {
  id: string
  topic: string
  from: string
  body: string
  publishedAt: string
  updatedAt: string
  receivedAt: string
  node?: string
  atomId?: string
  title?: string
  summary?: string
  author?: string
  categories?: string[]
  links?: Array<{ rel: string; href: string; type?: string; title?: string; ref?: string }>
  geoloc?: { lat?: string; lon?: string; country?: string; countryCode?: string; region?: string }
  replyTo?: string
  sourceProtocol?: 'p2p' | 'xmpp' | 'rss'
  sourceName?: string
  sourceUrl?: string
}

export type BridgeAttachmentRecord = {
  id: string
  topic: string
  targetId: string
  from: string
  kind: 'noticed' | 'reaction'
  value?: string
  publishedAt: string
  receivedAt: string
}

export type BridgeAttachmentSummary = {
  topic: string
  targetId: string
  total: number
  noticed: number
  reactions: number
  reactionCounts: Record<string, number>
  updatedAt: string
}

export type BridgeFeedSubscriptionRecord = {
  peerId: string
  jid: string
  topic: string
  subscribedAt: string
  visibility: BridgeVisibility
  updatedAt: string
}

export type BridgeFeedFollower = {
  followerPeerId: string
  followerJid: string
  feedPeerId: string
  feedTopic: string
  visibility: BridgeVisibility
  subscribedAt: string
  updatedAt: string
}

export type BridgeCollectionNode = {
  id: string
  name?: string
  topic: string
  members: Array<{ jid: string; peerId: string; feedTopic: string; addedAt: string }>
  createdAt: string
  updatedAt: string
}

export type BridgeCollectionPostRecord = BridgeFeedPostRecord & {
  collectionId: string
  sourceTopic: string
}

export type BridgeServerConnectionInfo = {
  type: 'client'
  domain: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
}

export type BridgeServerMucRoom = {
  roomJid: string
  name: string
  serviceJid: string
}

export type BridgeServerMicroblogSubscription = {
  jid: string
  node: string
  status: 'subscribed' | 'pending' | 'polling'
  updatedAt: string
}

export type BridgeFeedSourceRef = {
  protocol: 'p2p' | 'xmpp'
  owner: string
}

export type BridgeFollowedFeedSource = {
  protocol: 'p2p' | 'xmpp' | 'rss'
  owner: string
  id: string
  node: string
  status: 'subscribed' | 'pending' | 'polling' | 'active' | 'paused' | 'error'
  updatedAt?: string
}

export type BridgeRssFeedPreview = {
  url: string
  title: string
  siteUrl?: string
  format: 'rss' | 'atom'
  entries: Array<{ title: string; summary: string; publishedAt?: string; url?: string }>
}

export type BridgeRssFeedSource = {
  id: string
  url: string
  title: string
  siteUrl?: string
  format: 'rss' | 'atom'
  status: 'active' | 'paused' | 'error'
  lastFetchedAt?: string
  lastError?: string
  retryAt?: string
  shareToP2P?: boolean
  shareError?: string
  updatedAt: string
}

export type BridgeStoredComponentConfig = {
  domain: string
  host: string
  port: number
  createdAt: string
  updatedAt: string
}

export type BridgeVCard = {
  fn?: string
  nickname?: string
  desc?: string
  photo?: { type?: string; binval?: string } | null
}

export type BridgePresenceType = 'available' | 'unavailable'

export type BridgeChatType = 'direct' | 'group' | 'muc'

export type BridgeChatAttachment = {
  id: string
  url: string
  alt: string
  kind: 'image' | 'file'
}

export type BridgeChatTarget = {
  id: string
  type: BridgeChatType
  name: string
  handle?: string
  peerAddress?: string
  server?: string
  subject?: string
  encrypted?: boolean
}

export type BridgeMucRoomSettings = {
  topic?: string
  defaultSecure?: boolean
  autoJoin?: boolean
  communityId?: string
  archived?: boolean
}

export interface XmppRuntimeBridge {
  getFeedPosts(): Promise<BridgeFeedPostRecord[]>
  getAttachments?(topic?: string, targetId?: string): Promise<BridgeAttachmentRecord[]>
  onAttachmentSummary?(cb: (summary: BridgeAttachmentSummary) => void): () => void
  publishFeed(
    body: string,
    options?: {
      topic?: string
      itemId?: string
      title?: string
      summary?: string
      categories?: string[]
      author?: string
      replyTo?: string
      links?: Array<{ rel: string; href: string; type?: string; title?: string; ref?: string }>
    }
  ): Promise<string>
  subscribeFeed(peerAddr: string, options?: { visibility?: BridgeVisibility }): Promise<BridgeFeedSubscriptionRecord>
  setFeedSubscriptionVisibility(peerAddr: string, visibility: BridgeVisibility): Promise<BridgeFeedSubscriptionRecord>
  unsubscribeFeed(peerAddr: string): Promise<void>
  getFeedSubscriptions(): Promise<BridgeFeedSubscriptionRecord[]>
  getFollowedFeedSources?(): Promise<BridgeFollowedFeedSource[]>
  followFeedSource?(source: BridgeFeedSourceRef): Promise<'subscribed' | 'pending' | 'unconfigured' | 'polling'>
  unfollowFeedSource?(source: BridgeFeedSourceRef): Promise<void>
  discoverRssFeeds?(url: string): Promise<BridgeRssFeedPreview[]>
  addRssFeed?(url: string, options?: { shareToP2P?: boolean }): Promise<BridgeRssFeedSource>
  getRssFeeds?(): Promise<BridgeRssFeedSource[]>
  refreshRssFeed?(id: string): Promise<number>
  setRssFeedPaused?(id: string, paused: boolean): Promise<void>
  setRssFeedSharing?(id: string, shareToP2P: boolean): Promise<void>
  removeRssFeed?(id: string, keepEntries?: boolean): Promise<void>
  getPublicFeedSubscriptions(): Promise<BridgeFeedSubscriptionRecord[]>
  watchFeedFollowers(peerAddr: string): Promise<{ peerId: string; topic: string; watchedAt: string }>
  getFeedFollowers(peerAddr: string): Promise<BridgeFeedFollower[]>
  getCollections(): Promise<BridgeCollectionNode[]>
  createCollection(id: string, name?: string): Promise<BridgeCollectionNode>
  subscribeCollection(id: string): Promise<{ id: string; topic: string; subscribedAt: string }>
  unsubscribeCollection(id: string): Promise<void>
  getCollectionPosts(collectionId?: string): Promise<BridgeCollectionPostRecord[]>
  publishCollection(
    collectionId: string,
    body: string,
    options?: {
      itemId?: string
      title?: string
      summary?: string
      categories?: string[]
      author?: string
    }
  ): Promise<string>
  react(topic: string, targetId: string, reaction: string): Promise<string>
  notice(topic: string, targetId: string, value?: string): Promise<string>
  createPrivateMucRoom(
    roomName: string,
    options?: {
      topic?: string
      nick?: string
      communityId?: string
      autoJoin?: boolean
      archived?: boolean
      defaultMode?: 'secure' | 'open'
    }
  ): Promise<{ roomName: string; roomJid: string }>
  joinMucRoom(roomName: string, nick?: string): Promise<void>
  leaveMucRoom(roomName: string): Promise<void>
  joinServerMuc?(roomJid: string, nick: string): Promise<void>
  leaveServerMuc?(roomJid: string, nick: string): Promise<void>
  getMucRoomSettings(roomName: string): Promise<BridgeMucRoomSettings | undefined>
  updateMucRoomSettings(roomName: string, settings: BridgeMucRoomSettings): Promise<void>
  sendChatMessage(
    target: BridgeChatTarget,
    body: string,
    options?: {
      originId?: string
      attachments?: BridgeChatAttachment[]
      replyTo?: string
      reply?: {
        id: string
        to?: string
      }
      thread?: string
      replace?: string
    }
  ): Promise<string>
  getVCard(): Promise<BridgeVCard>
  setVCard(profile: BridgeVCard): Promise<BridgeVCard>
  broadcastPresence(type?: BridgePresenceType, status?: string, show?: string, nickname?: string): Promise<void>
  getRosterEntries(): Promise<Array<{ jid: string; name?: string; nickname?: string; updatedAt: string; subscription?: string }>>
  addRosterEntry(jid: string, name?: string): Promise<{ jid: string; name?: string; nickname?: string; updatedAt: string }>
  removeRosterEntry(jid: string): Promise<void>

  onMessage(cb: (msg: {
    from: string
    to: string
    body: string
    id: string
    type?: string
    encrypted?: boolean
    chatState?: string
    receipt?: { type: string; id: string }
    replace?: string
    reply?: { id: string; to?: string }
    thread?: string
    delay?: { stamp: string; from?: string }
    mam?: boolean
    queryId?: string
    fromSelf?: boolean
    stanzaError?: { condition?: string; text?: string }
  }) => void): () => void
  onPresence(cb: (presence: { from: string; to: string; type?: string; show?: string; status?: string; nickname?: string }) => void): () => void
  onFeedPost(cb: (post: BridgeFeedPostRecord) => void): () => void
  onCollectionPost?(cb: (post: BridgeCollectionPostRecord) => void): () => void
  onConnectionChange(cb: (peerId: string, connected: boolean) => void): () => void
  getConnectedPeers(): string[]
  getLocalJid(): string
  getServerJid?(): string | undefined
  getLocalPeerAddresses?(): string[]
  sendChatState(target: string, state: 'composing' | 'paused' | 'active'): Promise<void>
  sendMucChatState(roomName: string, state: 'composing' | 'paused' | 'active'): Promise<void>
  getMucHistory(roomName: string): Promise<Array<{ id: string; room: string; from: string; fromPeerId: string; body: string; timestamp: string; encrypted?: boolean; reply?: { id: string; to?: string }; thread?: string }>>
  getMucParticipants?(roomName: string): Array<{ nick: string; peerId: string; jid: string; occupantJid: string }>
  queryChatHistory?(targetPeerJid: string, withJid?: string): Promise<string>
  queryServerChatHistory?(withJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }>
  queryServerMucHistory?(roomJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }>
  discoverServerMucRooms?(): Promise<BridgeServerMucRoom[]>
  subscribeServerMicroblog?(jid: string): Promise<'subscribed' | 'pending' | 'unconfigured' | 'polling'>
  getServerMicroblogSubscriptions?(): Promise<BridgeServerMicroblogSubscription[]>
  unsubscribeServerMicroblog?(jid: string): Promise<void>
  refreshServerMicroblog?(jid: string): Promise<number>
  publishServerMicroblog?(body: string, options?: { itemId?: string; title?: string; summary?: string; categories?: string[]; author?: string; displayContent?: string; articlePayload?: string }): Promise<string>
  onChatState(cb: (state: { from: string; state: string }) => void): () => void
  onMucMessage(cb: (event: any) => void): () => void
  onMucJoin(cb: (event: any) => void): () => void
  onMucLeave(cb: (event: any) => void): () => void
  onMucError(cb: (event: any) => void): () => void
  onMucChatState(cb: (event: any) => void): () => void
  onMucMarker(cb: (event: any) => void): () => void

  connectComponent(host: string, port: number, secret: string, domain: string): Promise<void>
  disconnectComponent(): Promise<void>
  isComponentConnected(): boolean
  connectServer(jid: string, password: string, service?: string): Promise<void>
  disconnectServer(): Promise<void>
  registerServer(jid: string, password: string, service: string, registrationFields?: Record<string, string>): Promise<void>
  isServerConnected(): boolean
  getServerStatus(): { online: boolean; connections: BridgeServerConnectionInfo[] }
  getServerConnections(): BridgeServerConnectionInfo[]
  onServerConnection(cb: (info: BridgeServerConnectionInfo) => void): () => void
  onServerRosterChange(cb: () => void): () => void
  onServerPresenceSubscriptionRequest?(cb: (request: { jid: string; server: string }) => void): () => void
  approveServerPresenceSubscription?(jid: string): Promise<void>
  denyServerPresenceSubscription?(jid: string): Promise<void>
  saveComponentConfig(domain: string, secret: string, host: string, port: number): Promise<void>
  listSavedComponentConfigs(): Promise<BridgeStoredComponentConfig[]>
  removeComponentConfig(domain: string): Promise<void>
  disconnect(): Promise<void>
  uploadFile(file: File, recipient?: string): Promise<{ url: string; alt: string; kind: 'image' | 'file' }>
  resolveUploadUrl(url: string): Promise<string | undefined>
  getOmemoFingerprint(): Promise<string | undefined>
  getPeerOmemoFingerprint(peerJid: string): Promise<string | undefined>
  kickMucParticipant(roomJid: string, participantJid: string, reason?: string): Promise<void>
  banMucParticipant(roomJid: string, participantJid: string, reason?: string): Promise<void>
}

declare global {
  interface Window {
    __XMPP_P2P_BRIDGE__?: XmppRuntimeBridge
    XmppP2P?: {
      createBrowserXmppClient: (opts: {
        bootstrapAddrs: string[]
        dbName?: string
        nickname?: string
        passphrase?: string
        recoveryPhrase?: string[]
        dhtClientMode?: boolean
        keyStore?: { get(): Promise<string | undefined>; set(value: string): Promise<void> }
      }) => Promise<{ bridge: XmppRuntimeBridge }>
    }
    __XMPP_P2P_CONFIG__?: {
      bootstrapAddrs: string[]
      nostrBootstrap?: NostrBootstrapConfig
    }
    __XMPP_P2P_CONFIG_READY__?: Promise<{ bootstrapAddrs: string[]; nostrBootstrap?: NostrBootstrapConfig }>
  }
}

let browserClientStartup: Promise<XmppRuntimeBridge> | undefined
let nostrDiscoveryCache: { key: string; expiresAt: number; promise: Promise<string[]> } | undefined

async function getDeploymentBootstrapConfig(): Promise<{ bootstrapAddrs: string[]; nostrBootstrap?: NostrBootstrapConfig }> {
  if (typeof window === 'undefined') return { bootstrapAddrs: [] }
  if (!window.__XMPP_P2P_CONFIG_READY__) {
    window.__XMPP_P2P_CONFIG_READY__ = fetch('/bootstrap-config.json')
      .then(response => response.ok ? response.json() : { bootstrapAddrs: [], nostrBootstrap: undefined })
      .catch(() => ({ bootstrapAddrs: [], nostrBootstrap: undefined }))
      .then(config => {
        window.__XMPP_P2P_CONFIG__ = config
        return config
      })
  }
  return window.__XMPP_P2P_CONFIG__ ?? await window.__XMPP_P2P_CONFIG_READY__
}

/** Start the browser node once and share its in-flight startup across routes. */
export function ensureBrowserXmppClient(options: {
  bootstrapAddrs: string[]
  dbName?: string
  nickname?: string
  passphrase?: string
  recoveryPhrase?: string[]
  dhtClientMode?: boolean
  keyStore?: { get(): Promise<string | undefined>; set(value: string): Promise<void> }
}): Promise<XmppRuntimeBridge> {
  const existingBridge = getBrowserXmppBridge()
  if (existingBridge) return Promise.resolve(existingBridge)
  if (browserClientStartup) return browserClientStartup
  const createClient = typeof window !== 'undefined' ? window.XmppP2P?.createBrowserXmppClient : undefined
  if (!createClient) return Promise.reject(new Error('The browser networking module did not load. Reload the page and try again.'))

  const startup = createClient({
    ...options,
    dhtClientMode: options.dhtClientMode ?? isCapacitorNative(),
    keyStore: options.keyStore ?? getNativeIdentityKeyStore()
  }).then(({ bridge }) => bridge)
  browserClientStartup = startup
  void startup.then(
    () => { if (browserClientStartup === startup) browserClientStartup = undefined },
    () => { if (browserClientStartup === startup) browserClientStartup = undefined }
  )
  return startup
}

/**
 * Wait for the deployment-provided bootstrap configuration. The HTML shell
 * starts this fetch before React, but module evaluation and network timing are
 * independent, so callers must not assume the config is already available.
 */
export async function getBootstrapAddrs(): Promise<string[]> {
  if (typeof window === 'undefined') return []
  let savedAddresses: string[] | undefined
  try {
    const saved = window.localStorage.getItem('xmpp-p2p:bootstrap-addrs')
    if (saved !== null) {
      const addresses = JSON.parse(saved)
      if (Array.isArray(addresses)) savedAddresses = addresses.filter((address): address is string => typeof address === 'string')
    }
  } catch { /* use the deployment-provided configuration below */ }

  const config = await getDeploymentBootstrapConfig()
  let savedNostr: Partial<NostrBootstrapConfig> | undefined
  try {
    const serialized = window.localStorage.getItem('xmpp-p2p:nostr-bootstrap')
    if (serialized) savedNostr = JSON.parse(serialized)
  } catch { /* use the deployment-provided discovery configuration */ }
  const nostrConfig = normalizeNostrBootstrapConfig(savedNostr ?? config.nostrBootstrap)
  const baseAddresses = savedAddresses ?? config.bootstrapAddrs ?? []
  if (!nostrConfig.relayUrls.length) return [...new Set(baseAddresses)]
  try {
    const key = JSON.stringify(nostrConfig)
    if (!nostrDiscoveryCache || nostrDiscoveryCache.key !== key || nostrDiscoveryCache.expiresAt < Date.now()) {
      const promise = discoverNostrBootstrapAddrs(nostrConfig, { maxWaitMs: 2500 })
      nostrDiscoveryCache = { key, expiresAt: Date.now() + 45_000, promise }
    }
    const discovered = await nostrDiscoveryCache.promise
    return [...new Set([...baseAddresses, ...discovered])]
  } catch {
    return [...new Set(baseAddresses)]
  }
}

export function saveBootstrapAddrs(addresses: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('xmpp-p2p:bootstrap-addrs', JSON.stringify(addresses))
  window.__XMPP_P2P_CONFIG__ = { ...window.__XMPP_P2P_CONFIG__, bootstrapAddrs: addresses }
  window.dispatchEvent(new Event('xmpp-p2p:bootstrap-config-changed'))
}

export async function getNostrBootstrapConfig(): Promise<NostrBootstrapConfig> {
  if (typeof window === 'undefined') return normalizeNostrBootstrapConfig(undefined)
  try {
    const saved = window.localStorage.getItem('xmpp-p2p:nostr-bootstrap')
    if (saved) return normalizeNostrBootstrapConfig(JSON.parse(saved))
  } catch { /* use deployment config below */ }
  const config = await getDeploymentBootstrapConfig()
  return normalizeNostrBootstrapConfig(config.nostrBootstrap)
}

export function saveNostrBootstrapConfig(config: Partial<NostrBootstrapConfig>): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeNostrBootstrapConfig(config)
  window.localStorage.setItem('xmpp-p2p:nostr-bootstrap', JSON.stringify(normalized))
  window.dispatchEvent(new Event('xmpp-p2p:bootstrap-config-changed'))
}

/** Retry signed discovery while the app is open and restart P2P on address changes. */
export function watchBootstrapAddrs(onChange: (addresses: string[]) => void, intervalMs = 60_000): () => void {
  if (typeof window === 'undefined') return () => {}
  let stopped = false
  let currentAddressKey: string | undefined
  const refresh = async (suppressChange = false) => {
    const addresses = await getBootstrapAddrs()
    if (stopped) return
    const addressKey = [...addresses].sort().join('\n')
    if (currentAddressKey !== undefined && currentAddressKey !== addressKey && !suppressChange) {
      currentAddressKey = addressKey
      onChange(addresses)
      return
    }
    currentAddressKey = addressKey
  }
  const resetAfterUserConfigChange = () => {
    currentAddressKey = undefined
    void refresh(true)
  }
  void refresh(true)
  const timer = window.setInterval(() => { void refresh() }, intervalMs)
  window.addEventListener('xmpp-p2p:bootstrap-config-changed', resetAfterUserConfigChange)
  return () => {
    stopped = true
    window.clearInterval(timer)
    window.removeEventListener('xmpp-p2p:bootstrap-config-changed', resetAfterUserConfigChange)
  }
}

export function getBrowserXmppBridge(): XmppRuntimeBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.__XMPP_P2P_BRIDGE__
}
export function useBrowserXmppBridge(): XmppRuntimeBridge | undefined {
  const [bridge, setBridge] = useState<XmppRuntimeBridge | undefined>(() => getBrowserXmppBridge())
  useEffect(() => {
    const sync = () => setBridge(getBrowserXmppBridge())
    window.addEventListener('xmpp-p2p:bridge-ready', sync)
    window.addEventListener('xmpp-p2p:bridge-disconnected', sync)
    sync()
    return () => {
      window.removeEventListener('xmpp-p2p:bridge-ready', sync)
      window.removeEventListener('xmpp-p2p:bridge-disconnected', sync)
    }
  }, [])
  return bridge
}
