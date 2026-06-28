import { Shield, Lock, Hash, Users, BellOff, Bell } from 'lucide-react'

interface DetailsChat {
  type: 'direct' | 'group' | 'muc'
  name: string
  handle?: string
  avatar?: string
  server?: string
  encrypted?: boolean
  online?: boolean
  verified?: boolean
  muted?: boolean
  memberCount?: number
  topic?: string
}

export default function ConversationDetails({ chat }: { chat: DetailsChat | null }) {
  if (!chat) {
    return (
      <div className="w-[280px] border-l border-border bg-card flex-shrink-0 h-full hidden lg:flex flex-col items-center justify-center p-5">
        <p className="text-sm text-muted-foreground text-center">Select a conversation to view details</p>
      </div>
    )
  }

  return (
    <div className="w-[280px] border-l border-border bg-card flex-shrink-0 h-full overflow-y-auto hidden lg:flex flex-col">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <span className="text-[13px] font-semibold text-foreground">Conversation details</span>
      </div>

      <div className="flex flex-col items-center px-5 pt-6 pb-4 border-b border-border">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold text-foreground mb-3">
          {chat.avatar
            ? <img src={chat.avatar} alt={chat.name} className="w-full h-full rounded-full object-cover" />
            : chat.name[0].toUpperCase()
          }
        </div>
        <div className="text-[15px] font-semibold text-foreground text-center">{chat.name}</div>
        {chat.handle && (
          <div className="text-[11px] font-mono text-muted-foreground">{chat.handle}</div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className={`flex items-center gap-1 text-[11px] font-mono ${chat.online ? 'text-accent' : 'text-muted-foreground'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${chat.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
            {chat.online ? 'Online' : 'Offline'}
          </span>
          {chat.encrypted && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-accent">
              <Lock size={10} />
              Encrypted
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-3 space-y-3">
        {chat.type !== 'direct' && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-muted-foreground">Type</span>
            <span className="text-[12px] font-mono text-foreground flex items-center gap-1">
              {chat.type === 'group' ? <Users size={12} /> : <Hash size={12} />}
              {chat.type === 'group' ? 'Group' : 'Channel'}
              {chat.memberCount && <span className="text-muted-foreground">· {chat.memberCount} members</span>}
            </span>
          </div>
        )}
        {chat.server && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-muted-foreground">Server</span>
            <span className="text-[12px] font-mono text-foreground">{chat.server}</span>
          </div>
        )}
        {chat.topic && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-mono text-muted-foreground shrink-0">Topic</span>
            <span className="text-[12px] font-mono text-foreground text-right">{chat.topic}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground">Notifications</span>
          <span className="text-muted-foreground">
            {chat.muted ? <BellOff size={14} /> : <Bell size={14} />}
          </span>
        </div>
        {chat.verified && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-muted-foreground">Verified</span>
            <Shield size={14} className="text-primary" />
          </div>
        )}
      </div>
    </div>
  )
}
