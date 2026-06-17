import { promises as fs } from 'fs'
import { dirname } from 'path'
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
  type XmppOpenPgpStateFile,
  type XmppRosterEntry,
  type XmppRosterFile,
  type XmppSubscriptionFile
} from './xmpp-records.js'

export interface XmppPersistenceLoadContext {
  rosterPath: string
  feedPath: string
  subscriptionPath: string
  followerPath: string
  collectionPath: string
  attachmentPath: string
  openPgpPath: string
  roster: Map<string, XmppRosterEntry>
  feedHistory: Map<string, XmppFeedPost>
  feedSubscriptions: Map<string, XmppFeedSubscriptionRecord>
  followers: Map<string, XmppFeedFollower>
  collections: Map<string, XmppCollectionNode>
  collectionHistory: Map<string, XmppCollectionPost>
  attachmentHistory: Map<string, XmppAttachment>
  normalizeRosterEntry: (entry: Partial<XmppRosterEntry> & { jid: string }) => XmppRosterEntry
  normalizeFeedPost: (entry: Partial<XmppFeedPost> & { id: string; topic: string; from: string; body: string }) => XmppFeedPost
  normalizeFeedSubscription: (entry: Partial<XmppFeedSubscriptionRecord> & { peerId: string; jid: string; topic: string }) => XmppFeedSubscriptionRecord
  normalizeFollower: (entry: Partial<XmppFeedFollower> & { followerPeerId: string; followerJid: string; feedPeerId: string; feedTopic: string }) => XmppFeedFollower
  normalizeCollection: (entry: Partial<XmppCollectionNode> & { id: string }) => XmppCollectionNode
  normalizeCollectionPost: (entry: Partial<XmppCollectionPost> & { id: string; collectionId: string; topic: string; sourceTopic: string; from: string; body: string }) => XmppCollectionPost
  normalizeAttachment: (entry: Partial<XmppAttachment> & { id: string; topic: string; targetId: string; from: string; kind: XmppAttachment['kind'] }) => XmppAttachment
  feedHistoryKey: (topic: string, id: string) => string
  feedSubscriptionKey: (topic: string) => string
  followerKey: (feedPeerId: string, followerPeerId: string) => string
  collectionHistoryKey: (collectionId: string, id: string) => string
  attachmentHistoryKey: (topic: string, targetId: string, from: string) => string
  restoreFeedSubscriptions: () => Promise<void>
  restoreFollowerSubscriptions: () => Promise<void>
  restoreCollectionSubscriptions: () => Promise<void>
  onCollectionLoaded: (collection: XmppCollectionNode) => void
}

export interface XmppPersistenceSaveContext {
  rosterPath: string
  feedPath: string
  subscriptionPath: string
  followerPath: string
  collectionPath: string
  attachmentPath: string
  openPgpPath: string
  roster: Map<string, XmppRosterEntry>
  feedHistory: Map<string, XmppFeedPost>
  feedSubscriptions: Map<string, XmppFeedSubscriptionRecord>
  followers: Map<string, XmppFeedFollower>
  collections: Map<string, XmppCollectionNode>
  collectionHistory: Map<string, XmppCollectionPost>
  attachmentHistory: Map<string, XmppAttachment>
  openPgpState?: XmppOpenPgpStateFile
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      throw err
    }
    return undefined
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

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
    const parsed = await readJson<XmppRosterFile | XmppRosterEntry[]>(ctx.rosterPath)
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries
    for (const entry of entries ?? []) {
      const normalized = ctx.normalizeRosterEntry(entry)
      ctx.roster.set(normalized.jid, normalized)
    }
  } catch (err: any) {
    console.error(`[XMPP] Failed to load roster from ${ctx.rosterPath}:`, err)
  }
}

export async function loadFeedHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readJson<XmppFeedFile | XmppFeedPost[]>(ctx.feedPath)
    const posts = Array.isArray(parsed) ? parsed : parsed?.posts
    for (const post of posts ?? []) {
      const normalized = ctx.normalizeFeedPost(post)
      ctx.feedHistory.set(ctx.feedHistoryKey(normalized.topic, normalized.id), normalized)
    }
    trimMap(ctx.feedHistory, limit)
  } catch (err: any) {
    console.error(`[XMPP] Failed to load feed history from ${ctx.feedPath}:`, err)
  }
}

