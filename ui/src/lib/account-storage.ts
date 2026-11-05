const IDENTITY_KEY = 'xmpp-p2p:identity'
const LEGACY_OWNER_KEY = 'xmpp-p2p:legacy-data-owner'
const LEGACY_UNASSIGNED_KEY = 'xmpp-p2p:legacy-data-unassigned'

let initialized = false

export function getActiveAccountStorageId(): string | undefined {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return undefined
    const identity = JSON.parse(raw) as { jid?: unknown; handle?: unknown }
    const id = typeof identity.jid === 'string' && identity.jid.trim()
      ? identity.jid.trim()
      : typeof identity.handle === 'string' && identity.handle.trim()
        ? identity.handle.trim()
        : undefined
    return id?.toLowerCase()
  } catch {
    return undefined
  }
}

export function getAccountStorageSegment(): string {
  return encodeURIComponent(getActiveAccountStorageId() ?? 'anonymous')
}

function hasLegacyData(): boolean {
  const knownKeys = [
    'xmpp-p2p:direct-chat-history',
    'xmpp-p2p:muted-direct-chats',
    'xmpp-p2p:encrypted-direct-chats',
    'xmpp-p2p:feed-bookmarks',
    'xmpp-p2p:vcard',
    'xmpp-p2p:outbox',
    'nexus_article_drafts',
    'nexus_article_bookmarks',
    'nexus_followed_topics',
    'xmpp-p2p:server-microblog-subscriptions',
    'xmpp-p2p:server-microblog-statuses',
  ]
  try {
    if (knownKeys.some((key) => localStorage.getItem(key) !== null)) return true
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('xmpp-p2p:group-chat:') && !key.includes('::')) return true
    }
  } catch {
    return false
  }
  return false
}

export function initializeAccountStorage(): void {
  if (initialized) return
  initialized = true
  try {
    if (localStorage.getItem(LEGACY_OWNER_KEY) !== null || localStorage.getItem(LEGACY_UNASSIGNED_KEY) === '1') return
    if (!hasLegacyData()) return
    const activeAccountId = getActiveAccountStorageId()
    if (activeAccountId) localStorage.setItem(LEGACY_OWNER_KEY, activeAccountId)
    else localStorage.setItem(LEGACY_UNASSIGNED_KEY, '1')
  } catch {
    // Migration ownership is best-effort when storage is disabled.
  }
}

export function canMigrateLegacyDataToActiveAccount(): boolean {
  initializeAccountStorage()
  const activeAccountId = getActiveAccountStorageId()
  if (!activeAccountId) return false
  try {
    return localStorage.getItem(LEGACY_UNASSIGNED_KEY) !== '1'
      && localStorage.getItem(LEGACY_OWNER_KEY) === activeAccountId
  } catch {
    return false
  }
}

export function getAccountScopedStorageKey(key: string): string {
  initializeAccountStorage()
  const activeAccountId = getActiveAccountStorageId()
  const scopedKey = `${key}:${encodeURIComponent(activeAccountId ?? 'anonymous')}`

  // Existing installs have one unscoped copy. Assign it once to the identity
  // already stored in this browser, then keep subsequent accounts isolated.
  if (canMigrateLegacyDataToActiveAccount()) {
    try {
      if (localStorage.getItem(scopedKey) === null) {
        const legacyValue = localStorage.getItem(key)
        if (legacyValue !== null) {
          localStorage.setItem(scopedKey, legacyValue)
          localStorage.removeItem(key)
        }
      }
    } catch {
      // Continue using the account-specific key when storage is unavailable.
    }
  }

  return scopedKey
}
