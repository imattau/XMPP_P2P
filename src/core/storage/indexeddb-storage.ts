/**
 * @packageDocumentation IndexedDB-backed XmppStorage implementation for the browser build.
 * One database with two object stores: "records" (keyed by [namespace, key]) and
 * "blobs" (keyed by [namespace, key]). Designed to also run under Node tests via
 * the fake-indexeddb polyfill.
 */

import type { XmppStorage, StorageRecord } from './types.js'

const RECORDS_STORE = 'records'
const BLOBS_STORE = 'blobs'

interface RecordRow {
  namespace: string
  key: string
  value: string
  updatedAt: string
}

interface BlobRow {
  namespace: string
  key: string
  data: Uint8Array
}

export class IndexedDbStorage implements XmppStorage {
  private dbPromise?: Promise<IDBDatabase>

  /**
   * Creates a storage wrapper backed by IndexedDB.
   *
   * @param dbName - Database name to open in the browser.
   */
  constructor(private readonly dbName: string) {}

  /**
   * Reads a serialized record from IndexedDB.
   */
  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    const db = await this.open()
    const row = await this.get<RecordRow>(db, RECORDS_STORE, [namespace, key])
    return row?.value
  }

  /**
   * Writes or updates a serialized record in IndexedDB.
   */
  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    const db = await this.open()
    await this.put<RecordRow>(db, RECORDS_STORE, { namespace, key, value, updatedAt })
  }

  /**
   * Deletes a serialized record from IndexedDB.
   */
  async deleteRecord(namespace: string, key: string): Promise<void> {
    const db = await this.open()
    await this.delete(db, RECORDS_STORE, [namespace, key])
  }

  /**
   * Lists all records in a namespace ordered by update timestamp.
   */
  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const db = await this.open()
    const rows = await this.getAllByNamespace<RecordRow>(db, RECORDS_STORE, namespace)
    return rows
      .map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt }))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.key.localeCompare(b.key))
  }

  /**
   * Reads a binary blob from IndexedDB.
   */
  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    const db = await this.open()
    const row = await this.get<BlobRow>(db, BLOBS_STORE, [namespace, key])
    return row?.data
  }

  /**
   * Writes or updates a binary blob in IndexedDB.
   */
  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    const db = await this.open()
    await this.put<BlobRow>(db, BLOBS_STORE, { namespace, key, data })
  }

  /**
   * Deletes a binary blob from IndexedDB.
   */
  async deleteBlob(namespace: string, key: string): Promise<void> {
    const db = await this.open()
    await this.delete(db, BLOBS_STORE, [namespace, key])
  }

  /**
   * Closes the cached database connection.
   */
  async close(): Promise<void> {
    if (!this.dbPromise) {
      return
    }
    const db = await this.dbPromise
    db.close()
    this.dbPromise = undefined
  }

  /**
   * Opens the database and creates stores on first use.
   */
  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 2)
        request.onupgradeneeded = (evt) => {
          const db = request.result
          if (!db.objectStoreNames.contains(RECORDS_STORE)) {
            const store = db.createObjectStore(RECORDS_STORE, { keyPath: ['namespace', 'key'] })
            store.createIndex('namespace_idx', 'namespace', { unique: false })
          } else if (evt.oldVersion < 2) {
            const tx = request.transaction!
            const store = tx.objectStore(RECORDS_STORE)
            if (!store.indexNames.contains('namespace_idx')) {
              store.createIndex('namespace_idx', 'namespace', { unique: false })
            }
          }
          if (!db.objectStoreNames.contains(BLOBS_STORE)) {
            db.createObjectStore(BLOBS_STORE, { keyPath: ['namespace', 'key'] })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }

    return this.dbPromise
  }

  private get<T>(db: IDBDatabase, storeName: string, key: [string, string]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  }

  private put<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private delete(db: IDBDatabase, storeName: string, key: [string, string]): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private getAllByNamespace<T extends { namespace: string }>(db: IDBDatabase, storeName: string, namespace: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const results: T[] = []
      const store = db.transaction(storeName, 'readonly').objectStore(storeName)
      const index = store.index('namespace_idx')
      const request = index.openCursor(IDBKeyRange.only(namespace))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(results)
          return
        }
        results.push(cursor.value as T)
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  }
}
