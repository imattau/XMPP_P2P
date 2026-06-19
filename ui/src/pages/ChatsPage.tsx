import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { listGroupChatSessions } from './chat-session'
import {
  Search, Settings, Hash, Users, Shield, Zap, Lock,
  User, MessageCircle, CheckCheck, Check, Clock, Pin,
  BellOff, ChevronDown, Edit3, Mic, Image, FileText, X,
  Filter,
} from 'lucide-react'

type ChatType = 'direct' | 'group' | 'muc'
type FilterType = 'all' | 'direct' | 'groups' | 'channels'

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
    kind?: 'text' | 'image' | 'audio' | 'file'
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

const CHATS: Chat[] = [
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

function OnlineRing({ online }: { online?: boolean }) {
  if (online === undefined) return null
  return (
    <span className={`absolute w-2 h-2 -right-px -bottom-px rounded-full border-[1.5px] border-background ${online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
  )
}

function MessageStatus({ msg }: { msg: Chat['lastMessage'] }) {
  if (msg.sender !== 'You') return null
  if (msg.read) return <CheckCheck size={12} className="text-primary flex-shrink-0" />
  if (msg.delivered) return <CheckCheck size={12} className="text-muted-foreground flex-shrink-0" />
  return <Check size={12} className="text-muted-foreground flex-shrink-0" />
}

function LastMessagePreview({ msg }: { msg: Chat['lastMessage'] }) {
  if (msg.kind === 'image') return <span className="flex items-center gap-1 text-muted-foreground"><Image size={11} /> Photo</span>
  if (msg.kind === 'audio') return <span className="flex items-center gap-1 text-muted-foreground"><Mic size={11} /> {msg.text}</span>
  if (msg.kind === 'file') return <span className="flex items-center gap-1 text-muted-foreground"><FileText size={11} /> {msg.text}</span>
  return <span className="truncate">{msg.text}</span>
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

function ChatRow({ chat }: { chat: Chat }) {
  const hasUnread = chat.unread > 0
  const navigate = useNavigate()
  return (
    <div onClick={() => navigate(`/chat/${chat.id}`)} className={`flex items-center gap-3 px-4 py-3 border-b border-border transition-colors cursor-pointer ${hasUnread ? 'bg-white/[0.025]' : 'hover:bg-white/[0.02]'}`}>
      <div className="relative flex-shrink-0">
        {chat.type === 'direct' ? (
          <div className="relative w-10 h-10">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border">
              {chat.avatar
                ? <img src={chat.avatar} alt={chat.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-sm font-semibold">{chat.name[0]}</div>
              }
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
            {chat.pinned && <Pin size={10} className="text-muted-foreground flex-shrink-0" />}
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
              <span className="text-accent text-[11px] font-medium flex items-center gap-1">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {chat.typing}
              </span>
            ) : (
              <LastMessagePreview msg={chat.lastMessage} />
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {chat.memberCount && chat.type !== 'direct' && (
              <span className="font-mono text-[10px] text-muted-foreground/60">
                {chat.memberCount > 999 ? (chat.memberCount / 1000).toFixed(1) + 'k' : chat.memberCount}
              </span>
            )}
            {hasUnread && (
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ${chat.muted ? 'bg-muted text-muted-foreground' : 'bg-primary text-white'}`}>
                {chat.unread > 99 ? '99+' : chat.unread}
              </span>
            )}
          </div>
        </div>
        {chat.topic && <p className="font-mono text-[10px] text-muted-foreground/50 truncate mt-0.5">{chat.topic}</p>}
      </div>
    </div>
  )
}

const FILTERS: { id: FilterType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'all', label: 'All', icon: MessageCircle },
  { id: 'direct', label: 'Direct', icon: User },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'channels', label: 'Channels', icon: Hash },
]

function buildPrivateGroupChatRows() {
  return listGroupChatSessions().map((session) => ({
    id: session.chat.id,
    type: 'group' as const,
    name: session.chat.name,
    handle: session.chat.handle,
    server: session.chat.server,
    participants: session.chat.participants,
    memberCount: session.chat.memberCount,
    lastMessage: {
      text: session.messages[session.messages.length - 1]?.content ?? 'Private group chat created',
      timestamp: session.messages[session.messages.length - 1]?.timestamp ?? 'now',
      read: true,
    },
    unread: 0,
    encrypted: session.chat.encrypted,
    muted: session.chat.muted,
    online: session.chat.online,
    persistent: session.chat.persistent,
    moderated: session.chat.moderated,
    anonymous: session.chat.anonymous,
    passwordProtected: session.chat.passwordProtected,
    memberOnly: session.chat.memberOnly,
    archived: session.chat.archived,
    topic: session.chat.subject,
  }))
}

