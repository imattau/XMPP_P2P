import { canMigrateLegacyDataToActiveAccount, getAccountStorageSegment } from '../lib/account-storage'
import { sortMessagesChronologically } from '../lib/message-order'

export type GroupChatParticipant = {
  id: string
  name: string
  handle: string
  avatar?: string
  server: string
  online?: boolean
  verified?: boolean
  role?: 'owner' | 'admin' | 'moderator' | 'member' | 'visitor'
}

export type GroupChatMessage = {
  id: string
  kind?: 'text' | 'image' | 'file' | 'audio' | 'system'
  senderId: string
  senderName: string
  senderAvatar?: string
  content: string
  timestamp: string
  activityAt?: string
  delivered?: boolean
  receiptReceived?: boolean
  read?: boolean
  encrypted?: boolean
  thread?: string
  replyTo?: { messageId: string; to?: string }
  fileName?: string
  attachments?: Array<{ id: string; url: string; alt: string; kind: 'image' | 'file' }>
}

export type GroupChatThread = {
  id: string
  type: 'group' | 'muc'
  name: string
  handle: string
  server: string
  subject?: string
  encrypted: boolean
  memberCount: number
  participants: GroupChatParticipant[]
  persistent: boolean
  moderated: boolean
  anonymous: boolean
  passwordProtected: boolean
  memberOnly: boolean
  archived: boolean
  muted?: boolean
  online?: boolean
  verified?: boolean
}

export type GroupChatSession = {
  chat: GroupChatThread
  messages: GroupChatMessage[]
}

const SESSION_PREFIX = 'xmpp-p2p:group-chat:'
const ME = 'me'
let activeGroupChatId: string | undefined

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage
}

function storageKey(id: string) {
  return `${SESSION_PREFIX}${getAccountStorageSegment()}::${id}`
}

function migrateLegacySessions() {
  const storage = getSessionStorage()
  if (!storage || !canMigrateLegacyDataToActiveAccount()) return

  const scopedPrefix = `${SESSION_PREFIX}${getAccountStorageSegment()}::`
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index)
    if (!key || !key.startsWith(SESSION_PREFIX) || key.startsWith(scopedPrefix)) continue

    const raw = storage.getItem(key)
    if (!raw) continue
    try {
      const session = JSON.parse(raw) as GroupChatSession
      if (!session?.chat?.id) continue
      const nextKey = storageKey(session.chat.id)
      if (storage.getItem(nextKey) === null) storage.setItem(nextKey, raw)
      storage.removeItem(key)
    } catch {
      // Leave malformed legacy data untouched for manual recovery.
    }
  }
}

function slugifyGroupName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'group-chat'
}

function getSelfParticipant(jid = 'you@p2p', role: GroupChatParticipant['role'] = 'member'): GroupChatParticipant {
  return {
    id: ME,
    name: 'You',
    handle: jid,
    server: jid.split('@')[1] || 'p2p',
    online: true,
    role
  }
}

export function createGroupChatSession(
  name: string,
  participants: Array<Pick<GroupChatParticipant, 'id' | 'name' | 'handle' | 'avatar' | 'server' | 'online' | 'verified'>>,
  roomId?: string,
  options?: { encrypted?: boolean; localJid?: string; type?: 'group' | 'muc'; role?: GroupChatParticipant['role']; roomJid?: string; systemMessage?: string }
): GroupChatSession {
  const id = roomId ?? `${slugifyGroupName(name)}-${Math.random().toString(36).slice(2, 6)}`
  const handle = options?.roomJid ?? `${id}@muc.p2p`
  const roomServer = handle.split('@')[1] || 'muc.p2p'
  const memberParticipants = [...participants.map((participant) => ({ ...participant })), getSelfParticipant(options?.localJid, options?.role)]
  const memberCountLabel = `${memberParticipants.length} ${memberParticipants.length === 1 ? 'member' : 'members'}`
  const chat: GroupChatThread = {
    id,
    type: options?.type ?? 'group',
    name,
    handle,
    server: roomServer,
    subject: `${roomServer === 'muc.p2p' ? 'P2P group room' : 'XMPP room'} · ${memberCountLabel}`,
    encrypted: options?.encrypted ?? true,
    memberCount: memberParticipants.length,
    participants: memberParticipants,
    persistent: false,
    moderated: false,
    anonymous: false,
    passwordProtected: false,
    memberOnly: false,
    archived: false,
    online: true
  }

  const messages: GroupChatMessage[] = [
    {
      id: `system-${id}`,
      kind: 'system',
      senderId: 'system',
      senderName: '',
      content: options?.systemMessage ?? `Room created by You · ${memberCountLabel}`,
      timestamp: 'now',
      activityAt: new Date().toISOString()
    }
  ]

  const session: GroupChatSession = { chat, messages }
  const storage = getSessionStorage()
  if (storage) {
    storage.setItem(storageKey(id), JSON.stringify(session))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xmpp-p2p:group-session-updated', { detail: { id } }))
    }
  }

  return session
}

