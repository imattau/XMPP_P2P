import { multiaddr, Multiaddr } from '@multiformats/multiaddr'

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
  nickname?: string
  encrypted?: boolean
  encryption?: 'openpgp' | 'omemo'
  receipt?: { type: 'request' | 'received'; id: string }
  chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
  delay?: { from?: string; stamp: string }
  replace?: string
  originId?: string
  stanzaId?: { id: string; by: string }
}

export interface XmppPresence {
  from: string
  to: string
  type?: XmppPresenceType | string
  status?: string
  show?: string
  nickname?: string
}

export interface XmppRosterPresenceState {
  type: 'available' | 'unavailable'
  status?: string
  show?: string
  nickname?: string
  receivedAt: string
}

export interface XmppRosterEntry {
  jid: string
  name?: string
  nickname?: string
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
  encrypted?: boolean
  encryption?: 'openpgp' | 'omemo'
  keyId?: string
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

export type XmppFeedVisibility = 'public' | 'private'

export interface XmppFeedSubscriptionRecord extends XmppFeedSubscription {
  visibility: XmppFeedVisibility
  updatedAt: string
}

export interface XmppFeedFollower {
  followerPeerId: string
  followerJid: string
  feedPeerId: string
  feedTopic: string
  visibility: XmppFeedVisibility
  subscribedAt: string
  updatedAt: string
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

export type XmppMucDefaultMode = 'secure' | 'open'

export interface XmppMucRoomSettings {
  roomName: string
  topic?: string
  communityId?: string
  defaultMode: XmppMucDefaultMode
  autoJoin: boolean
  updatedAt: string
}

export type XmppAttachmentKind = 'noticed' | 'reaction'

export interface XmppAttachment {
  id: string
  topic: string
  targetId: string
  from: string
  kind: XmppAttachmentKind
  value?: string
  publishedAt: string
  receivedAt: string
}

export interface XmppAttachmentSummary {
  topic: string
  targetId: string
  total: number
  noticed: number
  reactions: number
  reactionCounts: Record<string, number>
  updatedAt: string
}

export interface XmppRosterFile {
  version: number
  entries: XmppRosterEntry[]
}

export interface XmppFeedFile {
  version: number
  posts: XmppFeedPost[]
}

export interface XmppSubscriptionFile {
  version: number
  subscriptions: XmppFeedSubscriptionRecord[]
}

export interface XmppFollowerFile {
  version: number
  followers: XmppFeedFollower[]
}

export interface XmppFollowerWatch {
  peerId: string
  topic: string
  watchedAt: string
}

export interface XmppCollectionFile {
  version: number
  collections: XmppCollectionNode[]
  posts: XmppCollectionPost[]
}

export interface XmppAttachmentFile {
  version: number
  attachments: XmppAttachment[]
}

export interface XmppMucFile {
  version: number
  rooms: XmppMucRoomSettings[]
}

export interface XmppOpenPgpStateFile {
  version: number
  privateKey: string
  publicKey: string
  fingerprint: string
  createdAt: string
}

export interface XmppEncryptedTopicSecret {
  topic: string
  keyId: string
  secret: string
  updatedAt: string
}

export interface XmppUploadManifest {
  cid: string
  slotId?: string
  filename?: string
  contentType?: string
  size?: number
  getUrl: string
  providers?: XmppUploadProvider[]
  uploadedAt: string
  from: string
  topic?: string
}

export interface XmppUploadProvider {
  url: string
  jid?: string
}

export interface XmppUploadFile {
  version: number
  uploads: XmppUploadManifest[]
}

export interface XmppOpenPgpPublicKeyResponse {
  fingerprint: string
  publicKey: string
}

export interface XmppVCardProfile {
  fn?: string
  nickname?: string
}

export interface XmppVCardFile {
  version: number
  profile: XmppVCardProfile
}

export function normalizeVCardProfile(profile?: Partial<XmppVCardProfile>): XmppVCardProfile {
  const fn = profile?.fn?.trim()
  const nickname = profile?.nickname?.trim()

  return {
    fn: fn || undefined,
    nickname: nickname || undefined
  }
}

export function normalizeRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): XmppRosterEntry {
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
        nickname: entry.presence.nickname,
        receivedAt: entry.presence.receivedAt || new Date().toISOString()
      }
    : undefined

  return {
    jid: entry.jid,
    name: entry.name,
    nickname: entry.nickname ?? entry.presence?.nickname,
    groups,
    subscription,
    ask: entry.ask === 'subscribe' || entry.ask === 'unsubscribe' ? entry.ask : undefined,
    presence,
    updatedAt: entry.updatedAt || new Date().toISOString()
  }
}

export function createRosterEntry(jid: string, name?: string): XmppRosterEntry {
  return normalizeRosterEntry({
    jid,
    name,
    subscription: 'none',
    updatedAt: new Date().toISOString()
  })
}

