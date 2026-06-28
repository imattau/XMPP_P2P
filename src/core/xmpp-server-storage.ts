import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { XmppStorage } from './storage/types.js'

export interface StoredComponentConfig {
  domain: string
  host: string
  port: number
  createdAt: string
  updatedAt: string
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32
const NAMESPACE = 'componentSecrets'

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, 'xmpp-component-creds-salt', KEY_LENGTH)
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted payload format')
  const [ivB64, tagB64, ciphertextB64] = parts
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8')
}

interface StoredRecord {
  domain: string
  host: string
  port: number
  secretEncrypted: string
  createdAt: string
  updatedAt: string
}

export class XmppComponentConfigStore {
  constructor(
    private readonly storage: XmppStorage,
    private readonly passphrase: string
  ) {}

  private getKey(): Buffer {
    return deriveKey(this.passphrase)
  }

  async save(domain: string, secret: string, host: string, port: number): Promise<void> {
    const key = this.getKey()
    const encrypted = encrypt(secret, key)
    const now = new Date().toISOString()
    const record: StoredRecord = {
      domain,
      host,
      port,
      secretEncrypted: encrypted,
      createdAt: now,
      updatedAt: now
    }
    await this.storage.putRecord(NAMESPACE, domain, JSON.stringify(record), now)
  }

  async load(domain: string): Promise<{ secret: string; host: string; port: number } | undefined> {
    const raw = await this.storage.getRecord(NAMESPACE, domain)
    if (!raw) return undefined
    const record = JSON.parse(raw) as StoredRecord
    const key = this.getKey()
    const secret = decrypt(record.secretEncrypted, key)
    return { secret, host: record.host, port: record.port }
  }

  async list(): Promise<StoredComponentConfig[]> {
    const records = await this.storage.listRecords(NAMESPACE)
    return records.map(r => {
      const parsed = JSON.parse(r.value) as StoredRecord
      const { secretEncrypted: _, ...rest } = parsed
      return rest
    })
  }

  async remove(domain: string): Promise<void> {
    await this.storage.deleteRecord(NAMESPACE, domain)
  }
}