export default function ChatsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const privateGroupChats = buildPrivateGroupChatRows()
  const chats = [...privateGroupChats, ...CHATS]

  const unread = {
    all: chats.reduce((a, c) => a + c.unread, 0),
    direct: chats.filter((c) => c.type === 'direct').reduce((a, c) => a + c.unread, 0),
    groups: chats.filter((c) => c.type === 'group').reduce((a, c) => a + c.unread, 0),
    channels: chats.filter((c) => c.type === 'muc').reduce((a, c) => a + c.unread, 0),
  }

  const filtered = chats
    .filter((c) => {
      const typeMatch = activeFilter === 'all'
        || (activeFilter === 'direct' && c.type === 'direct')
        || (activeFilter === 'groups' && c.type === 'group')
        || (activeFilter === 'channels' && c.type === 'muc')
      const searchMatch = !searchQuery
        || c.name.toLowerCase().includes(searchQuery.toLowerCase())
        || (c.handle || '').toLowerCase().includes(searchQuery.toLowerCase())
        || c.lastMessage.text.toLowerCase().includes(searchQuery.toLowerCase())
      return typeMatch && searchMatch
    })
    .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))

  const onlineContacts = chats.filter((c) => c.type === 'direct' && c.online)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Messages</span>
            <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">XMPP</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setSearchOpen((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
              <Search size={17} />
            </button>
            <button onClick={() => navigate('/chats/new')} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Edit3 size={17} />
            </button>
            <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Settings size={17} />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              )}
            </div>
          </div>
        )}

        <div className="flex border-t border-border">
          {FILTERS.map((f) => {
            const Icon = f.icon
            const active = activeFilter === f.id
            const badge = unread[f.id]
            return (
              <button key={f.id} onClick={() => setActiveFilter(f.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors relative ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                <div className="relative">
                  <Icon size={15} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-white text-[9px] font-mono flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                {f.label}
                {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
              </button>
            )
          })}
        </div>
      </header>

      <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[10px] text-muted-foreground">{onlineContacts.length} online</span>
          </div>
          <span className="text-border">|</span>
          <span className="font-mono text-[10px] text-muted-foreground">{filtered.length} conversations</span>
        </div>
        <button className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <Filter size={10} />Sort: Recent<ChevronDown size={10} />
        </button>
      </div>

      {(activeFilter === 'all' || activeFilter === 'direct') && !searchQuery && onlineContacts.length > 0 && (
        <div className="border-b border-border flex-shrink-0">
          <div className="flex gap-4 px-4 py-3 overflow-x-auto scrollbar-hidden">
            {onlineContacts.map((c) => (
              <button key={c.id} className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-accent/40 group-hover:border-accent transition-colors bg-secondary">
                    {c.avatar
                      ? <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-sm font-semibold">{c.name[0]}</div>
                    }
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-[1.5px] border-background" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground truncate w-12 text-center">{c.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {searchQuery && (
          <div className="px-4 py-2.5 border-b border-border">
            <span className="font-mono text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{searchQuery}"</span>
          </div>
        )}

        {!searchQuery && filtered.some((c) => c.pinned) && (
          <div className="px-4 py-1.5 flex items-center gap-2">
            <Pin size={10} className="text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pinned</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <MessageCircle size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No conversations found</p>
          </div>
        ) : (
          <>
            {filtered.filter((c) => c.pinned).map((chat) => <ChatRow key={chat.id} chat={chat} />)}
            {!searchQuery && filtered.some((c) => c.pinned) && filtered.some((c) => !c.pinned) && (
              <div className="px-4 py-1.5 flex items-center gap-2">
                <Clock size={10} className="text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Recent</span>
              </div>
            )}
            {filtered.filter((c) => !c.pinned).map((chat) => <ChatRow key={chat.id} chat={chat} />)}
          </>
        )}
      </main>
    </div>
  )
}
