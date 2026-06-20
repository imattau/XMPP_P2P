/**
 * @packageDocumentation Storage loaders and persistors for XMPP roster, feed, MUC,
 * attachment, and chat state.
 */

import type { XmppStorage } from './storage/types.js'
import {
  type XmppAttachment,
  type XmppAttachmentFile,
  type XmppCollectionFile,
  type XmppCollectionNode,
  type XmppCollectionPost,
  type XmppEncryptedTopicSecret,
  type XmppFeedFile,
  type XmppFeedFollower,
  type XmppFeedPost,
  type XmppFeedSubscriptionRecord,
  type XmppFollowerFile,
  type XmppMucFile,
  type XmppMucRoomSettings,
  type XmppMucMessage,
  type XmppMucHistoryFile,
  type XmppOpenPgpStateFile,
  type XmppRosterEntry,
  type XmppRosterFile,
  type XmppSubscriptionFile,
  type XmppVCardFile,
  type XmppVCardProfile,
  type XmppMessage,
  type XmppChatHistoryFile
} from './xmpp-records.js'

/**
 * State required when loading persisted XMPP data.
 */
export interface XmppPersistenceLoadContext {
  storage: XmppStorage
  roster: Map<string, XmppRosterEntry>
  feedHistory: Map<string, XmppFeedPost>
  feedSubscriptions: Map<string, XmppFeedSubscriptionRecord>
  followers: Map<string, XmppFeedFollower>
  collections: Map<string, XmppCollectionNode>
  collectionHistory: Map<string, XmppCollectionPost>
  attachmentHistory: Map<string, XmppAttachment>
  mucRooms: Map<string, XmppMucRoomSettings>
  mucHistory: Map<string, XmppMucMessage>
  chatHistory: Map<string, XmppMessage>
  vCard: XmppVCardProfile
  normalizeRosterEntry: (entry: Partial<XmppRosterEntry> & { jid: string }) => XmppRosterEntry
  normalizeFeedPost: (entry: Partial<XmppFeedPost> & { id: string; topic: string; from: string; body: string }) => XmppFeedPost
  normalizeFeedSubscription: (entry: Partial<XmppFeedSubscriptionRecord> & { peerId: string; jid: string; topic: string }) => XmppFeedSubscriptionRecord
  normalizeFollower: (entry: Partial<XmppFeedFollower> & { followerPeerId: string; followerJid: string; feedPeerId: string; feedTopic: string }) => XmppFeedFollower
  normalizeCollection: (entry: Partial<XmppCollectionNode> & { id: string }) => XmppCollectionNode
  normalizeCollectionPost: (entry: Partial<XmppCollectionPost> & { id: string; collectionId: string; topic: string; sourceTopic: string; from: string; body: string }) => XmppCollectionPost
  normalizeAttachment: (entry: Partial<XmppAttachment> & { id: string; topic: string; targetId: string; from: string; kind: XmppAttachment['kind'] }) => XmppAttachment
  normalizeMucRoomSettings: (entry: Partial<XmppMucRoomSettings> & { roomName: string }) => XmppMucRoomSettings
  normalizeMucMessage: (entry: Partial<XmppMucMessage> & { id: string; room: string; from: string; fromPeerId: string; body: string }) => XmppMucMessage
  feedHistoryKey: (topic: string, id: string) => string
  feedSubscriptionKey: (topic: string) => string
  followerKey: (feedPeerId: string, followerPeerId: string) => string
  collectionHistoryKey: (collectionId: string, id: string) => string
  attachmentHistoryKey: (topic: string, targetId: string, from: string) => string
  mucHistoryKey: (room: string, id: string) => string
  restoreFeedSubscriptions: () => Promise<void>
  restoreFollowerSubscriptions: () => Promise<void>
  restoreCollectionSubscriptions: () => Promise<void>
  onCollectionLoaded: (collection: XmppCollectionNode) => void
}

/**
 * State required when saving persisted XMPP data.
 */
export interface XmppPersistenceSaveContext {
  storage: XmppStorage
  roster: Map<string, XmppRosterEntry>
  feedHistory: Map<string, XmppFeedPost>
  feedSubscriptions: Map<string, XmppFeedSubscriptionRecord>
  followers: Map<string, XmppFeedFollower>
  collections: Map<string, XmppCollectionNode>
  collectionHistory: Map<string, XmppCollectionPost>
  attachmentHistory: Map<string, XmppAttachment>
  mucRooms: Map<string, XmppMucRoomSettings>
  mucHistory: Map<string, XmppMucMessage>
  chatHistory: Map<string, XmppMessage>
  vCard: XmppVCardProfile
  openPgpState?: XmppOpenPgpStateFile
}

async function readState<T>(storage: XmppStorage, namespace: string): Promise<T | undefined> {
  const raw = await storage.getRecord(namespace, 'state')
  if (raw === undefined) {
    return undefined
  }
  return JSON.parse(raw) as T
}

