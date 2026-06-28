import { useCallback, useEffect, useRef, useState } from 'react'
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

const SEED_CHATS: ChatListEntry[] = [
  {
    id: '1', type: 'direct', name: 'Maren Holdt', handle: 'maren@social.coop',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format',
    server: 'social.coop',
    lastMessage: { text: 'The new RFC looks solid. Did you get a chance to review the push notification section?', timestamp: 'now', read: false },
    unread: 3, pinned: true, encrypted: true, online: true, verified: true,
  },
  {
    id: '2', type: 'group', name: 'Protocol Working Group',
    participants: [
      { name: 'Theo N', handle: 'theo_n', server: 'hachyderm.io', online: true },
      { name: 'Kaspar V', handle: 'kvold', server: 'fosstodon.org', online: false },
      { name: 'Elif Ş', handle: 'elif_dev', server: 'mastodon.social', online: true },
    ],
    memberCount: 7,
    lastMessage: { text: 'theo_n: Benchmarks are looking great. 2x throughput at 10k connections.', timestamp: '4m', read: false },
    unread: 12, pinned: true, encrypted: true, topic: 'XMPP MUC spec review - deadline 2026-07-01',
  },
  {
    id: '3', type: 'muc', name: '#fedidev', handle: 'fedidev@conference.fosstodon.org',
    server: 'conference.fosstodon.org', memberCount: 341,
    lastMessage: { text: 'ingridl: Monthly call tomorrow 18:00 UTC - agenda in the topic', timestamp: '9m', read: true },
    unread: 0, topic: 'Federated dev community · monthly call Thu 18:00 UTC', encrypted: false,
  },
  {
    id: '4', type: 'direct', name: 'Felix Bergström', handle: 'felixb@chaos.social',
    avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=64&h=64&fit=crop&auto=format',
    server: 'chaos.social',
    lastMessage: { text: 'Setup took 4 hours but worth every minute honestly', timestamp: '31m', read: true, delivered: true },
    unread: 0, encrypted: true, online: false,
  },
  {
    id: '5', type: 'muc', name: '#opensourcedev', handle: 'opensourcedev@muc.hachyderm.io',
    server: 'muc.hachyderm.io', memberCount: 1204,
    lastMessage: { text: 'amara_d: Anyone tried the new Go library? Zero deps is a big deal', timestamp: '47m', read: true },
    unread: 0, topic: 'Open source development · share your work', encrypted: false,
  },
  {
    id: '6', type: 'group', name: 'Infra Team',
    participants: [
      { name: 'Yuki T', handle: 'yukitan', server: 'infosec.exchange', online: true },
      { name: 'Amara D', handle: 'amara_d', server: 'blacktwitter.io', online: false },
    ],
    memberCount: 4,
    lastMessage: { kind: 'image', text: 'Sent a photo', sender: 'You', timestamp: '1h', read: true, delivered: true },
    unread: 0, encrypted: true, muted: true, topic: 'Self-hosted infra coordination',
  },
  {
    id: '7', type: 'direct', name: 'Ingrid Larsen', handle: 'ingridl@sigmoid.social',
    avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format',
    server: 'sigmoid.social',
    lastMessage: { kind: 'audio', text: 'Voice message · 0:42', timestamp: '2h', read: true },
    unread: 0, encrypted: true, online: true, typing: 'typing…',
  },
  {
    id: '8', type: 'muc', name: '#privacy', handle: 'privacy@conference.infosec.exchange',
    server: 'conference.infosec.exchange', memberCount: 892,
    lastMessage: { text: 'yukitan: OMEMO is criminally underrated. Signal-level security, open protocol.', timestamp: '3h', read: true },
    unread: 7, topic: 'Privacy, security & digital rights', encrypted: false,
  },
  {
    id: '9', type: 'direct', name: 'Kaspar Vold', handle: 'kvold@fosstodon.org',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&auto=format',
    server: 'fosstodon.org',
    lastMessage: { kind: 'file', text: 'RFC-draft-xmpp-push-v3.pdf', timestamp: '5h', read: true },
    unread: 0, encrypted: true, online: false, verified: true,
  },
  {
    id: '10', type: 'group', name: 'DecentralWeb Collab', memberCount: 12,
    lastMessage: { text: 'maren: This could be the breakthrough we needed for mobile battery life', timestamp: 'yesterday', read: true },
    unread: 0, encrypted: true, topic: 'Cross-platform decentralized web collaboration',
  },
]

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
      const peerKey = msg.from
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

  const groupChats: ChatListEntry[] = listGroupChatSessions().map((session) => {
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
  })

  const useSeedFallback = contacts.length === 0 && groupChats.length === 0

  const chats: ChatListEntry[] = useSeedFallback
    ? SEED_CHATS
    : [...groupChats, ...buildDirectChats()]

  const onlineContacts = chats.filter((c) => c.type === 'direct' && c.online)

  return { chats, onlineContacts, loading: false }
}
