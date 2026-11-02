import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'
import { useRosterBridge } from './useRosterBridge'
import { listGroupChatSessions } from '../pages/chat-session'
import { canonicalDirectChatId, isDirectChatEncryptionEnabled, isDirectChatMuted, listDirectChatHistories, markDirectChatHistoryRead, replaceDirectChatMessage, saveDirectChatMessage, supportsDirectChatOmemo } from './direct-chat-history'
import { getMessageKind, parseAttachmentReferences } from './chat/attachments'

export type ChatListEntryType = 'direct' | 'group' | 'muc'

export interface ChatListEntry {
  id: string
  type: ChatListEntryType
  name: string
  handle?: string
  avatar?: string
  server?: string
  participants?: Array<{ name: string; handle: string; server: string; online?: boolean; role?: 'owner' | 'admin' | 'moderator' | 'member' | 'visitor' }>
  lastMessage: {
    text: string
    kind?: 'text' | 'image' | 'audio' | 'file' | 'system'
    sender?: string
    timestamp: string
    activityAt?: string
    read?: boolean
    delivered?: boolean
    receiptReceived?: boolean
    encrypted?: boolean
  }
  unread: number
  pinned?: boolean
  muted?: boolean
  archived?: boolean
  encrypted?: boolean
  online?: boolean
  memberCount?: number
  topic?: string
  typing?: string
  verified?: boolean
}

