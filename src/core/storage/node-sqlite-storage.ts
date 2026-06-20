/**
 * @packageDocumentation sqlite-backed XmppStorage implementation for the Node build.
 * Reuses the namespace/key/updated_at/payload schema already proven by
 * XmppSqliteStore, extended with a blobs table for binary data (uploads).
 */

import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { XmppStorage, StorageRecord } from './types.js'

export class NodeSqliteStorage implements XmppStorage {
  private db?: DatabaseSync

  /**
   * Creates a storage wrapper backed by a SQLite database file.
   *
   * @param dbPath - Path to the SQLite database file.
   */
  constructor(private readonly dbPath: string) {}

  /**
   * Reads a serialized record from SQLite.
   *
   * @param namespace - Logical storage namespace.
   * @param key - Record key within the namespace.
   * @returns The stored value or `undefined`.
   */
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    const db = this.open()
    const row = db
      .prepare('SELECT payload FROM state_records WHERE namespace = ? AND record_key = ?')
      .get(namespace, key) as { payload: string } | undefined
    return row?.payload
  }

  /**
   * Writes or updates a serialized record in SQLite.
   *
   * @param namespace - Logical storage namespace.
   * @param key - Record key within the namespace.
   * @param value - Serialized payload.
   * @param updatedAt - Update timestamp stored alongside the payload.
   * @returns Nothing.
   */
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    const db = this.open()
    db.prepare(
      `INSERT INTO state_records (namespace, record_key, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, record_key) DO UPDATE SET updated_at = excluded.updated_at, payload = excluded.payload`
    ).run(namespace, key, updatedAt, value)
  }

  /**
   * Deletes a serialized record from SQLite.
   *
   * @param namespace - Logical storage namespace.
   * @param key - Record key within the namespace.
   * @returns Nothing.
   */
  async deleteRecord(namespace: string, key: string): Promise<void> {
    const db = this.open()
    db.prepare('DELETE FROM state_records WHERE namespace = ? AND record_key = ?').run(namespace, key)
  }

  /**
   * Lists all records in a namespace ordered by age.
   *
   * @param namespace - Logical storage namespace.
   * @returns The stored records.
   */
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const db = this.open()
    const rows = db
      .prepare(
        'SELECT record_key AS key, updated_at AS updatedAt, payload AS value FROM state_records WHERE namespace = ? ORDER BY updated_at ASC, record_key ASC'
      )
      .all(namespace) as unknown as StorageRecord[]
    return rows
  }

  /**
   * Reads a binary blob from SQLite.
   *
   * @param namespace - Logical storage namespace.
   * @param key - Blob key within the namespace.
   * @returns The stored bytes or `undefined`.
   */
  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    const db = this.open()
    const row = db
      .prepare('SELECT data FROM state_blobs WHERE namespace = ? AND blob_key = ?')
      .get(namespace, key) as { data: Uint8Array } | undefined
    return row?.data ? new Uint8Array(row.data) : undefined
  }

  /**
   * Writes or updates a binary blob in SQLite.
   *
   * @param namespace - Logical storage namespace.
   * @param key - Blob key within the namespace.
   * @param data - Binary payload to store.
   * @returns Nothing.
   */
  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    const db = this.open()
    db.prepare(
      `INSERT INTO state_blobs (namespace, blob_key, data) VALUES (?, ?, ?)
       ON CONFLICT(namespace, blob_key) DO UPDATE SET data = excluded.data`
    ).run(namespace, key, data)
  }

  /**
   * Deletes a binary blob from SQLite.
   *
   * @param namespace - Logical storage namespace.
   * @param key - Blob key within the namespace.
   * @returns Nothing.
   */
  async deleteBlob(namespace: string, key: string): Promise<void> {
    const db = this.open()
    db.prepare('DELETE FROM state_blobs WHERE namespace = ? AND blob_key = ?').run(namespace, key)
  }

  /**
   * Closes the underlying SQLite database handle if it is open.
   *
   * @returns Nothing.
   */
  async close(): Promise<void> {
    this.db?.close()
    this.db = undefined
  }

  /**
   * Lazily opens the database and creates the schema if needed.
   *
   * @returns The open SQLite database connection.
   */
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
