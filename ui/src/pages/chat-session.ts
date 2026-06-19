export type GroupChatParticipant = {
  id: string
  name: string
  handle: string
  avatar?: string
  server: string
  online?: boolean
  verified?: boolean
}

export type GroupChatMessage = {
  id: string
  kind?: 'text' | 'image' | 'file' | 'audio' | 'system'
  senderId: string
  senderName: string
  senderAvatar?: string
  content: string
  timestamp: string
  delivered?: boolean
  read?: boolean
  thread?: string
  fileName?: string
  attachments?: Array<{ id: string; url: string; alt: string; kind: 'image' | 'file' }>
}

export type GroupChatThread = {
  id: string
  type: 'group'
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

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage
}

function storageKey(id: string) {
  return `${SESSION_PREFIX}${id}`
}

function slugifyGroupName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'group-chat'
}

function getSelfParticipant(): GroupChatParticipant {
  return {
    id: ME,
    name: 'You',
    handle: 'you@jabber.de',
    server: 'jabber.de',
    online: true
  }
}

export function createGroupChatSession(
  name: string,
  participants: Array<Pick<GroupChatParticipant, 'id' | 'name' | 'handle' | 'avatar' | 'server' | 'online' | 'verified'>>
): GroupChatSession {
  const id = `${slugifyGroupName(name)}-${Math.random().toString(36).slice(2, 6)}`
  const handle = `${id}@muc.p2p`
  const memberParticipants = [...participants.map((participant) => ({ ...participant })), getSelfParticipant()]
  const chat: GroupChatThread = {
    id,
    type: 'group',
    name,
    handle,
    server: 'muc.p2p',
    subject: `Private group chat · ${memberParticipants.length} members`,
    encrypted: true,
    memberCount: memberParticipants.length,
    participants: memberParticipants,
    persistent: false,
    moderated: false,
    anonymous: false,
    passwordProtected: false,
    memberOnly: true,
    archived: false,
    online: true
  }

  const messages: GroupChatMessage[] = [
    {
      id: `system-${id}`,
      kind: 'system',
      senderId: 'system',
      senderName: '',
      content: `Group created by You · ${memberParticipants.length} members`,
      timestamp: 'now'
    }
  ]

  const session: GroupChatSession = { chat, messages }
  const storage = getSessionStorage()
  if (storage) {
    storage.setItem(storageKey(id), JSON.stringify(session))
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
  const storage = getSessionStorage()
  if (storage) {
    storage.setItem(storageKey(session.chat.id), JSON.stringify(session))
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
    messages: [...session.messages, message]
  }

  saveGroupChatSession(nextSession)
  return nextSession
}

export function listGroupChatSessions(): GroupChatSession[] {
  const storage = getSessionStorage()
  if (!storage) {
    return []
  }

  const sessions: GroupChatSession[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key || !key.startsWith(SESSION_PREFIX)) {
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
