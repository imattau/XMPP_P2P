/**
 * @packageDocumentation Durable native mirror for the libp2p identity key.
 *
 * WebView IndexedDB is best-effort storage; Android can reclaim it under
 * pressure. The serialized key is mirrored into the native Preferences store
 * so the peer identity survives eviction. The 12-word recovery phrase remains
 * the portable backup.
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const PRIVATE_KEY = 'xmpp-p2p:libp2p-private-key'

export interface NativeIdentityKeyStore {
  get(): Promise<string | undefined>
  set(value: string): Promise<void>
}

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform()
}

export const nativeIdentityKeyStore: NativeIdentityKeyStore = {
  async get() {
    if (!Capacitor.isNativePlatform()) return undefined
    const { value } = await Preferences.get({ key: PRIVATE_KEY })
    return value ?? undefined
  },
  async set(value: string) {
    if (!Capacitor.isNativePlatform()) return
    await Preferences.set({ key: PRIVATE_KEY, value })
  }
}

/** Returns the mirror only on a native WebView; web builds skip it. */
export function getNativeIdentityKeyStore(): NativeIdentityKeyStore | undefined {
  return Capacitor.isNativePlatform() ? nativeIdentityKeyStore : undefined
}