async function writeState(storage: XmppStorage, namespace: string, value: unknown): Promise<void> {
  await storage.putRecord(namespace, 'state', JSON.stringify(value), new Date().toISOString())
}

/**
 * Trims a map to the requested maximum size by deleting the oldest entries.
 */
function trimMap<K, V>(map: Map<K, V>, limit: number): void {
  while (map.size > limit) {
    const oldestKey = map.keys().next().value as K | undefined
    if (oldestKey == null) {
      break
    }
    map.delete(oldestKey)
  }
}

export async function loadRosterState(ctx: XmppPersistenceLoadContext): Promise<void> {
  try {
    const parsed = await readState<XmppRosterFile | XmppRosterEntry[]>(ctx.storage, 'roster')
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries
    for (const entry of entries ?? []) {
      const normalized = ctx.normalizeRosterEntry(entry)
      ctx.roster.set(normalized.jid, normalized)
    }
  } catch (err: any) {
    console.error('[XMPP] Failed to load roster from storage:', err)
  }
}

export async function loadFeedHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppFeedFile | XmppFeedPost[]>(ctx.storage, 'feed_history')
    const posts = Array.isArray(parsed) ? parsed : parsed?.posts
    for (const post of posts ?? []) {
      const normalized = ctx.normalizeFeedPost(post)
      ctx.feedHistory.set(ctx.feedHistoryKey(normalized.topic, normalized.id), normalized)
    }
    trimMap(ctx.feedHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load feed history from storage:', err)
  }
}

export async function loadSubscriptionState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppSubscriptionFile | XmppFeedSubscriptionRecord[]>(ctx.storage, 'feed_subscriptions')
    const subscriptions = Array.isArray(parsed) ? parsed : parsed?.subscriptions
    for (const subscription of subscriptions ?? []) {
      const normalized = ctx.normalizeFeedSubscription(subscription)
      ctx.feedSubscriptions.set(normalized.topic, normalized)
    }
    trimMap(ctx.feedSubscriptions, limit)
    await ctx.restoreFeedSubscriptions()
  } catch (err: any) {
    console.error('[XMPP] Failed to load subscription state from storage:', err)
  }
}

export async function loadFollowerState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppFollowerFile | XmppFeedFollower[]>(ctx.storage, 'followers')
    const followers = Array.isArray(parsed) ? parsed : parsed?.followers
    for (const follower of followers ?? []) {
      const normalized = ctx.normalizeFollower(follower)
      ctx.followers.set(ctx.followerKey(normalized.feedPeerId, normalized.followerPeerId), normalized)
    }
    trimMap(ctx.followers, limit)
    await ctx.restoreFollowerSubscriptions()
  } catch (err: any) {
    console.error('[XMPP] Failed to load follower state from storage:', err)
  }
}

export async function loadCollectionState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppCollectionFile | XmppCollectionNode[]>(ctx.storage, 'collections')
    const collections = Array.isArray(parsed) ? parsed : parsed?.collections
    const posts = Array.isArray(parsed) ? [] : parsed?.posts

    for (const collection of collections ?? []) {
      const normalized = ctx.normalizeCollection(collection)
      ctx.collections.set(normalized.id, normalized)
      ctx.onCollectionLoaded(normalized)
    }

    for (const post of posts ?? []) {
      const normalized = ctx.normalizeCollectionPost(post)
      ctx.collectionHistory.set(ctx.collectionHistoryKey(normalized.collectionId, normalized.id), normalized)
    }

    trimMap(ctx.collectionHistory, limit)
    await ctx.restoreCollectionSubscriptions()
  } catch (err: any) {
    console.error('[XMPP] Failed to load collection state from storage:', err)
  }
}

export async function loadAttachmentHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppAttachmentFile | XmppAttachment[]>(ctx.storage, 'attachments')
    const attachments = Array.isArray(parsed) ? parsed : parsed?.attachments
    for (const attachment of attachments ?? []) {
      const normalized = ctx.normalizeAttachment(attachment)
      ctx.attachmentHistory.set(ctx.attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from), normalized)
    }
    trimMap(ctx.attachmentHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load attachment history from storage:', err)
  }
}

export async function loadMucState(ctx: XmppPersistenceLoadContext): Promise<void> {
  try {
    const parsed = await readState<XmppMucFile | XmppMucRoomSettings[]>(ctx.storage, 'muc_rooms')
    const rooms = Array.isArray(parsed) ? parsed : parsed?.rooms
    for (const room of rooms ?? []) {
      const normalized = ctx.normalizeMucRoomSettings(room)
      ctx.mucRooms.set(normalized.roomName, normalized)
    }
  } catch (err: any) {
    console.error('[XMPP] Failed to load MUC state from storage:', err)
  }
}

