import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type {
  XmppAttachment,
  XmppCollectionNode,
  XmppCollectionPost,
  XmppFeedFollower,
  XmppFeedPost,
  XmppFeedSubscriptionRecord,
  XmppMucMessage,
  XmppMucRoomSettings,
  XmppRosterEntry,
  XmppVCardProfile
} from './xmpp-records.js'
import type { XmppPersistenceLoadContext, XmppPersistenceSaveContext } from './xmpp-persistence.js'

type SqliteRecord = {
  recordKey: string
  updatedAt: string
  payload: string
}

export class XmppSqliteStore {
  private db?: DatabaseSync

  constructor(private readonly dbPath: string) {}

  async loadSnapshot(ctx: XmppPersistenceLoadContext): Promise<boolean> {
    if (!existsSync(this.dbPath)) {
      return false
    }

    const db = this.open()
    let loadedAny = false

    loadedAny = await this.loadRoster(db, ctx) || loadedAny
    loadedAny = await this.loadFeedHistory(db, ctx) || loadedAny
    loadedAny = await this.loadFeedSubscriptions(db, ctx) || loadedAny
    loadedAny = await this.loadFollowers(db, ctx) || loadedAny
    loadedAny = await this.loadCollections(db, ctx) || loadedAny
    loadedAny = await this.loadCollectionPosts(db, ctx) || loadedAny
    loadedAny = await this.loadAttachments(db, ctx) || loadedAny
    loadedAny = await this.loadMucRooms(db, ctx) || loadedAny
    loadedAny = await this.loadMucHistory(db, ctx) || loadedAny
    loadedAny = await this.loadVCard(db, ctx) || loadedAny

    return loadedAny
  }

