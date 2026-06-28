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

export type BridgeVCard = {
  fn?: string
  nickname?: string
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
  server?: string
  subject?: string
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
  publishFeed(
    body: string,
    options?: {
      topic?: string
      itemId?: string
      title?: string
      summary?: string
      categories?: string[]
      author?: string
    }
  ): Promise<string>
  subscribeFeed(peerAddr: string, options?: { visibility?: BridgeVisibility }): Promise<BridgeFeedSubscriptionRecord>
  setFeedSubscriptionVisibility(peerAddr: string, visibility: BridgeVisibility): Promise<BridgeFeedSubscriptionRecord>
  unsubscribeFeed(peerAddr: string): Promise<void>
  getFeedSubscriptions(): Promise<BridgeFeedSubscriptionRecord[]>
  getPublicFeedSubscriptions(): Promise<BridgeFeedSubscriptionRecord[]>
  watchFeedFollowers(peerAddr: string): Promise<{ peerId: string; topic: string; watchedAt: string }>
  getFeedFollowers(peerAddr: string): Promise<BridgeFeedFollower[]>
  getCollections(): Promise<BridgeCollectionNode[]>
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
    }
  ): Promise<{ roomName: string; roomJid: string }>
  getMucRoomSettings(roomName: string): Promise<BridgeMucRoomSettings | undefined>
  updateMucRoomSettings(roomName: string, settings: BridgeMucRoomSettings): Promise<void>
  sendChatMessage(
    target: BridgeChatTarget,
    body: string,
    options?: {
      attachments?: BridgeChatAttachment[]
      replyTo?: string
      reply?: {
        id: string
        to?: string
      }
      thread?: string
    }
  ): Promise<string>
  getVCard(): Promise<BridgeVCard>
  setVCard(profile: BridgeVCard): Promise<BridgeVCard>
  broadcastPresence(type?: BridgePresenceType, status?: string, show?: string, nickname?: string): Promise<void>
  getRosterEntries(): Promise<Array<{ jid: string; name?: string; nickname?: string; updatedAt: string }>>

  onMessage(cb: (msg: { from: string; to: string; body: string; id: string; type?: string; encrypted?: boolean; delay?: { stamp: string; from?: string } }) => void): () => void
  onPresence(cb: (presence: { from: string; to: string; type?: string; show?: string; status?: string; nickname?: string }) => void): () => void
  onFeedPost(cb: (post: BridgeFeedPostRecord) => void): () => void
  onConnectionChange(cb: (peerId: string, connected: boolean) => void): () => void
}

declare global {
  interface Window {
    __XMPP_P2P_BRIDGE__?: XmppRuntimeBridge
  }
}

export function getBrowserXmppBridge(): XmppRuntimeBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.__XMPP_P2P_BRIDGE__
}