export async function loadMucHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppMucHistoryFile | XmppMucMessage[]>(ctx.storage, 'muc_history')
    const messages = Array.isArray(parsed) ? parsed : parsed?.messages
    for (const msg of messages ?? []) {
      const normalized = ctx.normalizeMucMessage(msg)
      ctx.mucHistory.set(ctx.mucHistoryKey(normalized.room, normalized.id), normalized)
    }
    trimMap(ctx.mucHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load MUC history from storage:', err)
  }
}

export async function loadChatHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readState<XmppChatHistoryFile | XmppMessage[]>(ctx.storage, 'chat_history')
    const messages = Array.isArray(parsed) ? parsed : parsed?.messages
    for (const msg of messages ?? []) {
      ctx.chatHistory.set(msg.id || Math.random().toString(36).substring(2, 15), msg)
    }
    trimMap(ctx.chatHistory, limit)
  } catch (err: any) {
    console.error('[XMPP] Failed to load chat history from storage:', err)
  }
}

export async function loadVCardState(ctx: XmppPersistenceLoadContext): Promise<void> {
  try {
    const parsed = await readState<XmppVCardFile | XmppVCardProfile>(ctx.storage, 'vcard')
    const profile = parsed && typeof parsed === 'object' && 'profile' in parsed ? parsed.profile : parsed
    const photoType = profile?.photo?.type?.trim()
    const photoBinval = profile?.photo?.binval?.trim()
    const normalized = {
      fn: profile?.fn?.trim() || undefined,
      nickname: profile?.nickname?.trim() || undefined,
      photo: photoType && photoBinval
        ? {
            type: photoType,
            binval: photoBinval
          }
        : undefined
    }

    ctx.vCard.fn = normalized.fn ?? ctx.vCard.fn
    if (!ctx.vCard.nickname && normalized.nickname) {
      ctx.vCard.nickname = normalized.nickname
    }
    if (normalized.photo) {
      ctx.vCard.photo = normalized.photo
    }
  } catch (err: any) {
    console.error('[XMPP] Failed to load vCard from storage:', err)
  }
}

export async function persistRosterState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppRosterFile = {
    version: 1,
    entries: Array.from(ctx.roster.values()).sort((a, b) => a.jid.localeCompare(b.jid))
  }
  await writeState(ctx.storage, 'roster', payload)
}

export async function persistFeedHistoryState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppFeedFile = {
    version: 1,
    posts: Array.from(ctx.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  await writeState(ctx.storage, 'feed_history', payload)
}

export async function persistSubscriptionState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppSubscriptionFile = {
    version: 1,
    subscriptions: Array.from(ctx.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }
  await writeState(ctx.storage, 'feed_subscriptions', payload)
}

export async function persistFollowerState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppFollowerFile = {
    version: 1,
    followers: Array.from(ctx.followers.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }
  await writeState(ctx.storage, 'followers', payload)
}

export async function persistCollectionState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppCollectionFile = {
    version: 1,
    collections: Array.from(ctx.collections.values()).sort((a, b) => a.id.localeCompare(b.id)),
    posts: Array.from(ctx.collectionHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  await writeState(ctx.storage, 'collections', payload)
}

export async function persistAttachmentHistoryState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppAttachmentFile = {
    version: 1,
    attachments: Array.from(ctx.attachmentHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  await writeState(ctx.storage, 'attachments', payload)
}

export async function persistMucState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppMucFile = {
    version: 1,
    rooms: Array.from(ctx.mucRooms.values()).sort((a, b) => a.roomName.localeCompare(b.roomName))
  }
  await writeState(ctx.storage, 'muc_rooms', payload)
}

export async function persistMucHistoryState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppMucHistoryFile = {
    version: 1,
    messages: Array.from(ctx.mucHistory.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }
  await writeState(ctx.storage, 'muc_history', payload)
}

export async function persistChatHistoryState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppChatHistoryFile = {
    version: 1,
    messages: Array.from(ctx.chatHistory.values()).sort((a, b) => {
      const aStamp = a.delay?.stamp || ''
      const bStamp = b.delay?.stamp || ''
      return aStamp.localeCompare(bStamp)
    })
  }
  await writeState(ctx.storage, 'chat_history', payload)
}

export async function persistVCardState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppVCardFile = {
    version: 1,
    profile: {
      fn: ctx.vCard.fn?.trim() || undefined,
      nickname: ctx.vCard.nickname?.trim() || undefined,
      photo: ctx.vCard.photo?.type && ctx.vCard.photo.binval
        ? {
            type: ctx.vCard.photo.type.trim() || undefined,
            binval: ctx.vCard.photo.binval.trim() || undefined
          }
        : undefined
    }
  }
  await writeState(ctx.storage, 'vcard', payload)
}

export async function persistOpenPgpState(storage: XmppStorage, state?: XmppOpenPgpStateFile): Promise<void> {
  if (!state) {
    return
  }
  await writeState(storage, 'openpgp', state)
}
