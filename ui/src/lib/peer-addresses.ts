import { getAccountStorageSegment } from './account-storage'

const STORAGE_PREFIX = 'xmpp-p2p:peer-addresses:'

function storageKey() {
  return `${STORAGE_PREFIX}${getAccountStorageSegment()}`
}

export function savePeerAddress(peerId: string, address: string): void {
  try {
    const raw = localStorage.getItem(storageKey())
    const addresses = raw ? JSON.parse(raw) as Record<string, string> : {}
    addresses[peerId] = address
    localStorage.setItem(storageKey(), JSON.stringify(addresses))
  } catch {
    // The chat can still open for this session if storage is unavailable.
  }
}

export function getPeerAddress(peerId: string): string | undefined {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return undefined
    const addresses = JSON.parse(raw) as Record<string, unknown>
    const address = addresses[peerId]
    return typeof address === 'string' ? address : undefined
  } catch {
    return undefined
  }
}
