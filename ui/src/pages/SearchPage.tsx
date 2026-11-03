import { useState, useMemo, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Search, ArrowLeft, X } from 'lucide-react'
import { listGroupChatSessions } from './chat-session'
import { useChatListBridge } from '../bridge/useChatListBridge'
import { listDirectChatHistories } from '../bridge/direct-chat-history'
import { useBrowserXmppBridge } from '../bridge/runtime'
import { parseAttachmentReferences, parseMessageAttachments } from '../bridge/chat/attachments'

interface SearchResult {
  id: string
  messageId?: string
  chatId: string
  chatName: string
  senderName: string
  content: string
  timestamp: string
  kind?: 'text' | 'image' | 'file' | 'audio' | 'system'
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const { chats } = useChatListBridge()
  const runtime = useBrowserXmppBridge()
  const [mucHistory, setMucHistory] = useState<Record<string, SearchResult[]>>({})
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyRetry, setHistoryRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refreshHistory = async () => {
      const sessions = listGroupChatSessions()
      if (!runtime?.getMucHistory) {
        setHistoryLoading(false)
        setHistoryError(sessions.length > 0
          ? 'Group history is unavailable. Search may only include messages saved on this device.'
          : '')
        return
      }
      setHistoryLoading(true)
      setHistoryError('')
      const histories = await Promise.all(sessions.map(async (session) => {
        const roomId = session.chat.id.replace(/@muc\.p2p$/, '')
        try {
          const messages = await runtime.getMucHistory(roomId)
          return [roomId, messages.map((message) => {
            const parsed = parseAttachmentReferences(message.body)
            return {
              id: message.id,
              chatId: session.chat.id,
              chatName: session.chat.name,
              senderName: message.from,
              content: parsed.content || parsed.attachments.map((attachment) => attachment.alt).join(', '),
              timestamp: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          }), false] as const
        } catch {
          return [roomId, [] as SearchResult[], true] as const
        }
      }))
      if (!cancelled) {
        setMucHistory(Object.fromEntries(histories.map(([roomId, messages]) => [roomId, messages])))
        const failedRooms = histories.filter(([, , failed]) => failed).length
        setHistoryError(failedRooms > 0
          ? `Could not load group history for ${failedRooms} room${failedRooms === 1 ? '' : 's'}. Search results may be incomplete.`
          : '')
        setHistoryLoading(false)
      }
    }

    const addLiveMessage = (event: any) => {
      const roomId = String(event.room ?? event.roomJid ?? '').replace(/@muc\.p2p$/, '')
      const session = listGroupChatSessions().find((entry) => entry.chat.id === roomId)
      if (!roomId || !session || !event.id || !event.body) return
      const result: SearchResult = {
        id: event.id,
        chatId: session.chat.id,
        chatName: session.chat.name,
        senderName: event.from ?? 'Participant',
        content: (() => {
          const parsed = parseAttachmentReferences(event.body)
          return parsed.content || parsed.attachments.map((attachment) => attachment.alt).join(', ')
        })(),
        timestamp: new Date(event.timestamp ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMucHistory((current) => ({
        ...current,
        [roomId]: [...(current[roomId] ?? []).filter((message) => message.id !== result.id), result],
      }))
    }

    void refreshHistory()
    const unsubscribe = runtime?.onMucMessage?.(addLiveMessage)
    window.addEventListener('xmpp-p2p:group-session-updated', refreshHistory)
    return () => {
      cancelled = true
      unsubscribe?.()
      window.removeEventListener('xmpp-p2p:group-session-updated', refreshHistory)
    }
  }, [runtime, historyRetry])

  const results = useMemo(() => {
    if (!query.trim()) return []

    const q = query.toLowerCase()
    const hits: SearchResult[] = []

    const sessions = listGroupChatSessions()
    for (const session of sessions) {
      const roomId = session.chat.id.replace(/@muc\.p2p$/, '')
      const messagesById = new Map<string, SearchResult>()
      for (const message of session.messages) {
        const parsed = parseMessageAttachments(message)
        messagesById.set(message.id, {
          id: message.id,
          chatId: session.chat.id,
          chatName: session.chat.name,
          senderName: message.senderName,
          content: parsed.content || parsed.fileName || parsed.attachments?.map((attachment) => attachment.alt).join(', ') || '',
          timestamp: message.timestamp,
          kind: message.kind,
        })
      }
      for (const message of mucHistory[roomId] ?? []) messagesById.set(message.id, message)
      for (const msg of messagesById.values()) {
        if (msg.kind === 'system') continue
        if (msg.content.toLowerCase().includes(q)) {
          hits.push({
            id: msg.id,
            messageId: msg.id,
            chatId: session.chat.id,
            chatName: session.chat.name,
            senderName: msg.senderName,
            content: msg.content,
            timestamp: msg.timestamp,
          })
        }
      }
    }

    const chatsById = new Map(chats.map((chat) => [chat.id, chat]))
    for (const history of listDirectChatHistories()) {
      const chat = chatsById.get(history.chatId)
      if (!chat) continue
      for (const rawMessage of history.messages) {
        const msg = parseMessageAttachments(rawMessage)
        const searchableContent = msg.content || msg.fileName || msg.attachments?.map((attachment) => attachment.alt).join(', ') || ''
        if (msg.kind === 'system' || !searchableContent.toLowerCase().includes(q)) continue
        hits.push({
          id: msg.id,
          messageId: msg.id,
          chatId: chat.id,
          chatName: chat.name,
          senderName: msg.senderName,
          content: searchableContent,
          timestamp: msg.timestamp,
        })
      }
    }

    for (const chat of chats) {
      if (chat.name.toLowerCase().includes(q) || (chat.handle || '').toLowerCase().includes(q)) {
        hits.push({
          id: `chat-${chat.id}`,
          chatId: chat.id,
          chatName: chat.name,
          senderName: '',
          content: chat.handle || '',
          timestamp: chat.lastMessage.timestamp,
        })
      }
    }

    return hits.slice(0, 50)
  }, [query, chats, mucHistory])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="sr-only">Search</h1>
          <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input aria-label="Search messages and conversations" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages or chats…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear message search" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"><X size={16} /></button>
            )}
          </div>
        </div>
        {query && <p className="px-4 pb-2 text-[11px] text-muted-foreground">Direct messages search this device only.</p>}
      </header>

      <main className="flex-1 overflow-y-auto">
        {!query && (
          <div className="px-6 py-8 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">Search messages saved on this device.</p>
          </div>
        )}
        {query && historyError && (
          <div role="alert" className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p className="min-w-0 flex-1 text-xs text-destructive">{historyError}</p>
            <button type="button" onClick={() => setHistoryRetry((count) => count + 1)} disabled={historyLoading}
              className="min-h-11 shrink-0 rounded-md border border-current/20 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
              {historyLoading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        {query && historyLoading && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-20" role="status">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Searching message history…</p>
          </div>
        ) : query && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-20">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="break-words px-4 text-center text-sm text-muted-foreground">No results for "{query}"</p>
          </div>
        ) : (
          results.map((r) => (
            <NavLink key={r.id}
              to={`/chat/${encodeURIComponent(r.chatId)}${r.messageId ? `?message=${encodeURIComponent(r.messageId)}` : ''}`}
              className="flex items-center gap-2 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{r.chatName}</span>
                  {r.senderName && <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">· {r.senderName}</span>}
                </div>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">{r.content}</p>
              </div>
              <div className="flex items-center flex-shrink-0">
                <span className="max-w-[4.5rem] truncate font-mono text-[10px] text-muted-foreground">{r.timestamp}</span>
              </div>
            </NavLink>
          ))
        )}
      </main>
    </div>
  )
}
