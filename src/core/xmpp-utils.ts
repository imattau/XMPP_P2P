/**
 * @packageDocumentation Utility functions for binary serialization, base64 conversion,
 * and keypair transformation inside XMPP P2P protocol layers.
 */

/**
 * Converts an ArrayBuffer or Uint8Array to a base64 encoded string.
 *
 * @param value - The raw binary buffer (ArrayBuffer or Uint8Array) to be encoded.
 * @returns The base64 encoded string representation of the input buffer.
 */
export function bufferToBase64(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString('base64')
}

/**
 * Converts a base64 encoded string to an ArrayBuffer.
 *
 * @param value - The base64 string to decode.
 * @returns An ArrayBuffer containing the decoded binary data.
 */
export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = Buffer.from(value, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/**
 * Serializes a public/private key pair containing raw ArrayBuffers into base64 encoded strings.
 * Used for persistent storage and transmission of OMEMO key material.
 *
 * @param keyPair - The raw cryptographic key pair containing public and private keys.
 * @param keyPair.pubKey - Public key as an ArrayBuffer.
 * @param keyPair.privKey - Private key as an ArrayBuffer.
 * @returns The serialized key pair containing base64 string properties.
 */
export function serializeKeyPair(keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }): { pubKey: string; privKey: string } {
  return {
    pubKey: bufferToBase64(keyPair.pubKey),
    privKey: bufferToBase64(keyPair.privKey)
  }
}

/**
 * Deserializes a public/private key pair containing base64 strings back to raw ArrayBuffers.
 * Used for loading OMEMO key bundles into the cryptographic runtime.
 *
 * @param keyPair - The base64 serialized key pair containing public and private keys.
 * @param keyPair.pubKey - Public key as a base64 string.
 * @param keyPair.privKey - Private key as a base64 string.
 * @returns The deserialized key pair containing raw ArrayBuffer properties.
 */
export function deserializeKeyPair(keyPair: { pubKey: string; privKey: string }): { pubKey: ArrayBuffer; privKey: ArrayBuffer } {
  return {
    pubKey: base64ToArrayBuffer(keyPair.pubKey),
    privKey: base64ToArrayBuffer(keyPair.privKey)
  }
}
