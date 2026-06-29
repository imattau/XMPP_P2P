// @ts-nocheck
import { sha256 } from '@noble/hashes/sha2.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { scrypt } from '@noble/hashes/scrypt.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { Buffer } from 'buffer/'

function toBytes(data) {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data
}

export function createHash(algorithm) {
  const chunks = []
  return {
    update(data) {
      chunks.push(toBytes(data))
      return this
    },
    digest(encoding) {
      const totalLen = chunks.reduce((s, c) => s + c.length, 0)
      const combined = new Uint8Array(totalLen)
      let offset = 0
      for (const c of chunks) {
        combined.set(c, offset)
        offset += c.length
      }
      const hashBytes = sha256(combined)
      if (!encoding || encoding === 'buffer') return Buffer.from(hashBytes)
      if (encoding === 'hex') return bytesToHex(hashBytes)
      if (encoding === 'base64') return btoa(String.fromCharCode(...hashBytes))
      return Buffer.from(hashBytes)
    }
  }
}

export function randomBytes(size) {
  const buf = new Uint8Array(size)
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    globalThis.crypto.getRandomValues(buf)
  }
  return Buffer.from(buf)
}

export function createCipheriv() {
  throw new Error('crypto.createCipheriv is not available in the browser — AES-GCM encryption is disabled')
}

export function createDecipheriv() {
  throw new Error('crypto.createDecipheriv is not available in the browser — AES-GCM decryption is disabled')
}

export function pbkdf2Sync(password, salt, iterations, keylen, _digest) {
  const key = pbkdf2(sha256, toBytes(password), toBytes(salt), { c: iterations, dkLen: keylen })
  return Buffer.from(key)
}

export function scryptSync(password, salt, keylen) {
  const key = scrypt(toBytes(password), toBytes(salt), { N: 16384, r: 8, p: 1, dkLen: keylen })
  return Buffer.from(key)
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i]
  return result === 0
}
