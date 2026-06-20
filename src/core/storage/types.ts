/**
 * @fileoverview Storage interface that XmppNode and its managers will use for all
 * persisted state (records) and binary data (blobs), so that Node and browser
 * builds can supply different backing implementations without protocol code
 * needing to know which one is in use.
 */

/**
 * One persisted record entry returned by `listRecords`.
 */
export interface StorageRecord {
  key: string
  value: string
  updatedAt: string
}

/**
 * Unified storage surface for serialized records and binary blobs.
 */
export interface XmppStorage {
  getRecord(namespace: string, key: string): Promise<string | undefined>
  putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void>
  deleteRecord(namespace: string, key: string): Promise<void>
  listRecords(namespace: string): Promise<StorageRecord[]>

  getBlob(namespace: string, key: string): Promise<Uint8Array | undefined>
  putBlob(namespace: string, key: string, data: Uint8Array): Promise<void>
  deleteBlob(namespace: string, key: string): Promise<void>

  close(): Promise<void>
}
