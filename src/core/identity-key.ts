/**
 * @packageDocumentation Shared identity-key derivation.
 *
 * Both the browser client and the native (Electron) client derive the libp2p
 * Ed25519 key from the same 12-word recovery phrase so a user can restore the
 * same peer identity on any platform.
 */

import { generateKeyPairFromSeed } from '@libp2p/crypto/keys'
import type { PrivateKey } from '@libp2p/interface'

/**
 * Optional native mirror for the serialized libp2p private key.
 *
 * Browsers can evict IndexedDB; Android stores the mirror in
 * SharedPreferences/Keystore-backed storage so the peer identity survives.
 */
export interface IdentityKeyStore {
  get(): Promise<string | undefined>
  set(value: string): Promise<void>
}

/**
 * Validates that a recovery phrase has exactly 12 non-empty words.
 *
 * @param words - Candidate recovery phrase.
 * @returns True when the phrase has the expected shape.
 */
export function isValidRecoveryPhrase(words: string[]): boolean {
  return words.length === 12 && words.every((word) => word.trim().length > 0)
}

/**
 * Derives a deterministic Ed25519 libp2p key from a 12-word recovery phrase.
 *
 * The phrase is normalised (trimmed, lower-cased, space-joined) and stretched
 * with PBKDF2-SHA-256. The resulting 32-byte seed is used directly as the
 * Ed25519 seed, which keeps the derivation identical across Node and browsers.
 *
 * @param words - 12-word recovery phrase.
 * @returns The derived private key.
 */
export async function keyFromRecoveryPhrase(words: string[]): Promise<PrivateKey> {
  if (!isValidRecoveryPhrase(words)) {
    throw new Error('A valid 12-word recovery phrase is required')
  }
  const phraseBytes = new TextEncoder().encode(words.map((word) => word.trim().toLowerCase()).join(' '))
  const material = await crypto.subtle.importKey('raw', phraseBytes, 'PBKDF2', false, ['deriveBits'])
  const seed = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: new TextEncoder().encode('xmpp-p2p:identity-key:v1'),
    iterations: 310_000,
  }, material, 256))
  try {
    return await generateKeyPairFromSeed('Ed25519', seed)
  } finally {
    seed.fill(0)
    phraseBytes.fill(0)
  }
}