export function parsePeerReference(peerAddr: string | Multiaddr): { peerId: string; dialTarget?: Multiaddr } {
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

export function subscriptionToFlags(subscription: XmppRosterSubscription): { to: boolean; from: boolean } {
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

export function flagsToSubscription(to: boolean, from: boolean): XmppRosterSubscription {
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

export function peerIdFromJid(jid: string): string {
  return jid.endsWith('@p2p') ? jid.slice(0, -4) : jid
}

export function jidFromPeerId(peerId: string): string {
  return `${peerId}@p2p`
}

export function feedTopicForPeer(peerId: string): string {
  return `xmpp-feed:${peerId}`
}

export function collectionTopicForId(id: string): string {
  return `xmpp-collection:${id}`
}

export function feedHistoryKey(topic: string, id: string): string {
  return `${topic}:${id}`
}

export function feedSubscriptionKey(topic: string): string {
  return topic
}

export function collectionHistoryKey(collectionId: string, id: string): string {
  return `${collectionId}:${id}`
}

export function attachmentHistoryKey(topic: string, targetId: string, from: string): string {
  return `${topic}:${targetId}:${from}`
}

export function followerKey(feedPeerId: string, followerPeerId: string): string {
  return `${feedPeerId}:${followerPeerId}`
}

export function followerTopicForPeer(peerId: string): string {
  return `xmpp-followers:${peerId}`
}

export function normalizeFeedPost(entry: Partial<XmppFeedPost> & { id: string; topic: string; from: string; body: string }): XmppFeedPost {
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

export function normalizeCollection(entry: Partial<XmppCollectionNode> & { id: string }): XmppCollectionNode {
  const members = Array.isArray(entry.members) ? entry.members.map(member => normalizeCollectionMember(member)) : []
  return {
    id: entry.id,
    name: entry.name,
    topic: entry.topic || collectionTopicForId(entry.id),
    members,
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString()
  }
}

export function normalizeCollectionMember(entry: Partial<XmppCollectionMember> & { jid: string; peerId: string; feedTopic: string }): XmppCollectionMember {
  return {
    jid: entry.jid,
    peerId: entry.peerId,
    feedTopic: entry.feedTopic,
    addedAt: entry.addedAt || new Date().toISOString()
  }
}

export function normalizeCollectionPost(entry: Partial<XmppCollectionPost> & { id: string; collectionId: string; topic: string; sourceTopic: string; from: string; body: string }): XmppCollectionPost {
  return {
    ...normalizeFeedPost(entry),
    collectionId: entry.collectionId,
    sourceTopic: entry.sourceTopic
  }
}

export function normalizeMucRoomSettings(entry: Partial<XmppMucRoomSettings> & { roomName: string }): XmppMucRoomSettings {
  return {
    roomName: entry.roomName,
    topic: entry.topic?.trim() || undefined,
    communityId: entry.communityId?.trim() || undefined,
    defaultMode: entry.defaultMode === 'open' ? 'open' : 'secure',
    autoJoin: entry.autoJoin !== false,
    updatedAt: entry.updatedAt || new Date().toISOString()
  }
}

export function normalizeFeedSubscription(entry: Partial<XmppFeedSubscriptionRecord> & { peerId: string; jid: string; topic: string }): XmppFeedSubscriptionRecord {
  return {
    peerId: entry.peerId,
    jid: entry.jid,
    topic: entry.topic,
    subscribedAt: entry.subscribedAt || new Date().toISOString(),
    visibility: entry.visibility === 'public' ? 'public' : 'private',
    updatedAt: entry.updatedAt || new Date().toISOString()
  }
}

export function normalizeFollower(entry: Partial<XmppFeedFollower> & { followerPeerId: string; followerJid: string; feedPeerId: string; feedTopic: string }): XmppFeedFollower {
  return {
    followerPeerId: entry.followerPeerId,
    followerJid: entry.followerJid,
    feedPeerId: entry.feedPeerId,
    feedTopic: entry.feedTopic,
    visibility: entry.visibility === 'public' ? 'public' : 'private',
    subscribedAt: entry.subscribedAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString()
  }
}

export function normalizeAttachment(entry: Partial<XmppAttachment> & { id: string; topic: string; targetId: string; from: string; kind: XmppAttachmentKind }): XmppAttachment {
  return {
    id: entry.id,
    topic: entry.topic,
    targetId: entry.targetId,
    from: entry.from,
    kind: entry.kind,
    value: entry.value,
    publishedAt: entry.publishedAt || new Date().toISOString(),
    receivedAt: entry.receivedAt || new Date().toISOString()
  }
}

export function buildAttachmentSummary(topic: string, targetId: string, attachments: XmppAttachment[]): XmppAttachmentSummary {
  const summary: XmppAttachmentSummary = {
    topic,
    targetId,
    total: attachments.length,
    noticed: 0,
    reactions: 0,
    reactionCounts: {},
    updatedAt: new Date().toISOString()
  }

  for (const attachment of attachments) {
    if (attachment.kind === 'noticed') {
      summary.noticed += 1
    } else {
      summary.reactions += 1
      if (attachment.value) {
        summary.reactionCounts[attachment.value] = (summary.reactionCounts[attachment.value] ?? 0) + 1
      }
    }
  }

  return summary
}

export interface XmppMucMessage {
  id: string
  room: string
  from: string
  fromPeerId: string
  body: string
  timestamp: string
  encrypted?: boolean
  encryption?: 'omemo'
}

export interface XmppMucHistoryFile {
  version: number
  messages: XmppMucMessage[]
}

export function normalizeMucMessage(entry: Partial<XmppMucMessage> & { id: string; room: string; from: string; fromPeerId: string; body: string }): XmppMucMessage {
  return {
    id: entry.id,
    room: entry.room,
    from: entry.from,
    fromPeerId: entry.fromPeerId,
    body: entry.body,
    timestamp: entry.timestamp || new Date().toISOString(),
    encrypted: entry.encrypted || undefined,
    encryption: entry.encryption || undefined
  }
}
