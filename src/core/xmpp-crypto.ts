/** Browser and Node compatible primitives for OMEMO payload encryption. */

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto AES-GCM is not available in this runtime')
  }
  return globalThis.crypto
}

export function secureRandomBytes(length: number): Uint8Array {
  return getCrypto().getRandomValues(new Uint8Array(length))
}

export async function encryptAesGcm(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const crypto = getCrypto()
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['encrypt'])
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    key,
    plaintext as BufferSource
  )
  // Web Crypto appends the 16-byte authentication tag, matching Node's
  // createCipheriv output once getAuthTag() is concatenated.
  return new Uint8Array(ciphertext)
}

export async function decryptAesGcm(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  ciphertextAndTag: Uint8Array
): Promise<Uint8Array> {
  const crypto = getCrypto()
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    key,
    ciphertextAndTag as BufferSource
  )
  return new Uint8Array(plaintext)
}
