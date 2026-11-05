import * as React from 'react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useChatListBridge } from '../bridge/useChatListBridge'
import {
  Search, Hash, Users, Shield, Lock,
  User, MessageCircle, CheckCheck, Check, Clock, Pin,
  BellOff, Edit3, Mic, Image, FileText, X, ChevronDown,
} from 'lucide-react'

type ChatType = 'direct' | 'group' | 'muc'
type FilterType = 'all' | 'direct' | 'groups' | 'channels' | 'archived'

interface ChatParticipant {
  name: string
  handle: string
  avatar?: string
  server: string
  online?: boolean
}

interface Chat {
  id: string
  type: ChatType
  name: string
  handle?: string
  avatar?: string
  server?: string
  participants?: ChatParticipant[]
  lastMessage: {
    text: string
    kind?: 'text' | 'image' | 'audio' | 'file' | 'system'
    sender?: string
    timestamp: string
    activityAt?: string
    read?: boolean
    delivered?: boolean
    receiptReceived?: boolean
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



function OnlineRing({ online }: { online?: boolean }) {
  if (!online) return null
  return <span className="absolute -right-px -bottom-px h-2 w-2 rounded-full border-[1.5px] border-background bg-accent" />
}

function MessageStatus({ msg }: { msg: Chat['lastMessage'] }) {
  if (msg.sender !== 'You') return null
  if (msg.receiptReceived) return <CheckCheck size={12} aria-label="Delivered" className="text-muted-foreground flex-shrink-0" />
  if (msg.delivered === false) return <Clock size={12} aria-label="Pending" className="text-muted-foreground flex-shrink-0" />
  return <Check size={12} aria-label="Sent" className="text-muted-foreground flex-shrink-0" />
}

function LastMessagePreview({ msg }: { msg: Chat['lastMessage'] }) {
  if (msg.kind === 'image') return <span className="flex items-center gap-1 text-muted-foreground"><Image size={11} /> Photo</span>
  if (msg.kind === 'audio') return <span className="flex min-w-0 items-center gap-1 text-muted-foreground"><Mic size={11} className="flex-shrink-0" /><span className="min-w-0 truncate">{msg.text}</span></span>
  if (msg.kind === 'file') return <span className="flex min-w-0 items-center gap-1 text-muted-foreground"><FileText size={11} className="flex-shrink-0" /><span className="min-w-0 truncate">{msg.text}</span></span>
  return <span className="min-w-0 truncate">{msg.text}</span>
}

function GroupAvatars({ participants, count }: { participants?: ChatParticipant[]; count?: number }) {
  const shown = (participants || []).slice(0, 2)
  if (shown.length < 2) return (
    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Users size={16} className="text-muted-foreground" /></div>
  )
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <div className="absolute top-0 left-0 w-7 h-7 rounded-full bg-secondary border border-background overflow-hidden">
        <span className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-foreground">{shown[0]?.name[0]}</span>
      </div>
      <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-secondary border border-background overflow-hidden">
        <span className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-foreground">{shown[1]?.name[0]}</span>
      </div>
      {count && count > 2 && (
        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-muted border border-background flex items-center justify-center">
          <span className="text-[8px] font-mono text-muted-foreground">+{count - 2}</span>
        </div>
      )}
    </div>
  )
}

function ChatRow({ chat, searching = false }: { chat: Chat; searching?: boolean }) {
  const hasUnread = chat.unread > 0
  const chatPath = `/chat/${encodeURIComponent(chat.id)}`
  return (
    <NavLink to={chatPath} className={`flex min-w-0 items-center gap-3 px-4 py-2.5 border-b border-border transition-colors md:py-3 ${hasUnread ? 'bg-white/[0.025]' : 'hover:bg-white/[0.02]'}`}>
      <div className="relative flex-shrink-0">
        {chat.type === 'direct' ? (
          <div className="relative w-10 h-10">
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-sm font-semibold text-muted-foreground">
              <span aria-hidden="true">{chat.name.trim().charAt(0).toUpperCase() || '?'}</span>
              {chat.avatar && <img src={chat.avatar} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
            </div>
            <OnlineRing online={chat.online} />
          </div>
        ) : chat.type === 'group' ? (
          <GroupAvatars participants={chat.participants} count={chat.memberCount} />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20">
            <Hash size={16} className="text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {chat.pinned && <Pin size={10} className={`${searching ? '' : 'hidden md:block'} flex-shrink-0 text-muted-foreground`} />}
            <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>{chat.name}</span>
            {chat.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
            {chat.encrypted && <Lock size={9} className="text-accent flex-shrink-0" />}
            {chat.muted && <BellOff size={9} className="text-muted-foreground flex-shrink-0" />}
          </div>
          <span className={`font-mono text-[10px] ml-2 flex-shrink-0 ${hasUnread ? 'text-primary' : 'text-muted-foreground'}`}>
            {chat.lastMessage.timestamp}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1 text-[12px] min-w-0 flex-1 ${hasUnread ? 'text-foreground/70' : 'text-muted-foreground'}`}>
            <MessageStatus msg={chat.lastMessage} />
            {chat.typing ? (
              <span className="min-w-0 truncate text-accent text-[11px] font-medium flex items-center gap-1">
                <span aria-hidden="true" className="flex flex-shrink-0 gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="min-w-0 truncate">{chat.typing}</span>
              </span>
            ) : (
              <LastMessagePreview msg={chat.lastMessage} />
            )}
          </div>
          {hasUnread && (
            <span className={`min-w-[18px] h-[18px] px-1 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ${chat.muted ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          )}
        </div>
        {chat.topic && <p className="mt-0.5 hidden truncate font-mono text-[10px] text-muted-foreground sm:block">{chat.topic}</p>}
      </div>
    </NavLink>
  )
}

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'direct', label: 'Direct' },
  { id: 'groups', label: 'Groups' },
  { id: 'channels', label: 'Channels' },
  { id: 'archived', label: 'Archived' },
]

export default function ChatsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { chats } = useChatListBridge()

  const unread = {
    all: chats.reduce((a, c) => a + c.unread, 0),
    direct: chats.filter((c) => c.type === 'direct').reduce((a, c) => a + c.unread, 0),
    groups: chats.filter((c) => c.type === 'group').reduce((a, c) => a + c.unread, 0),
    channels: chats.filter((c) => c.type === 'muc').reduce((a, c) => a + c.unread, 0),
    archived: chats.filter((c) => c.archived).reduce((a, c) => a + c.unread, 0),
  }

  const filtered = chats
    .filter((c) => {
      const typeMatch = activeFilter === 'archived'
        ? Boolean(c.archived)
        : !c.archived && (activeFilter === 'all'
          || (activeFilter === 'direct' && c.type === 'direct')
          || (activeFilter === 'groups' && c.type === 'group')
          || (activeFilter === 'channels' && c.type === 'muc'))
      const searchMatch = !searchQuery
        || c.name.toLowerCase().includes(searchQuery.toLowerCase())
        || (c.handle || '').toLowerCase().includes(searchQuery.toLowerCase())
        || c.lastMessage.text.toLowerCase().includes(searchQuery.toLowerCase())
      return typeMatch && searchMatch
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      const aActivity = Date.parse(a.lastMessage.activityAt ?? '') || 0
      const bActivity = Date.parse(b.lastMessage.activityAt ?? '') || 0
      return bActivity - aActivity
    })

  const showHeaderNewChat = (chats.length > 0 || activeFilter !== 'all')
    && !(filtered.length === 0 && !searchQuery && (activeFilter === 'groups' || activeFilter === 'channels'))

  return (
    <div className="flex min-w-0 flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground leading-tight">Chats</h1>
          </div>
          <div className="flex items-center gap-0.5">
            {chats.length > 0 && !searchOpen && <button onClick={() => setSearchOpen(true)} aria-label="Search conversations"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Search size={17} />
            </button>}
            {showHeaderNewChat && !searchOpen && (
              <button onClick={() => navigate('/chats/new')} aria-label="New conversation" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <Edit3 size={17} />
              </button>
            )}
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input aria-label="Search conversations" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <button onClick={() => {
                if (searchQuery) setSearchQuery('')
                else setSearchOpen(false)
              }} aria-label={searchQuery ? 'Clear conversation search' : 'Close conversation search'}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"><X size={14} /></button>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)}
                  aria-label={`Search messages for ${searchQuery.trim()}`}
                  title="Search messages"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  <MessageCircle size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {chats.length > 0 && <div className="border-t border-border px-4 py-2 md:hidden">
          <details className="relative">
            <summary className="flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground">
              <span className="flex-1">{FILTERS.find((filter) => filter.id === activeFilter)?.label ?? 'All'}</span>
              {unread[activeFilter] > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs tabular-nums text-primary">{unread[activeFilter] > 99 ? '99+' : unread[activeFilter]} unread</span>}
              <ChevronDown size={15} className="text-muted-foreground" />
            </summary>
            <div role="group" aria-label="Conversation filters" className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-border bg-card p-1.5 shadow-xl">
              {FILTERS.map((filter) => {
                const active = activeFilter === filter.id
                const badge = unread[filter.id]
                return (
                  <button key={filter.id} type="button" aria-pressed={active}
                    onClick={(event) => { setActiveFilter(filter.id); event.currentTarget.closest('details')?.removeAttribute('open') }}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${active ? 'bg-blue2 font-semibold text-primary' : 'text-foreground hover:bg-secondary'}`}>
                    <span className="flex-1">{filter.label}</span>
                    {badge > 0 && <span className="text-xs tabular-nums text-muted-foreground">{badge > 99 ? '99+' : badge}</span>}
                  </button>
                )
              })}
            </div>
          </details>
        </div>}

        <div role="group" aria-label="Conversation filters" className="hidden gap-2 overflow-x-auto border-t border-border px-4 py-2 scrollbar-hidden md:flex">
          {FILTERS.map((f) => {
            const active = activeFilter === f.id
            const badge = unread[f.id]
            return (
              <button key={f.id} type="button" aria-pressed={active} onClick={() => setActiveFilter(f.id)}
                className={`flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${active ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                {f.label}
                {badge > 0 && <span className={`text-[10px] ${active ? 'text-primary' : 'text-muted-foreground'}`}>{badge > 99 ? '99+' : badge}</span>}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {searchQuery && (
          <div className="px-4 py-2.5 border-b border-border">
            <span className="block truncate font-mono text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{searchQuery}"</span>
          </div>
        )}

        {!searchQuery && filtered.some((c) => c.pinned) && (
          <div className="px-4 py-1.5 flex items-center gap-2">
            <Pin size={10} className="text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pinned</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-20">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <MessageCircle size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {searchQuery ? 'No conversations match your search.' : activeFilter === 'archived' ? 'No archived conversations.' : activeFilter === 'groups' ? 'No peer groups yet.' : activeFilter === 'channels' ? 'No channels yet.' : chats.length ? 'No conversations in this filter.' : 'No conversations yet.'}
            </p>
            {!searchQuery && (chats.length === 0 || activeFilter === 'groups' || activeFilter === 'channels') && (
              <button onClick={() => navigate(activeFilter === 'groups' ? '/chats/new?flow=group' : activeFilter === 'channels' ? '/chats/new?flow=muc' : '/chats/new')} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                {activeFilter === 'groups' ? 'Create a peer group' : activeFilter === 'channels' ? 'Browse or join a channel' : 'Start a conversation'}
              </button>
            )}
          </div>
        ) : (
          <>
            {filtered.filter((c) => c.pinned).map((chat) => <ChatRow key={chat.id} chat={chat} searching={Boolean(searchQuery)} />)}
            {!searchQuery && filtered.some((c) => c.pinned) && filtered.some((c) => !c.pinned) && (
              <div className="px-4 py-1.5 flex items-center gap-2">
                <Clock size={10} className="text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Recent</span>
              </div>
            )}
            {filtered.filter((c) => !c.pinned).map((chat) => <ChatRow key={chat.id} chat={chat} searching={Boolean(searchQuery)} />)}
          </>
        )}
      </main>
    </div>

    </div>
  )
}