  async persistSnapshot(ctx: XmppPersistenceSaveContext): Promise<void> {
    const db = this.open()

    db.exec('BEGIN IMMEDIATE')
    try {
      this.replaceNamespace(db, 'roster', Array.from(ctx.roster.values()).map((entry) => ({
        recordKey: entry.jid,
        updatedAt: entry.updatedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'feed_history', Array.from(ctx.feedHistory.values()).map((entry) => ({
        recordKey: `${entry.topic}:${entry.id}`,
        updatedAt: entry.updatedAt ?? entry.publishedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'feed_subscriptions', Array.from(ctx.feedSubscriptions.values()).map((entry) => ({
        recordKey: entry.topic,
        updatedAt: entry.updatedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'followers', Array.from(ctx.followers.values()).map((entry) => ({
        recordKey: `${entry.feedPeerId}:${entry.followerPeerId}`,
        updatedAt: entry.updatedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'collections', Array.from(ctx.collections.values()).map((entry) => ({
        recordKey: entry.id,
        updatedAt: entry.updatedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'collection_posts', Array.from(ctx.collectionHistory.values()).map((entry) => ({
        recordKey: `${entry.collectionId}:${entry.id}`,
        updatedAt: entry.updatedAt ?? entry.publishedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'attachments', Array.from(ctx.attachmentHistory.values()).map((entry) => ({
        recordKey: `${entry.topic}:${entry.targetId}:${entry.from}`,
        updatedAt: entry.receivedAt ?? entry.publishedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'muc_rooms', Array.from(ctx.mucRooms.values()).map((entry) => ({
        recordKey: entry.roomName,
        updatedAt: entry.updatedAt,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'muc_history', Array.from(ctx.mucHistory.values()).map((entry) => ({
        recordKey: `${entry.room}:${entry.id}`,
        updatedAt: entry.timestamp,
        payload: JSON.stringify(entry)
      })))
      this.replaceNamespace(db, 'vcard', [{
        recordKey: 'self',
        updatedAt: new Date().toISOString(),
        payload: JSON.stringify(ctx.vCard)
      }])
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  close() {
    this.db?.close()
    this.db = undefined
  }

  private open(): DatabaseSync {
    if (!this.db) {
      mkdirSync(dirname(this.dbPath), { recursive: true })
      this.db = new DatabaseSync(this.dbPath)
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS state_records (
          namespace TEXT NOT NULL,
          record_key TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload TEXT NOT NULL,
          PRIMARY KEY (namespace, record_key)
        );
        CREATE INDEX IF NOT EXISTS idx_state_records_namespace_updated_at
          ON state_records(namespace, updated_at DESC);
      `)
    }

    return this.db
  }

  private replaceNamespace(db: DatabaseSync, namespace: string, records: SqliteRecord[]) {
    const deleteStatement = db.prepare('DELETE FROM state_records WHERE namespace = ?')
    const insertStatement = db.prepare(
      'INSERT INTO state_records (namespace, record_key, updated_at, payload) VALUES (?, ?, ?, ?)'
    )

    deleteStatement.run(namespace)
    for (const record of records) {
      insertStatement.run(namespace, record.recordKey, record.updatedAt || '', record.payload)
    }
  }

  private loadRows(db: DatabaseSync, namespace: string): SqliteRecord[] {
    const statement = db.prepare(
      'SELECT record_key AS recordKey, updated_at AS updatedAt, payload FROM state_records WHERE namespace = ? ORDER BY updated_at ASC, record_key ASC'
    )
    return statement.all(namespace) as SqliteRecord[]
  }

  private async loadRoster(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'roster')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppRosterEntry
      const normalized = ctx.normalizeRosterEntry(parsed)
      ctx.roster.set(normalized.jid, normalized)
    }
    return rows.length > 0
  }

  private async loadFeedHistory(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'feed_history')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppFeedPost
      const normalized = ctx.normalizeFeedPost(parsed)
      ctx.feedHistory.set(ctx.feedHistoryKey(normalized.topic, normalized.id), normalized)
    }
    return rows.length > 0
  }

  private async loadFeedSubscriptions(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'feed_subscriptions')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppFeedSubscriptionRecord
      const normalized = ctx.normalizeFeedSubscription(parsed)
      ctx.feedSubscriptions.set(normalized.topic, normalized)
    }
    return rows.length > 0
  }

  private async loadFollowers(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'followers')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppFeedFollower
      const normalized = ctx.normalizeFollower(parsed)
      ctx.followers.set(ctx.followerKey(normalized.feedPeerId, normalized.followerPeerId), normalized)
    }
    return rows.length > 0
  }

  private async loadCollections(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'collections')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppCollectionNode
      const normalized = ctx.normalizeCollection(parsed)
      ctx.collections.set(normalized.id, normalized)
    }
    return rows.length > 0
  }

  private async loadCollectionPosts(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'collection_posts')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppCollectionPost
      const normalized = ctx.normalizeCollectionPost(parsed)
      ctx.collectionHistory.set(ctx.collectionHistoryKey(normalized.collectionId, normalized.id), normalized)
    }
    return rows.length > 0
  }

  private async loadAttachments(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'attachments')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppAttachment
      const normalized = ctx.normalizeAttachment(parsed)
      ctx.attachmentHistory.set(ctx.attachmentHistoryKey(normalized.topic, normalized.targetId, normalized.from), normalized)
    }
    return rows.length > 0
  }

  private async loadMucRooms(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'muc_rooms')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppMucRoomSettings
      const normalized = ctx.normalizeMucRoomSettings(parsed)
      ctx.mucRooms.set(normalized.roomName, normalized)
    }
    return rows.length > 0
  }

  private async loadMucHistory(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'muc_history')
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as XmppMucMessage
      const normalized = ctx.normalizeMucMessage(parsed)
      ctx.mucHistory.set(ctx.mucHistoryKey(normalized.room, normalized.id), normalized)
    }
    return rows.length > 0
  }

  private async loadVCard(db: DatabaseSync, ctx: XmppPersistenceLoadContext): Promise<boolean> {
    const rows = this.loadRows(db, 'vcard')
    if (rows.length === 0) {
      return false
    }

    const parsed = JSON.parse(rows[0].payload) as XmppVCardProfile
    ctx.vCard.fn = parsed.fn?.trim() || ctx.vCard.fn
    ctx.vCard.nickname = ctx.vCard.nickname || parsed.nickname?.trim() || undefined
    if (parsed.photo?.type && parsed.photo.binval) {
      ctx.vCard.photo = {
        type: parsed.photo.type.trim(),
        binval: parsed.photo.binval.trim()
      }
    }
    return true
  }
}