export function useChatListBridge() {
  const { contacts, onlinePeers } = useRosterBridge()
  const runtime = useBrowserXmppBridge()
  const activeDirectChatRef = useRef<string | undefined>(undefined)
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(() => new Map(
    listDirectChatHistories().map(({ chatId, messages: history }) => [
      chatId,
      history.filter((message) => message.senderId !== 'me' && !message.read).length,
    ])
  ))
  const [groupRevision, setGroupRevision] = useState(0)
  const [historyRevision, setHistoryRevision] = useState(0)

  useEffect(() => {
    if (!runtime?.onMessage) return

    const unsub = runtime.onMessage((msg) => {
      // Receipts update an existing outgoing message; they are not chat rows.
      if (msg.receipt?.type === 'received') return
      // Groupchat messages are persisted through the room event stream, while
      // chat-state-only stanzas have no body to show in a conversation row.
      if (msg.type === 'groupchat' || !msg.body) return
      const localJid = runtime.getLocalJid?.()
      const bareFrom = msg.from.split('/')[0]
      const bareTo = msg.to.split('/')[0]
      const fromSelf = msg.fromSelf ?? Boolean(localJid && canonicalDirectChatId(bareFrom) === canonicalDirectChatId(localJid))
      const conversationJid = fromSelf ? bareTo : bareFrom
      if (!conversationJid) return
      const peerKey = canonicalDirectChatId(conversationJid.includes('@') ? conversationJid : `${conversationJid}@p2p`)
      const read = !fromSelf && (Boolean(msg.mam) || (document.visibilityState === 'visible' && activeDirectChatRef.current === peerKey))
      const parsed = parseAttachmentReferences(msg.body)
      const activityAt = msg.delay?.stamp ?? new Date().toISOString()
      const savedMessage = {
        id: msg.id,
        senderId: fromSelf ? 'me' : bareFrom,
        senderName: fromSelf ? 'You' : bareFrom.split('@')[0],
        content: parsed.content,
        timestamp: msg.delay?.stamp
          ? new Date(msg.delay.stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        activityAt,
        kind: getMessageKind(parsed.attachments),
        fileName: parsed.attachments.length > 0 ? parsed.attachments.map((attachment) => attachment.alt).join(', ') : undefined,
        attachments: parsed.attachments.length > 0 ? parsed.attachments : undefined,
        delivered: true,
        encrypted: msg.encrypted,
        read,
      }
      if (msg.replace) replaceDirectChatMessage(peerKey, msg.replace, savedMessage)
      else saveDirectChatMessage(peerKey, savedMessage)
    })

    return unsub
  }, [runtime])

  useEffect(() => {
    const refresh = () => setGroupRevision((revision) => revision + 1)
    window.addEventListener('xmpp-p2p:group-session-updated', refresh)
    return () => window.removeEventListener('xmpp-p2p:group-session-updated', refresh)
  }, [])

  useEffect(() => {
    const refresh = () => {
      setHistoryRevision((revision) => revision + 1)
      setUnreadCounts(new Map(listDirectChatHistories().map(({ chatId, messages: history }) => [
        chatId,
        history.filter((message) => message.senderId !== 'me' && !message.read).length,
      ])))
    }
    window.addEventListener('xmpp-p2p:direct-chat-history-updated', refresh)
    return () => window.removeEventListener('xmpp-p2p:direct-chat-history-updated', refresh)
  }, [])

  useEffect(() => {
    const setActiveChat = (event: Event) => {
      const chatId = (event as CustomEvent<string | null>).detail
      activeDirectChatRef.current = chatId ? canonicalDirectChatId(chatId) : undefined
      if (chatId && document.visibilityState === 'visible') markDirectChatHistoryRead(chatId)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && activeDirectChatRef.current) {
        markDirectChatHistoryRead(activeDirectChatRef.current)
      }
    }
    window.addEventListener('xmpp-p2p:active-direct-chat', setActiveChat)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('xmpp-p2p:active-direct-chat', setActiveChat)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const buildDirectChats = useCallback((): ChatListEntry[] => {
    const histories = new Map(listDirectChatHistories().map((history) => [history.chatId, history.messages]))
    const contactsByJid = new Map(contacts.map((contact) => [canonicalDirectChatId(contact.jid), contact]))
    const peerHandles = new Set([
      ...contactsByJid.keys(),
      ...histories.keys(),
    ])

    return [...peerHandles].map((peerHandle) => {
      const contact = contactsByJid.get(peerHandle)
      const history = histories.get(peerHandle) ?? []
      const lastMessage = history.at(-1)
      const name = contact?.nickname || contact?.name || peerHandle.split('@')[0]
      return {
        id: peerHandle,
        type: 'direct' as const,
        name,
        handle: peerHandle,
        server: peerHandle.includes('@') ? peerHandle.split('@')[1] : 'p2p',
        lastMessage: lastMessage
          ? {
              text: lastMessage.content,
              sender: lastMessage.senderName,
              timestamp: lastMessage.timestamp,
              activityAt: lastMessage.activityAt,
              read: lastMessage.read,
              delivered: lastMessage.delivered,
              receiptReceived: lastMessage.receiptReceived,
              encrypted: lastMessage.encrypted ?? false,
            }
          : { text: '', timestamp: '' },
        unread: unreadCounts.get(peerHandle) ?? 0,
        encrypted: supportsDirectChatOmemo(peerHandle) && isDirectChatEncryptionEnabled(peerHandle),
        muted: isDirectChatMuted(peerHandle),
        online: contact?.online ?? false,
        participants: [
          { name, handle: peerHandle, server: peerHandle.includes('@') ? peerHandle.split('@')[1] : 'p2p', online: contact?.online ?? false }
        ],
      }
    })
  }, [contacts, historyRevision, unreadCounts])

  const groupChats: ChatListEntry[] = useMemo(() =>
    listGroupChatSessions().map((session) => {
      const last = session.messages[session.messages.length - 1]
      return {
        id: `group:${session.chat.id}`,
        type: session.chat.type,
        name: session.chat.name,
        handle: session.chat.handle,
        server: session.chat.server,
        participants: session.chat.participants.map((p) => ({
          name: p.name,
          handle: p.handle,
          server: p.server,
          online: onlinePeers.has(canonicalDirectChatId(p.handle)) || onlinePeers.has(canonicalDirectChatId(`${p.handle}@${p.server}`)) || p.online,
          role: p.role,
        })),
        memberCount: session.chat.memberCount,
        lastMessage: {
          text: last?.content ?? 'Private group chat created',
          sender: last?.senderName,
          timestamp: last?.timestamp ?? 'now',
          activityAt: last?.activityAt,
          read: true,
          delivered: last?.delivered,
          receiptReceived: last?.receiptReceived,
          encrypted: last?.encrypted ?? false,
        },
        unread: session.messages.filter((message) => message.senderId !== 'me' && message.kind !== 'system' && !message.read).length,
        encrypted: session.chat.encrypted,
        muted: session.chat.muted,
        archived: session.chat.archived,
        online: session.chat.online,
        topic: session.chat.subject,
      }
    }),
  [onlinePeers, groupRevision])

  const chats: ChatListEntry[] = useMemo(() => [...groupChats, ...buildDirectChats()], [groupChats, buildDirectChats])

  const onlineContacts = useMemo(() => chats.filter((c) => c.type === 'direct' && c.online), [chats])

  return { chats, onlineContacts, loading: false }
}
