/**
 * @fileoverview sqlite-backed XmppStorage implementation for the Node build.
 * Reuses the namespace/key/updated_at/payload schema already proven by
 * XmppSqliteStore, extended with a blobs table for binary data (uploads).
 */

import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { XmppStorage, StorageRecord } from './types.js'

export class NodeSqliteStorage implements XmppStorage {
  private db?: DatabaseSync

  constructor(private readonly dbPath: string) {}

  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    const db = this.open()
    const row = db
      .prepare('SELECT payload FROM state_records WHERE namespace = ? AND record_key = ?')
      .get(namespace, key) as { payload: string } | undefined
    return row?.payload
  }

  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    const db = this.open()
    db.prepare(
      `INSERT INTO state_records (namespace, record_key, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, record_key) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`
    ).run(namespace, key, updatedAt, value)
  }

  async deleteRecord(namespace: string, key: string): Promise<void> {
    const db = this.open()
    db.prepare('DELETE FROM state_records WHERE namespace = ? AND record_key = ?').run(namespace, key)
  }

  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const db = this.open()
    const rows = db
      .prepare(
        'SELECT record_key AS key, updated_at AS updatedAt, payload AS value FROM state_records WHERE namespace = ? ORDER BY updated_at ASC, record_key ASC'
      )
      .all(namespace) as unknown as StorageRecord[]
    return rows
  }

  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    const db = this.open()
    const row = db
      .prepare('SELECT data FROM state_blobs WHERE namespace = ? AND blob_key = ?')
      .get(namespace, key) as { data: Uint8Array } | undefined
    return row?.data ? new Uint8Array(row.data) : undefined
  }

  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    const db = this.open()
    db.prepare(
      `INSERT INTO state_blobs (namespace, blob_key, data) VALUES (?, ?, ?)
       ON CONFLICT(namespace, blob_key) DO UPDATE SET data = excluded.data`
    ).run(namespace, key, data)
  }

  async deleteBlob(namespace: string, key: string): Promise<void> {
    const db = this.open()
    db.prepare('DELETE FROM state_blobs WHERE namespace = ? AND blob_key = ?').run(namespace, key)
  }

  async close(): Promise<void> {
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
        CREATE TABLE IF NOT EXISTS state_blobs (
          namespace TEXT NOT NULL,
          blob_key TEXT NOT NULL,
          data BLOB NOT NULL,
          PRIMARY KEY (namespace, blob_key)
        );
      `)
    }

    return this.db
  }
}
