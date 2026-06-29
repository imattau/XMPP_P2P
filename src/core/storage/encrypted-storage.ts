import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, createHash, timingSafeEqual } from 'crypto'
import type { XmppStorage, StorageRecord } from './types.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT_LENGTH = 16
const PBKDF2_ITERATIONS = 100000
const CRYPTO_NS = '_crypto'

function hashKey(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64').slice(0, 16)
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decrypt(stored: string, key: Buffer): string {
  const raw = Buffer.from(stored, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
}

export class EncryptedStorage implements XmppStorage {
  private key: Buffer | null = null
  private _unlocked = false
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly inner: XmppStorage,
    private readonly autoLockTimeoutMs: number = 300000
  ) {}

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this._unlocked) {
      this.idleTimer = setTimeout(() => {
        this.lock()
      }, this.autoLockTimeoutMs)
    }
  }

  get unlocked(): boolean {
    return this._unlocked
  }

  async isStorageEncrypted(): Promise<boolean> {
    const salt = await this.inner.getRecord(CRYPTO_NS, 'salt')
    return salt !== undefined
  }

  async verifyPassphrase(passphrase: string): Promise<boolean> {
    const saltRaw = await this.inner.getRecord(CRYPTO_NS, 'salt')
    const verificationRaw = await this.inner.getRecord(CRYPTO_NS, 'verification')
    if (!saltRaw || !verificationRaw) return false
    const salt = Buffer.from(saltRaw, 'base64')
    const key = deriveKey(passphrase, salt)
    const hash = hashKey(key)
    try {
      return timingSafeEqual(Buffer.from(hash), Buffer.from(verificationRaw))
    } catch {
      return hash === verificationRaw
    }
  }

  async initialize(passphrase: string): Promise<void> {
    const saltRaw = await this.inner.getRecord(CRYPTO_NS, 'salt')
    if (!saltRaw) {
      const salt = randomBytes(SALT_LENGTH)
      this.key = deriveKey(passphrase, salt)
      const verification = hashKey(this.key)
      await this.inner.putRecord(CRYPTO_NS, 'salt', salt.toString('base64'), new Date().toISOString())
      await this.inner.putRecord(CRYPTO_NS, 'verification', verification, new Date().toISOString())
    } else {
      const salt = Buffer.from(saltRaw, 'base64')
      this.key = deriveKey(passphrase, salt)
    }
    this._unlocked = true
    this.resetIdleTimer()
  }

  lock(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.key = null
    this._unlocked = false
  }

  async migrateFromPlaintext(passphrase: string, records: StorageRecord[]): Promise<number> {
    await this.initialize(passphrase)
    if (!this.key) return 0
    let count = 0
    for (const record of records) {
      if (record.key.startsWith(CRYPTO_NS)) continue
      try {
        const encrypted = encrypt(record.value, this.key)
        await this.inner.putRecord(record.key, record.value, encrypted, record.updatedAt)
        count++
      } catch {}
    }
    return count
  }

  async getRecord(namespace: string, key: string): Promise<string | undefined> {
    this.resetIdleTimer()
    if (namespace === CRYPTO_NS || !this.key) {
      return this.inner.getRecord(namespace, key)
    }
    const stored = await this.inner.getRecord(namespace, key)
    if (stored === undefined) return undefined
    try {
      return decrypt(stored, this.key)
    } catch {
      return stored
    }
  }

  async putRecord(namespace: string, key: string, value: string, updatedAt: string): Promise<void> {
    this.resetIdleTimer()
    if (namespace === CRYPTO_NS || !this.key) {
      return this.inner.putRecord(namespace, key, value, updatedAt)
    }
    const encrypted = encrypt(value, this.key)
    return this.inner.putRecord(namespace, key, encrypted, updatedAt)
  }

  async deleteRecord(namespace: string, key: string): Promise<void> {
    this.resetIdleTimer()
    return this.inner.deleteRecord(namespace, key)
  }

  async listRecords(namespace: string): Promise<StorageRecord[]> {
    this.resetIdleTimer()
    return this.inner.listRecords(namespace)
  }

  async getBlob(namespace: string, key: string): Promise<Uint8Array | undefined> {
    this.resetIdleTimer()
    return this.inner.getBlob(namespace, key)
  }

  async putBlob(namespace: string, key: string, data: Uint8Array): Promise<void> {
    this.resetIdleTimer()
    return this.inner.putBlob(namespace, key, data)
  }

  async deleteBlob(namespace: string, key: string): Promise<void> {
    this.resetIdleTimer()
    return this.inner.deleteBlob(namespace, key)
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    return this.inner.close()
  }
}
