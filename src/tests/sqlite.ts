import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { XmppSqliteStore } from '../core/xmpp-sqlite.js'
import {
  attachmentHistoryKey,
  collectionHistoryKey,
  createRosterEntry,
  feedHistoryKey,
  feedSubscriptionKey,
  followerKey,
  normalizeAttachment,
  normalizeCollection,
  normalizeCollectionMember,
  normalizeCollectionPost,
  normalizeFeedPost,
  normalizeFeedSubscription,
  normalizeFollower,
  normalizeMucMessage,
  normalizeMucRoomSettings,
  normalizeRosterEntry,
  type XmppAttachment,
  type XmppCollectionNode,
  type XmppCollectionPost,
  type XmppFeedFollower,
  type XmppFeedPost,
  type XmppFeedSubscriptionRecord,
  type XmppMucMessage,
  type XmppMucRoomSettings,
  type XmppRosterEntry,
  type XmppVCardProfile
} from '../core/xmpp-records.js'

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'xmpp-sqlite-'))
  const dbPath = join(dir, 'state.sqlite')
  const store = new XmppSqliteStore(dbPath)

  const roster = new Map<string, XmppRosterEntry>([
    ['alice@example.com', createRosterEntry('alice@example.com', 'Alice')]
  ])
  const feedHistory = new Map<string, XmppFeedPost>([
    ['xmpp-feed:test:post-1', {
      id: 'post-1',
      topic: 'xmpp-feed:test',
      from: 'alice@example.com',
      body: 'Hello from SQLite',
      publishedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      receivedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const feedSubscriptions = new Map<string, XmppFeedSubscriptionRecord>([
    ['xmpp-feed:test', {
      peerId: 'peer-a',
      jid: 'alice@example.com',
      topic: 'xmpp-feed:test',
      subscribedAt: '2026-01-01T00:00:00.000Z',
      visibility: 'public',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const followers = new Map<string, XmppFeedFollower>([
    ['peer-a:peer-b', {
      followerPeerId: 'peer-b',
      followerJid: 'bob@example.com',
      feedPeerId: 'peer-a',
      feedTopic: 'xmpp-feed:test',
      visibility: 'public',
      subscribedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const collections = new Map<string, XmppCollectionNode>([
    ['weekly', {
      id: 'weekly',
      name: 'Weekly Dev Chat',
      topic: 'xmpp-collection:weekly',
      members: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const collectionHistory = new Map<string, XmppCollectionPost>([
    ['weekly:post-1', {
      id: 'post-1',
      collectionId: 'weekly',
      topic: 'xmpp-collection:weekly',
      sourceTopic: 'xmpp-feed:test',
      from: 'alice@example.com',
      body: 'Collection post',
      publishedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      receivedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const attachmentHistory = new Map<string, XmppAttachment>([
    ['xmpp-feed:test:post-1:alice@example.com', {
      id: 'att-1',
      topic: 'xmpp-feed:test',
      targetId: 'post-1',
      from: 'alice@example.com',
      kind: 'reaction',
      value: '❤️',
      publishedAt: '2026-01-01T00:00:00.000Z',
      receivedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const mucRooms = new Map<string, XmppMucRoomSettings>([
    ['room@example.com', {
      roomName: 'room@example.com',
      topic: 'Room topic',
      communityId: 'weekly',
      defaultMode: 'secure',
      autoJoin: true,
      updatedAt: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const mucHistory = new Map<string, XmppMucMessage>([
    ['room@example.com:msg-1', {
      id: 'msg-1',
      room: 'room@example.com',
      from: 'alice@example.com',
      fromPeerId: 'peer-a',
      body: 'MUC history',
      timestamp: '2026-01-01T00:00:00.000Z'
    }]
  ])
  const vCard: XmppVCardProfile = {
    fn: 'Alice Example',
    nickname: 'Alice',
    photo: { type: 'image/png', binval: 'abc123' }
  }

  await store.persistSnapshot({
    rosterPath: '',
    feedPath: '',
    subscriptionPath: '',
    followerPath: '',
    collectionPath: '',
    attachmentPath: '',
    mucPath: '',
    mucHistoryPath: '',
    openPgpPath: '',
    vCardPath: '',
    roster,
    feedHistory,
    feedSubscriptions,
    followers,
    collections,
    collectionHistory,
    attachmentHistory,
    mucRooms,
    mucHistory,
    vCard
  } as any)

  const loadedRoster = new Map<string, XmppRosterEntry>()
  const loadedFeedHistory = new Map<string, XmppFeedPost>()
  const loadedFeedSubscriptions = new Map<string, XmppFeedSubscriptionRecord>()
  const loadedFollowers = new Map<string, XmppFeedFollower>()
  const loadedCollections = new Map<string, XmppCollectionNode>()
  const loadedCollectionHistory = new Map<string, XmppCollectionPost>()
  const loadedAttachmentHistory = new Map<string, XmppAttachment>()
  const loadedMucRooms = new Map<string, XmppMucRoomSettings>()
  const loadedMucHistory = new Map<string, XmppMucMessage>()
  const loadedVCard: XmppVCardProfile = {}

  const loaded = await store.loadSnapshot({
    rosterPath: '',
    feedPath: '',
    subscriptionPath: '',
    followerPath: '',
    collectionPath: '',
    attachmentPath: '',
    mucPath: '',
    mucHistoryPath: '',
    openPgpPath: '',
    roster: loadedRoster,
    feedHistory: loadedFeedHistory,
    feedSubscriptions: loadedFeedSubscriptions,
    followers: loadedFollowers,
    collections: loadedCollections,
    collectionHistory: loadedCollectionHistory,
    attachmentHistory: loadedAttachmentHistory,
    mucRooms: loadedMucRooms,
    mucHistory: loadedMucHistory,
    vCard: loadedVCard,
    normalizeRosterEntry,
    normalizeFeedPost,
    normalizeFeedSubscription,
    normalizeFollower,
    normalizeCollection,
    normalizeCollectionPost,
    normalizeAttachment,
    normalizeMucRoomSettings,
    normalizeMucMessage,
    feedHistoryKey,
    feedSubscriptionKey,
    followerKey,
    collectionHistoryKey,
    attachmentHistoryKey,
    mucHistoryKey: (room: string, id: string) => `${room}:${id}`,
    restoreFeedSubscriptions: async () => {},
    restoreFollowerSubscriptions: async () => {},
    restoreCollectionSubscriptions: async () => {},
    onCollectionLoaded: () => {}
  } as any)

  assert.equal(loaded, true)
  assert.equal(loadedRoster.size, 1)
  assert.equal(loadedFeedHistory.size, 1)
  assert.equal(loadedFeedSubscriptions.size, 1)
  assert.equal(loadedFollowers.size, 1)
  assert.equal(loadedCollections.size, 1)
  assert.equal(loadedCollectionHistory.size, 1)
  assert.equal(loadedAttachmentHistory.size, 1)
  assert.equal(loadedMucRooms.size, 1)
  assert.equal(loadedMucHistory.size, 1)
  assert.equal(loadedVCard.nickname, 'Alice')

  await store.close()
  await rm(dir, { recursive: true, force: true })
  console.log('SQLite persistence round-trip passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
