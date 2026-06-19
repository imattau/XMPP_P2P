/**
 * @fileoverview IndexedDB-backed XmppStorage implementation for the browser build.
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

  constructor(private readonly dbName: string) {}

  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    const db = await this.open()
    const row = await this.get<RecordRow>(db, RECORDS_STORE, [namespace, key])
    return row?.value
  }

  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    const db = await this.open()
    await this.put<RecordRow>(db, RECORDS_STORE, { namespace, key, value, updatedAt })
  }

  async deleteRecord(namespace: string, key: string): Promise<void> {
    const db = await this.open()
    await this.delete(db, RECORDS_STORE, [namespace, key])
  }

  async listRecords(namespace: string): Promise<StorageRecord[]> {
    const db = await this.open()
    const rows = await this.getAllByNamespace<RecordRow>(db, RECORDS_STORE, namespace)
    return rows
      .map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt }))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.key.localeCompare(b.key))
  }

  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    const db = await this.open()
    const row = await this.get<BlobRow>(db, BLOBS_STORE, [namespace, key])
    return row?.data
  }

  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    const db = await this.open()
    await this.put<BlobRow>(db, BLOBS_STORE, { namespace, key, data })
  }

  async deleteBlob(namespace: string, key: string): Promise<void> {
    const db = await this.open()
    await this.delete(db, BLOBS_STORE, [namespace, key])
  }

  async close(): Promise<void> {
    if (!this.dbPromise) {
      return
    }
    const db = await this.dbPromise
    db.close()
    this.dbPromise = undefined
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(RECORDS_STORE)) {
            db.createObjectStore(RECORDS_STORE, { keyPath: ['namespace', 'key'] })
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
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(results)
          return
        }
        const value = cursor.value as T
        if (value.namespace === namespace) {
          results.push(value)
        }
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  }
}