export async function loadSubscriptionState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readJson<XmppSubscriptionFile | XmppFeedSubscriptionRecord[]>(ctx.subscriptionPath)
    const subscriptions = Array.isArray(parsed) ? parsed : parsed?.subscriptions
    for (const subscription of subscriptions ?? []) {
      const normalized = ctx.normalizeFeedSubscription(subscription)
      ctx.feedSubscriptions.set(normalized.topic, normalized)
    }
    trimMap(ctx.feedSubscriptions, limit)
    await ctx.restoreFeedSubscriptions()
  } catch (err: any) {
    console.error(`[XMPP] Failed to load subscription state from ${ctx.subscriptionPath}:`, err)
  }
}

export async function loadFollowerState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readJson<XmppFollowerFile | XmppFeedFollower[]>(ctx.followerPath)
    const followers = Array.isArray(parsed) ? parsed : parsed?.followers
    for (const follower of followers ?? []) {
      const normalized = ctx.normalizeFollower(follower)
      ctx.followers.set(ctx.followerKey(normalized.feedPeerId, normalized.followerPeerId), normalized)
    }
    trimMap(ctx.followers, limit)
    await ctx.restoreFollowerSubscriptions()
  } catch (err: any) {
    console.error(`[XMPP] Failed to load follower state from ${ctx.followerPath}:`, err)
  }
}

export async function loadCollectionState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readJson<XmppCollectionFile | XmppCollectionNode[]>(ctx.collectionPath)
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
    console.error(`[XMPP] Failed to load collection state from ${ctx.collectionPath}:`, err)
  }
}

export async function loadAttachmentHistoryState(ctx: XmppPersistenceLoadContext, limit: number): Promise<void> {
  try {
    const parsed = await readJson<XmppAttachmentFile | XmppAttachment[]>(ctx.attachmentPath)
    const attachments = Array.isArray(parsed) ? parsed : parsed?.attachments
    for (const attachment of attachments ?? []) {
      const normalized = ctx.normalizeAttachment(attachment)
      ctx.attachmentHistory.set(ctx.attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from), normalized)
    }
    trimMap(ctx.attachmentHistory, limit)
  } catch (err: any) {
    console.error(`[XMPP] Failed to load attachment history from ${ctx.attachmentPath}:`, err)
  }
}

export async function persistRosterState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppRosterFile = {
    version: 1,
    entries: Array.from(ctx.roster.values()).sort((a, b) => a.jid.localeCompare(b.jid))
  }
  await writeJson(ctx.rosterPath, payload)
}

export async function persistFeedHistoryState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppFeedFile = {
    version: 1,
    posts: Array.from(ctx.feedHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  await writeJson(ctx.feedPath, payload)
}

export async function persistSubscriptionState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppSubscriptionFile = {
    version: 1,
    subscriptions: Array.from(ctx.feedSubscriptions.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }
  await writeJson(ctx.subscriptionPath, payload)
}

export async function persistFollowerState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppFollowerFile = {
    version: 1,
    followers: Array.from(ctx.followers.values()).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt))
  }
  await writeJson(ctx.followerPath, payload)
}

export async function persistCollectionState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppCollectionFile = {
    version: 1,
    collections: Array.from(ctx.collections.values()).sort((a, b) => a.id.localeCompare(b.id)),
    posts: Array.from(ctx.collectionHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  await writeJson(ctx.collectionPath, payload)
}

export async function persistAttachmentHistoryState(ctx: XmppPersistenceSaveContext): Promise<void> {
  const payload: XmppAttachmentFile = {
    version: 1,
    attachments: Array.from(ctx.attachmentHistory.values()).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }
  await writeJson(ctx.attachmentPath, payload)
}

export async function persistOpenPgpState(path: string, state?: XmppOpenPgpStateFile): Promise<void> {
  if (!state) {
    return
  }
  await writeJson(path, state)
}
