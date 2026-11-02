import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'
import { useChatListBridge } from './useChatListBridge'
import { getGroupChatSession, updateGroupChatSession } from '../pages/chat-session'
import { isDirectChatEncryptionEnabled, loadDirectChatHistory, supportsDirectChatOmemo } from './direct-chat-history'
import { getMessageKind, parseAttachmentReferences, parseMessageAttachments } from './chat/attachments'
import { sortMessagesChronologically } from '../lib/message-order'
import type { ChatMessage, ChatThread } from './chat/types'
import type { ChatListEntry } from './useChatListBridge'

type ChatThreadData = {
  chat: ChatThread | null
  messages: ChatMessage[]
  historyLoading: boolean
  historyError?: string
  refreshHistory: () => void
  hasOlderHistory: boolean
  loadingOlderHistory: boolean
  loadOlderHistory: () => void
  historyErrorIsOlder: boolean
}

const queriedDirectHistories = new WeakMap<object, Map<string, Promise<string>>>()
const queriedServerHistories = new WeakMap<object, Map<string, Promise<{ before?: string; hasMore: boolean }>>>()

function mergeGroupMessages(remoteMessages: ChatMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  const merged = new Map(remoteMessages.map((message) => [message.id, message]))
  for (const localMessage of localMessages) {
    const remoteMessage = merged.get(localMessage.id)
    merged.set(localMessage.id, remoteMessage ? {
      ...localMessage,
      ...remoteMessage,
      delivered: Boolean(localMessage.delivered || remoteMessage.delivered),
      receiptReceived: Boolean(localMessage.receiptReceived || remoteMessage.receiptReceived),
      read: Boolean(localMessage.read || remoteMessage.read),
    } : localMessage)
  }
  return sortMessagesChronologically([...merged.values()])
}

function chatFromListEntry(entry: ChatListEntry): ChatThread {
  return {
    id: entry.id,
    type: entry.type as ChatThread['type'],
    name: entry.name,
    handle: entry.handle,
    subject: entry.topic,
    avatar: entry.avatar,
    server: entry.server,
    encrypted: entry.encrypted ?? false,
    muted: entry.muted,
    archived: entry.archived,
    online: entry.online,
    verified: entry.verified,
    memberCount: entry.memberCount,
    participants: (entry.participants ?? []).map((p) => ({
      id: p.handle,
      name: p.name,
      handle: p.handle,
      server: p.server,
      online: p.online,
      role: p.role,
    })),
  }
}