export function createPrivateGroupRoomName(name: string) {
  return `${slugifyGroupName(name)}-${Math.random().toString(36).slice(2, 6)}`
}

export function getGroupChatSession(id?: string): GroupChatSession | undefined {
  if (!id) {
    return undefined
  }

  const storage = getSessionStorage()
  if (!storage) {
    return undefined
  }

  migrateLegacySessions()

  const raw = storage.getItem(storageKey(id))
  if (!raw) {
    return undefined
  }

  try {
    return JSON.parse(raw) as GroupChatSession
  } catch {
    return undefined
  }
}

export function saveGroupChatSession(session: GroupChatSession): GroupChatSession {
  session = { ...session, messages: sortMessagesChronologically(session.messages) }
  const storage = getSessionStorage()
  if (storage) {
    storage.setItem(storageKey(session.chat.id), JSON.stringify(session))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xmpp-p2p:group-session-updated', { detail: { id: session.chat.id } }))
    }
  }

  return session
}

export function updateGroupChatSession(
  id: string,
  updater: (session: GroupChatSession) => GroupChatSession
): GroupChatSession | undefined {
  const current = getGroupChatSession(id)
  if (!current) {
    return undefined
  }

  const nextSession = updater(current)
  saveGroupChatSession(nextSession)
  return nextSession
}

export function removeGroupChatSession(id: string): void {
  const storage = getSessionStorage()
  if (!storage) {
    return
  }

  storage.removeItem(storageKey(id))
}

export function appendGroupChatMessage(id: string, message: GroupChatMessage): GroupChatSession | undefined {
  const session = getGroupChatSession(id)
  if (!session) {
    return undefined
  }

  const nextSession: GroupChatSession = {
    ...session,
    messages: sortMessagesChronologically([...session.messages, message])
  }

  saveGroupChatSession(nextSession)
  return nextSession
}

export function isActiveGroupChat(id: string): boolean {
  return activeGroupChatId === id && (typeof document === 'undefined' || document.visibilityState === 'visible')
}

export function markGroupChatRead(id: string): void {
  updateGroupChatSession(id, (session) => {
    const hasUnread = session.messages.some((message) => message.senderId !== ME && message.kind !== 'system' && !message.read)
    if (!hasUnread) return session
    return {
      ...session,
      messages: session.messages.map((message) => message.senderId === ME ? message : { ...message, read: true }),
    }
  })
}

export function setActiveGroupChat(id?: string): void {
  activeGroupChatId = id
  if (id && isActiveGroupChat(id)) markGroupChatRead(id)
}

export function markActiveGroupChatRead(): void {
  if (activeGroupChatId && isActiveGroupChat(activeGroupChatId)) markGroupChatRead(activeGroupChatId)
}

export function listGroupChatSessions(): GroupChatSession[] {
  const storage = getSessionStorage()
  if (!storage) {
    return []
  }

  migrateLegacySessions()
  const scopedPrefix = `${SESSION_PREFIX}${getAccountStorageSegment()}::`

  const sessions: GroupChatSession[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key || !key.startsWith(scopedPrefix)) {
      continue
    }

    const raw = storage.getItem(key)
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw) as GroupChatSession
      if (parsed?.chat?.id) {
        sessions.push(parsed)
      }
    } catch {
      continue
    }
  }

  return sessions.sort((a, b) => a.chat.name.localeCompare(b.chat.name))
}
