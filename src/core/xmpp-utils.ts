/**
 * @fileoverview Utility functions for binary serialization and conversion.
 */

/**
 * Converts an ArrayBuffer or Uint8Array to a base64 encoded string.
 */
export function bufferToBase64(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString('base64')
}

/**
 * Converts a base64 encoded string to an ArrayBuffer.
 */
export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = Buffer.from(value, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/**
 * Serializes a public/private key pair containing ArrayBuffers into base64 strings.
 */
export function serializeKeyPair(keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }): { pubKey: string; privKey: string } {
  return {
    pubKey: bufferToBase64(keyPair.pubKey),
    privKey: bufferToBase64(keyPair.privKey)
  }
}

/**
 * Deserializes a public/private key pair containing base64 strings back to ArrayBuffers.
 */
export function deserializeKeyPair(keyPair: { pubKey: string; privKey: string }): { pubKey: ArrayBuffer; privKey: ArrayBuffer } {
  return {
    pubKey: base64ToArrayBuffer(keyPair.pubKey),
    privKey: base64ToArrayBuffer(keyPair.privKey)
  }
}