export function useChatThreadBridge(id?: string): ChatThreadData {
  const { chats } = useChatListBridge()
  const runtime = useBrowserXmppBridge()
  const [serverConnectionRevision, setServerConnectionRevision] = useState(0)
  const [mucHistory, setMucHistory] = useState<Record<string, ChatMessage[]>>({})
  const [historyStatus, setHistoryStatus] = useState<{ chatId: string; loading: boolean; error?: string; before?: string; hasMore?: boolean; loadingOlder?: boolean; olderError?: boolean }>({ chatId: '', loading: false })
  const [historyRetry, setHistoryRetry] = useState(0)
  const p2pHistoryRetryRef = useRef(historyRetry)
  const serverHistoryRetryRef = useRef(historyRetry)
  const serverHistoryRevisionRef = useRef(serverConnectionRevision)
  const refreshHistory = useCallback(() => setHistoryRetry((retry) => retry + 1), [])
  const loadOlderHistory = useCallback(() => {
    if (!id || !historyStatus.before || historyStatus.loadingOlder) return
    const groupId = id.startsWith('group:') ? id.slice(6) : id
    const groupSession = getGroupChatSession(groupId)
    const isServerMuc = groupSession?.chat.type === 'muc' && groupSession.chat.server !== 'muc.p2p'
    const queryHistory = isServerMuc ? runtime?.queryServerMucHistory : runtime?.queryServerChatHistory
    if (!runtime || !queryHistory) return
    const archiveJid = isServerMuc
      ? groupSession!.chat.handle
      : id.split('/')[0]
    const chatId = id
    const cursor = historyStatus.before
    setHistoryStatus((current) => ({ ...current, loadingOlder: true, error: undefined, olderError: false }))
    void queryHistory.call(runtime, archiveJid, cursor).then((page) => {
      setHistoryStatus((current) => current.chatId === chatId
        ? { ...current, before: page.before, hasMore: page.hasMore, loadingOlder: false }
        : current)
    }).catch((error: unknown) => {
      setHistoryStatus((current) => current.chatId === chatId
        ? { ...current, loadingOlder: false, olderError: true, error: error instanceof Error ? error.message : 'Could not load older XMPP archive messages.' }
        : current)
    })
  }, [id, runtime, historyStatus.before, historyStatus.loadingOlder])

  useEffect(() => {
    if (!runtime?.onServerConnection) return
    return runtime.onServerConnection(() => setServerConnectionRevision((revision) => revision + 1))
  }, [runtime])

  useEffect(() => {
    const roomId = id?.replace(/^group:/, '').replace(/@muc\.p2p$/, '')
    const groupSession = roomId ? getGroupChatSession(roomId) : undefined
    if (!roomId || !groupSession || groupSession.chat.server !== 'muc.p2p') {
      setHistoryStatus({ chatId: '', loading: false })
      return
    }
    if (!runtime) {
      setHistoryStatus({ chatId: roomId, loading: false })
      return
    }
    let cancelled = false
    setHistoryStatus({ chatId: roomId, loading: true })
    void runtime.getMucHistory(roomId).then((history) => {
      if (cancelled) return
      const messages = history.map((message) => {
        const parsed = parseAttachmentReferences(message.body)
        const isSelf = message.fromPeerId === runtime.getLocalJid().split('@')[0]
        return {
          id: message.id,
          senderId: isSelf ? 'me' : `${message.fromPeerId}@p2p`,
          senderName: isSelf ? 'You' : message.from,
          content: parsed.content,
          timestamp: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          activityAt: message.timestamp,
          kind: getMessageKind(parsed.attachments),
          delivered: true,
          read: true,
          encrypted: message.encrypted ?? false,
          thread: message.thread,
          replyTo: message.reply ? { messageId: message.reply.id, to: message.reply.to } : undefined,
          fileName: parsed.attachments.length > 0 ? parsed.attachments.map((attachment) => attachment.alt).join(', ') : undefined,
          attachments: parsed.attachments.length > 0 ? parsed.attachments : undefined,
        }
      })
      setMucHistory((current) => ({ ...current, [roomId]: messages }))
      if (getGroupChatSession(roomId)) {
        updateGroupChatSession(roomId, (session) => ({
          ...session,
          messages: mergeGroupMessages(
            messages,
            session.messages.map((message) => ({ ...message, read: true })) as unknown as ChatMessage[]
          ) as unknown as typeof session.messages,
        }))
      }
      setHistoryStatus({ chatId: roomId, loading: false })
    }).catch((error: unknown) => {
      if (cancelled) return
      setHistoryStatus({
        chatId: roomId,
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load room messages.',
      })
    })
    return () => { cancelled = true }
  }, [id, runtime, historyRetry])

  const serverConnected = runtime?.isServerConnected() ?? false

  useEffect(() => {
    const retryRequested = serverHistoryRetryRef.current !== historyRetry
    serverHistoryRetryRef.current = historyRetry
    const connectionChanged = serverHistoryRevisionRef.current !== serverConnectionRevision
    serverHistoryRevisionRef.current = serverConnectionRevision
    const groupId = id?.startsWith('group:') ? id.slice(6) : id
    const groupSession = groupId ? getGroupChatSession(groupId) : undefined
    const isServerMuc = groupSession?.chat.type === 'muc' && groupSession.chat.server !== 'muc.p2p'
    if (!id?.includes('@') || (!isServerMuc && (id.startsWith('group:') || id.toLowerCase().split('/')[0].endsWith('@p2p')))) return
    const queryHistory = isServerMuc ? runtime?.queryServerMucHistory : runtime?.queryServerChatHistory
    if (!runtime || !queryHistory) {
      setHistoryStatus({ chatId: id, loading: false, error: isServerMuc ? 'XMPP room archive history is unavailable in this browser.' : 'XMPP archive history is unavailable in this browser.' })
      return
    }
    if (!serverConnected) {
      setHistoryStatus({ chatId: id, loading: false, error: 'Connect to your XMPP server to load archived messages.' })
      return
    }

    const peerJid = isServerMuc ? groupSession!.chat.handle : id.split('/')[0]
    const queryKey = `${isServerMuc ? 'muc' : 'user'}:${peerJid}`
    let queried = queriedServerHistories.get(runtime as object)
    if (!queried) {
      queried = new Map<string, Promise<{ before?: string; hasMore: boolean }>>()
      queriedServerHistories.set(runtime as object, queried)
    }
    if (retryRequested || (connectionChanged && serverConnected)) queried.delete(queryKey)
    let query = queried.get(queryKey)
    if (!query) {
      query = queryHistory.call(runtime, peerJid)
      queried.set(queryKey, query)
      void query.catch(() => queried?.delete(queryKey))
    }

    let cancelled = false
    setHistoryStatus({ chatId: id, loading: true })
    void query.then((page) => {
      if (!cancelled) setHistoryStatus({ chatId: id, loading: false, before: page.before, hasMore: page.hasMore })
    }).catch((error: unknown) => {
      if (cancelled) return
      setHistoryStatus({
        chatId: id,
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load XMPP archive history.',
      })
    })
    return () => { cancelled = true }
  }, [id, runtime, historyRetry, serverConnectionRevision, serverConnected])

  useEffect(() => {
    const retryRequested = p2pHistoryRetryRef.current !== historyRetry
    p2pHistoryRetryRef.current = historyRetry
    if (!id?.toLowerCase().endsWith('@p2p')) return
    if (!runtime?.queryChatHistory) {
      setHistoryStatus({ chatId: id, loading: false, error: 'The peer network is unavailable.' })
      return
    }
    const localJid = runtime.getLocalJid?.()
    if (!localJid) {
      setHistoryStatus({ chatId: id, loading: false, error: 'The local peer identity is not ready.' })
      return
    }

    let queried = queriedDirectHistories.get(runtime as object)
    if (!queried) {
      queried = new Map<string, Promise<string>>()
      queriedDirectHistories.set(runtime as object, queried)
    }
    if (retryRequested) queried.delete(id)
    let query = queried.get(id)
    if (!query) {
      query = runtime.queryChatHistory(id, localJid)
      queried.set(id, query)
      void query.catch(() => queried?.delete(id))
    }

    let cancelled = false
    setHistoryStatus({ chatId: id, loading: true })
    void query.then(() => {
      if (!cancelled) setHistoryStatus({ chatId: id, loading: false })
    }).catch((error: unknown) => {
      if (cancelled) return
      setHistoryStatus({
        chatId: id,
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load peer conversation history.',
      })
    })
    return () => { cancelled = true }
  }, [id, runtime, historyRetry, serverConnectionRevision, serverConnected])

  return useMemo(() => {
    if (!id) {
      return { chat: null, messages: [], historyLoading: false, refreshHistory, hasOlderHistory: false, loadingOlderHistory: false, loadOlderHistory, historyErrorIsOlder: false }
    }

    // Group sessions may use unprefixed id (legacy) or group: prefix.
    const groupId = id.startsWith('group:') ? id.slice(6) : id
    const groupSession = getGroupChatSession(groupId)
    if (groupSession) {
      return {
        chat: groupSession.chat as unknown as ChatThread,
        messages: mergeGroupMessages(mucHistory[groupId] ?? [], groupSession.messages as unknown as ChatMessage[]),
        historyLoading: historyStatus.chatId === groupId && historyStatus.loading,
        historyError: historyStatus.chatId === groupId ? historyStatus.error : undefined,
        refreshHistory,
        hasOlderHistory: false,
        loadingOlderHistory: false,
        loadOlderHistory,
        historyErrorIsOlder: false,
      }
    }

    const listEntry = chats.find((c) => c.id === id)
    if (listEntry) {
      return {
        chat: chatFromListEntry(listEntry),
        messages: listEntry.type === 'direct' ? loadDirectChatHistory(id).map(parseMessageAttachments) : [],
        historyLoading: historyStatus.chatId === id && historyStatus.loading,
        historyError: historyStatus.chatId === id ? historyStatus.error : undefined,
        refreshHistory,
        hasOlderHistory: historyStatus.chatId === id && Boolean(historyStatus.hasMore),
        loadingOlderHistory: historyStatus.chatId === id && Boolean(historyStatus.loadingOlder),
        loadOlderHistory,
        historyErrorIsOlder: historyStatus.chatId === id && Boolean(historyStatus.olderError),
      }
    }

    // A JID typed in the new-conversation flow is a valid conversation even
    // before it has been added to the roster.
    if (id.includes('@')) {
      const [local, domain] = id.split('@')
      const entry: ChatListEntry = {
        id,
        type: 'direct',
        name: local || id,
        handle: id,
        server: domain || 'p2p',
        lastMessage: { text: '', timestamp: '' },
        unread: 0,
        encrypted: supportsDirectChatOmemo(id) && isDirectChatEncryptionEnabled(id),
        participants: [{ name: local || id, handle: id, server: domain || 'p2p' }],
      }
      return {
        chat: chatFromListEntry(entry),
        messages: loadDirectChatHistory(id).map(parseMessageAttachments),
        historyLoading: historyStatus.chatId === id && historyStatus.loading,
        historyError: historyStatus.chatId === id ? historyStatus.error : undefined,
        refreshHistory,
        hasOlderHistory: historyStatus.chatId === id && Boolean(historyStatus.hasMore),
        loadingOlderHistory: historyStatus.chatId === id && Boolean(historyStatus.loadingOlder),
        loadOlderHistory,
        historyErrorIsOlder: historyStatus.chatId === id && Boolean(historyStatus.olderError),
      }
    }

    return { chat: null, messages: [], historyLoading: false, refreshHistory, hasOlderHistory: false, loadingOlderHistory: false, loadOlderHistory, historyErrorIsOlder: false }
  }, [id, chats, mucHistory, historyStatus, refreshHistory, loadOlderHistory])
}
