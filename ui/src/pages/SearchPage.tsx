import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Search, ArrowLeft, MessageCircle, Hash, X, ChevronRight } from 'lucide-react'
import { listGroupChatSessions } from './chat-session'
import { useChatListBridge } from '../bridge/useChatListBridge'

interface SearchResult {
  id: string
  chatId: string
  chatName: string
  senderName: string
  content: string
  timestamp: string
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { chats } = useChatListBridge()

  const results = useMemo(() => {
    if (!query.trim()) return []

    const q = query.toLowerCase()
    const hits: SearchResult[] = []

    const sessions = listGroupChatSessions()
    for (const session of sessions) {
      for (const msg of session.messages) {
        if (msg.kind === 'system') continue
        if (msg.content.toLowerCase().includes(q)) {
          hits.push({
            id: msg.id,
            chatId: session.chat.id,
            chatName: session.chat.name,
            senderName: msg.senderName,
            content: msg.content,
            timestamp: msg.timestamp,
          })
        }
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
  }, [query, chats])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages and conversations…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            {query && (
              <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {query && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No results for "{query}"</p>
          </div>
        ) : (
          results.map((r) => (
            <div key={r.id}
              onClick={() => navigate(`/chat/${r.chatId}`)}
              className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageCircle size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{r.chatName}</span>
                  {r.senderName && <span className="font-mono text-[10px] text-muted-foreground">· {r.senderName}</span>}
                </div>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">{r.content}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-[10px] text-muted-foreground">{r.timestamp}</span>
                <ChevronRight size={14} className="text-muted-foreground/40" />
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
