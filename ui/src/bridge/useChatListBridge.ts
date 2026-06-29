import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBrowserXmppBridge, type BridgeChatTarget, type BridgeCollectionNode } from './runtime'
import { useRosterBridge } from './useRosterBridge'
import { listGroupChatSessions } from '../pages/chat-session'

export type ChatListEntryType = 'direct' | 'group' | 'muc'

export interface ChatListEntry {
  id: string
  type: ChatListEntryType
  name: string
  handle?: string
  avatar?: string
  server?: string
  participants?: Array<{ name: string; handle: string; server: string; online?: boolean }>
  lastMessage: {
    text: string
    kind?: 'text' | 'image' | 'audio' | 'file' | 'system'
    sender?: string
    timestamp: string
    read?: boolean
    delivered?: boolean
  }
  unread: number
  pinned?: boolean
  muted?: boolean
  encrypted?: boolean
  online?: boolean
  memberCount?: number
  topic?: string
  typing?: string
  verified?: boolean
}

type IncomingMessage = {
  from: string
  to: string
  body: string
  id: string
  type?: string
  encrypted?: boolean
  delay?: { stamp: string; from?: string }
}

function formatRelativeTime(isoOrRelative: string): string {
  if (/^(now|\d+[smhd]|yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(isoOrRelative)) {
    return isoOrRelative
  }
  const date = new Date(isoOrRelative)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.round(diffMs / 60000))
  if (minutes < 2) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.max(1, Math.round(minutes / 60))
  if (hours < 24) return `${hours}h`
  const days = Math.max(1, Math.round(hours / 24))
  if (days === 1) return 'yesterday'
  return `${days}d`
}

export function useChatListBridge() {
  const { contacts, onlinePeers } = useRosterBridge()
  const [messages, setMessages] = useState<Map<string, IncomingMessage>>(new Map())
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.onMessage) return

    const unsub = runtime.onMessage((msg) => {
      const peerKey = msg.from.endsWith('@p2p') ? msg.from : `${msg.from}@p2p`
      setMessages((prev) => {
        const next = new Map(prev)
        next.set(peerKey, msg)
        return next
      })
    })

    return unsub
  }, [])

  const buildDirectChats = useCallback((): ChatListEntry[] => {
    return contacts.map((c) => {
      const peerHandle = c.jid
      const name = c.nickname || c.name || peerHandle.split('@')[0]
      const incoming = messagesRef.current.get(peerHandle)
      return {
        id: peerHandle,
        type: 'direct' as const,
        name,
        handle: peerHandle,
        server: peerHandle.includes('@') ? peerHandle.split('@')[1] : 'p2p',
        lastMessage: incoming
          ? { text: incoming.body, timestamp: incoming.delay?.stamp ? formatRelativeTime(incoming.delay.stamp) : 'now', read: false }
          : { text: '', timestamp: '' },
        unread: incoming ? 1 : 0,
        encrypted: true,
        online: c.online,
        participants: [
          { name, handle: peerHandle, server: peerHandle.includes('@') ? peerHandle.split('@')[1] : 'p2p', online: c.online }
        ],
      }
    })
  }, [contacts])

  const groupChats: ChatListEntry[] = useMemo(() =>
    listGroupChatSessions().map((session) => {
      const last = session.messages[session.messages.length - 1]
      return {
        id: session.chat.id,
        type: 'group' as const,
        name: session.chat.name,
        handle: session.chat.handle,
        server: session.chat.server,
        participants: session.chat.participants.map((p) => ({
          name: p.name,
          handle: p.handle,
          server: p.server,
          online: onlinePeers.has(p.handle) || onlinePeers.has(`${p.handle}@${p.server}`) || p.online,
        })),
        memberCount: session.chat.memberCount,
        lastMessage: {
          text: last?.content ?? 'Private group chat created',
          timestamp: last?.timestamp ?? 'now',
          read: true,
        },
        unread: 0,
        encrypted: session.chat.encrypted,
        muted: session.chat.muted,
        online: session.chat.online,
        topic: session.chat.subject,
      }
    }),
  [onlinePeers])

  const chats: ChatListEntry[] = useMemo(() => [...groupChats, ...buildDirectChats()], [groupChats, buildDirectChats])

  const onlineContacts = useMemo(() => chats.filter((c) => c.type === 'direct' && c.online), [chats])

  return { chats, onlineContacts, loading: false }
}
