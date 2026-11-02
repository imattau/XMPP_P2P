export interface IdentityBackupPayload {
  format: 'nexus-identity-backup'
  version: 1
  displayName: string
  handle: string
  jid: string
  publicProfile: boolean
  recoveryPhrase: string[]
  createdAt: string
}

interface EncryptedIdentityBackup {
  format: 'nexus-encrypted-identity-backup'
  version: 1
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  ciphertext: string
}

const ITERATIONS = 310_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export async function encryptIdentityBackup(payload: IdentityBackupPayload, passphrase: string): Promise<string> {
  if (passphrase.length < 10) throw new Error('Use a backup passphrase with at least 10 characters.')
  const webCrypto = getWebCrypto()
  const salt = webCrypto.getRandomValues(new Uint8Array(16))
  const iv = webCrypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const ciphertext = await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)))
  const backup: EncryptedIdentityBackup = {
    format: 'nexus-encrypted-identity-backup',
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
  return JSON.stringify(backup, null, 2)
}

export async function decryptIdentityBackup(serialized: string, passphrase: string): Promise<IdentityBackupPayload> {
  let backup: EncryptedIdentityBackup
  try {
    backup = JSON.parse(serialized) as EncryptedIdentityBackup
  } catch {
    throw new Error('This file is not a valid identity backup.')
  }

  if (backup.format !== 'nexus-encrypted-identity-backup' || backup.version !== 1 ||
      backup.kdf !== 'PBKDF2-SHA-256' || backup.cipher !== 'AES-256-GCM' ||
      !Number.isInteger(backup.iterations) || backup.iterations < 100_000 || backup.iterations > 1_000_000 ||
      typeof backup.salt !== 'string' || typeof backup.iv !== 'string' || typeof backup.ciphertext !== 'string') {
    throw new Error('This encrypted backup format is not supported.')
  }

  const webCrypto = getWebCrypto()
  let plaintext: ArrayBuffer
  try {
    const salt = fromBase64(backup.salt)
    const iv = fromBase64(backup.iv)
    const ciphertext = fromBase64(backup.ciphertext)
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encryption parameters')
    const key = await deriveKey(passphrase, salt, backup.iterations)
    plaintext = await webCrypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext))
  } catch {
    throw new Error('Could not decrypt the backup. Check the file and passphrase.')
  }

  let payload: IdentityBackupPayload
  try {
    payload = JSON.parse(decoder.decode(plaintext)) as IdentityBackupPayload
  } catch {
    throw new Error('The decrypted backup contents are invalid.')
  }
  if (payload.format !== 'nexus-identity-backup' || payload.version !== 1 ||
      typeof payload.displayName !== 'string' || typeof payload.handle !== 'string' ||
      typeof payload.jid !== 'string' || typeof payload.publicProfile !== 'boolean' ||
      !Array.isArray(payload.recoveryPhrase) || payload.recoveryPhrase.length !== 12 ||
      !payload.recoveryPhrase.every((word) => typeof word === 'string')) {
    throw new Error('The decrypted backup does not contain a complete identity.')
  }
  return payload
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = getWebCrypto().subtle
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure backup encryption requires a browser context with Web Crypto, such as HTTPS or localhost.')
  }
  return globalThis.crypto
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer as ArrayBuffer
}
