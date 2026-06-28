import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, ArrowLeft, User, Shield, Zap, ChevronRight, X, MessageCircle } from 'lucide-react'
import { useRosterBridge } from '../bridge/useRosterBridge'

export default function ContactsPage() {
  const navigate = useNavigate()
  const { contacts, loading } = useRosterBridge()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = contacts.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.nickname || '').toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q)
    )
  })

  const online = filtered.filter((c) => c.online)
  const offline = filtered.filter((c) => !c.online)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <User size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Contacts</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setSearchOpen(!searchOpen)}
              className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
              <Search size={17} />
            </button>
            <button onClick={() => navigate('/chats/new')} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <MessageCircle size={17} />
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border animate-pulse">
                <div className="w-10 h-10 rounded-full bg-secondary flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-secondary rounded w-1/3" />
                  <div className="h-3 bg-secondary rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <User size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No contacts match your search' : 'No contacts yet'}
            </p>
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Online — {online.length}
                </span>
              </div>
            )}
            {online.map((c) => (
              <div key={c.jid}
                onClick={() => navigate(`/chat/${c.jid}`)}
                className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground border border-border">
                    {(c.nickname || c.name || c.jid)[0].toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-[1.5px] border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{c.nickname || c.name || c.jid.split('@')[0]}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{c.jid}</span>
                </div>
                <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
              </div>
            ))}
            {offline.length > 0 && (
              <div className="px-4 py-2 border-b border-border">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Offline — {offline.length}
                </span>
              </div>
            )}
            {offline.map((c) => (
              <div key={c.jid}
                onClick={() => navigate(`/chat/${c.jid}`)}
                className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground border border-border opacity-60">
                    {(c.nickname || c.name || c.jid)[0].toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0 opacity-60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{c.nickname || c.name || c.jid.split('@')[0]}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{c.jid}</span>
                </div>
                <ChevronRight size={14} className="text-muted-foreground/20 flex-shrink-0" />
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  )
}
