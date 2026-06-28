import * as React from 'react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getBrowserXmppBridge, useChatBridge, useChatThreadBridge, type ChatAttachment as BridgeChatAttachment, type ChatMessage as BridgeChatMessage, type ChatMessageReply as BridgeChatMessageReply, type ChatThread as BridgeChatThread } from '../bridge'
import { useRosterBridge } from '../bridge/useRosterBridge'
import { removeGroupChatSession, updateGroupChatSession } from './chat-session'
import MediaViewer from '../components/MediaViewer'
import { emitToast } from '../lib/toast-events'
import {
  ArrowLeft, Phone, Video, Info, X, Send, Smile, Paperclip,
  Mic, Shield, Lock, BellOff, Bell, Trash2, LogOut, Users,
  Hash, Globe, EyeOff, UserPlus, UserMinus, Settings,
  CheckCheck, Check, Image, FileText, MoreHorizontal,
  MessageSquare, Key, Archive, ChevronRight, Crown, Gavel, CornerUpLeft,
  Zap, Copy, Star, AlertTriangle, Upload, ImagePlus, AtSign,
} from 'lucide-react'

type ChatType = 'direct' | 'group' | 'muc'

interface Participant {
  id: string
  name: string
  handle: string
  avatar?: string
  server: string
  online?: boolean
  role?: 'owner' | 'admin' | 'moderator' | 'member' | 'visitor'
}

interface Message {
  id: string
  senderId: string
  senderName: string
  senderAvatar?: string
  content: string
  timestamp: string
  kind?: 'text' | 'image' | 'file' | 'audio' | 'system'
  delivered?: boolean
  read?: boolean
  reactions?: { emoji: string; count: number; mine?: boolean }[]
  replyTo?: BridgeChatMessageReply
  thread?: string
  fileName?: string
  attachments?: BridgeChatAttachment[]
}

interface ChatData {
  id: string
  type: ChatType
  name: string
  handle?: string
  avatar?: string
  server?: string
  subject?: string
  participants: Participant[]
  encrypted: boolean
  muted?: boolean
  online?: boolean
  verified?: boolean
  memberCount?: number
  persistent?: boolean
  moderated?: boolean
  anonymous?: boolean
  passwordProtected?: boolean
  memberOnly?: boolean
  archived?: boolean
}

const ME = 'me'

const MAX_IMAGES = 4

const EMOJI_CATEGORIES: { id: string; label: string; icon: string; emojis: string[] }[] = [
  { id: 'recent', label: 'Recent', icon: '🕐', emojis: ['👍', '❤️', '😂', '🔥', '✅', '🚀', '👀', '💯', '🙏', '😎', '🤔', '⚡'] },
  { id: 'smileys', label: 'Smileys', icon: '😀', emojis: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '🥰', '😘', '😗', '🙂', '🤗', '🤩', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤫', '🤔', '🤭', '🫢', '😶', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'] },
  { id: 'gestures', label: 'Gestures', icon: '👋', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '🤙', '💪', '🦾', '🖕', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🙏', '✍️', '💅', '🤳', '💃', '🕺'] },
  { id: 'people', label: 'People', icon: '👤', emojis: ['👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵', '🧕', '👮', '🕵️', '💂', '🥷', '👷', '🫅', '🤴', '👸', '👳', '👲', '🧙', '🧝', '🧛', '🧟', '🧞', '🧜', '🧚', '👼', '🤶', '🎅', '🦸', '🦹'] },
  { id: 'nature', label: 'Nature', icon: '🌿', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🌿', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '⭐', '🔥', '🌈', '☁️', '⛅', '❄️', '🌊'] },
  { id: 'food', label: 'Food', icon: '🍕', emojis: ['🍕', '🍔', '🌮', '🌯', '🥗', '🍜', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍛', '🍝', '🍠', '🥘', '🍲', '🥫', '🧆', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🥪', '🧀', '🥨', '🥐', '🍞', '🥖', '🫓', '🍰', '🎂', '🧁', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '☕', '🍵', '🧃', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹'] },
  { id: 'travel', label: 'Travel', icon: '✈️', emojis: ['🚀', '✈️', '🛸', '🚁', '🛺', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🛻', '🚚', '🚛', '🚜', '🏎', '🏍', '🛵', '🚲', '🛴', '🛹', '🛼', '🚏', '🛣', '🛤', '⛽', '🚨', '🚥', '🚦', '🛑', '⚓', '🚢', '🛳', '⛴', '🛥', '🚤', '🏊', '🏄', '🌍', '🗺', '🧭', '🏔', '⛰', '🌋', '🗻', '🏕', '🏖', '🏜', '🏝'] },
  { id: 'objects', label: 'Objects', icon: '💡', emojis: ['💡', '🔦', '🕯', '🪔', '💻', '🖥', '🖨', '⌨️', '🖱', '🖲', '💽', '💾', '💿', '📀', '📱', '☎️', '📞', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '🧭', '⏱', '⏰', '⌚', '📡', '🔋', '🪫', '🔌', '💡', '🔦', '🕯', '🗑', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '🪙', '💎', '⚖️', '🧲', '🔧', '🪛', '🔩', '⚙️', '🗜', '🔗', '⛓', '🪝', '🔪', '🗡', '⚔️', '🛡', '🪃', '🏹', '🔑', '🗝', '🔐', '🔒', '🔓'] },
  { id: 'symbols', label: 'Symbols', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💯', '💢', '💥', '💫', '💦', '💨', '🕳', '💬', '💭', '💤', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '✅', '❌', '⭕', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔷', '🔶', '🔹', '🔸', '▶️', '⏩', '⏪', '⏫', '⏬', '⏭', '⏮', '🔀', '🔁', '🔂', '▶️', '⏸', '⏹', '⏺', '🎦', '🔅', '🔆', '📶', '📳', '📴', '📵', '📳'] },
]

const GALLERY_PHOTOS = [
  { id: 'g1', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop&auto=format', alt: 'Circuit board' },
  { id: 'g2', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=200&h=200&fit=crop&auto=format', alt: 'Server rack' },
  { id: 'g3', url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=200&h=200&fit=crop&auto=format', alt: 'Office workspace' },
  { id: 'g4', url: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&h=200&fit=crop&auto=format', alt: 'Code on monitor' },
  { id: 'g5', url: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=200&h=200&fit=crop&auto=format', alt: 'Developer at laptop' },
  { id: 'g6', url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200&h=200&fit=crop&auto=format', alt: 'Matrix digital rain' },
  { id: 'g7', url: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=200&h=200&fit=crop&auto=format', alt: 'Laptop on desk' },
  { id: 'g8', url: 'https://images.unsplash.com/photo-1509395176047-4a66953fd231?w=200&h=200&fit=crop&auto=format', alt: 'Network cables' },
]

function MessageStatus({ msg }: { msg: Message }) {
  if (msg.senderId !== ME) return null
  if (msg.read) return <CheckCheck size={12} className="text-primary" />
  if (msg.delivered) return <CheckCheck size={12} className="text-muted-foreground" />
  return <Check size={12} className="text-muted-foreground" />
}

function RoleIcon({ role }: { role?: string }) {
  if (role === 'owner') return <Crown size={11} className="text-amber-400" />
  if (role === 'admin') return <Shield size={11} className="text-primary" />
  if (role === 'moderator') return <Gavel size={11} className="text-accent" />
  return null
}

function splitQuotedBody(content: string) {
  const lines = content.split('\n')
  const quoteLines: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.startsWith('> ')) {
      quoteLines.push(line.slice(2))
      index += 1
      continue
    }
    if (line === '' && quoteLines.length > 0) {
      index += 1
      break
    }
    break
  }

  return {
    quote: quoteLines.length > 0 ? quoteLines.join('\n') : undefined,
    body: lines.slice(index).join('\n').trim()
  }
}

function Bubble({
  msg,
  isMine,
  showAvatar,
  type,
  onReply,
  onEdit,
  onImageClick,
  replyPreview,
}: {
  msg: Message
  isMine: boolean
  showAvatar: boolean
  type: ChatType
  onReply: (message: Message) => void
  onEdit?: (messageId: string) => void
  onImageClick?: (url: string, alt: string) => void
  replyPreview?: { senderName: string; content: string }
}) {
  if (msg.kind === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="font-mono text-[10px] text-muted-foreground bg-secondary/60 px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    )
  }

  const parsedBody = msg.kind === 'audio' || msg.kind === 'file'
    ? undefined
    : splitQuotedBody(msg.content)
  const imageAttachments = msg.attachments?.filter((attachment) => attachment.kind === 'image') ?? []
  const fileAttachments = msg.attachments?.filter((attachment) => attachment.kind === 'file') ?? []

  return (
    <div className={`flex gap-2 mb-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isMine && (type === 'group' || type === 'muc') ? (
        <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0 self-end mb-1">
          {showAvatar && msg.senderAvatar
            ? <img src={msg.senderAvatar} alt={msg.senderName} className="w-full h-full object-cover" />
            : showAvatar
            ? <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-foreground">{msg.senderName[0]}</div>
            : null
          }
        </div>
      ) : !isMine && type === 'direct' ? (
        <div className="w-7 flex-shrink-0" />
      ) : null}

      <div className={`max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (type === 'group' || type === 'muc') && showAvatar && (
          <span className="font-mono text-[10px] text-muted-foreground mb-0.5 px-1">{msg.senderName}</span>
        )}

        {replyPreview && (
          <div className={`text-[11px] px-2.5 py-1 mb-0.5 rounded border-l-2 border-primary bg-primary/5 text-muted-foreground max-w-full ${isMine ? 'text-right' : ''}`}>
            <span className="font-mono text-primary">{replyPreview.senderName}</span>
            <p className="truncate">{replyPreview.content}</p>
          </div>
        )}

        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
          isMine
            ? 'bg-primary text-white rounded-tr-sm'
            : 'bg-secondary text-foreground rounded-tl-sm'
        } ${msg.kind === 'audio' ? 'flex items-center gap-2' : ''}`}>
          {imageAttachments.length > 0 ? (
            <div className="space-y-2">
              <div className={`grid gap-2 ${imageAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {imageAttachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    onClick={() => onImageClick?.(attachment.url, attachment.alt)}
                    className="block overflow-hidden rounded-xl border border-border bg-black/10 w-full text-left"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.alt}
                      className="block w-full h-full max-h-72 object-cover"
                    />
                  </button>
                ))}
              </div>
              {parsedBody?.body ? <p className="whitespace-pre-wrap">{parsedBody.body}</p> : null}
            </div>
          ) : msg.kind === 'audio' ? (
            <>
              <Mic size={14} className={isMine ? 'text-white/80' : 'text-muted-foreground'} />
              <span className="font-mono text-[12px]">{msg.fileName || msg.content}</span>
            </>
          ) : msg.kind === 'file' || fileAttachments.length > 0 ? (
            <div className="space-y-2">
              {msg.content ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
              <div className="space-y-2">
                {(msg.attachments ?? []).filter((attachment) => attachment.kind === 'file').map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2">
                    <FileText size={13} className={isMine ? 'text-white/80' : 'text-muted-foreground'} />
                    <span className="font-mono text-[12px] truncate">{attachment.alt}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {parsedBody?.quote && (
                <div className={`rounded-lg border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed ${isMine ? 'border-white/40 bg-white/10 text-white/85' : 'border-primary bg-primary/5 text-muted-foreground'}`}>
                  <p className="font-mono mb-1 opacity-80">Quoted</p>
                  <p className="whitespace-pre-wrap">{parsedBody.quote}</p>
                </div>
              )}
              {parsedBody?.body ? (
                <p className="whitespace-pre-wrap">{parsedBody.body}</p>
              ) : !parsedBody?.quote ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : null}
            </div>
          )}
        </div>

        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {msg.reactions.map((r) => (
              <span key={r.emoji} className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors ${r.mine ? 'border-primary/40 bg-primary/10' : 'border-border bg-secondary'}`}>
                {r.emoji} <span className="font-mono text-[10px] text-muted-foreground">{r.count}</span>
              </span>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1 mt-0.5 px-0.5 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="font-mono text-[9px] text-muted-foreground">{msg.timestamp}</span>
          <MessageStatus msg={msg} />
        </div>

        <div className={`flex items-center gap-2 mt-1 ${isMine ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={() => onReply(msg)}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <CornerUpLeft size={10} />
            Reply
          </button>
          {isMine && onEdit && (
            <button
              onClick={() => onEdit(msg.id)}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <Zap size={10} />
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DirectSettings({ chat }: { chat: ChatData }) {
  const [muted, setMuted] = useState(chat.muted ?? false)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const other = chat.participants.find((p) => p.id !== ME)!

  useEffect(() => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.getPeerOmemoFingerprint || !other.handle) return
    void bridge.getPeerOmemoFingerprint(other.handle).then((fp) => {
      if (fp) setFingerprint(fp)
    })
  }, [other.handle])

  return (
    <div className="overflow-y-auto flex-1">
      <div className="px-4 py-5 flex flex-col items-center gap-2 border-b border-border">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary border border-border">
          {chat.avatar ? <img src={chat.avatar} alt={chat.name} className="w-full h-full object-cover" /> : null}
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm text-foreground">{chat.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{chat.handle}</p>
          <p className="font-mono text-[10px] text-muted-foreground/60">{other.server}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${chat.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
          <span className="font-mono text-[10px] text-muted-foreground">{chat.online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Encryption</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-accent" />
            <span className="text-sm text-foreground">OMEMO E2EE</span>
          </div>
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${chat.encrypted ? 'text-accent bg-accent/10' : 'text-muted-foreground bg-secondary'}`}>
            {chat.encrypted ? 'Active' : 'Inactive'}
          </span>
        </div>
        {fingerprint && (
          <div className="mt-2">
            <p className="font-mono text-[9px] text-muted-foreground mb-0.5">Fingerprint (SHA-256)</p>
            <p className="font-mono text-[8px] text-foreground/50 leading-relaxed break-all select-all">{fingerprint}</p>
          </div>
        )}
      </div>

      <div className="border-b border-border">
        {[
          { icon: muted ? Bell : BellOff, label: muted ? 'Unmute notifications' : 'Mute notifications', action: () => setMuted((v) => !v) },
          { icon: Archive, label: 'Archive conversation' },
          { icon: Copy, label: 'Copy JID' },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left text-foreground/80">
            <Icon size={15} /><span className="text-sm">{label}</span>
          </button>
        ))}
      </div>

      <div className="border-b border-border">
        {[
          { icon: Trash2, label: 'Clear message history', danger: false },
          { icon: AlertTriangle, label: 'Block contact', danger: true },
        ].map(({ icon: Icon, label, danger }) => (
          <button key={label} className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left ${danger ? 'text-destructive' : 'text-foreground/80'}`}>
            <Icon size={15} /><span className="text-sm">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function GroupSettings({
  chat,
  onToggleMute,
  onArchive,
  onLeave,
}: {
  chat: ChatData
  onToggleMute: () => void
  onArchive: () => void
  onLeave: () => void
}) {
  return (
    <div className="overflow-y-auto flex-1">
      <div className="px-4 py-4 border-b border-border">
        <p className="font-semibold text-sm text-foreground mb-0.5">{chat.name}</p>
        {chat.subject && <p className="text-[12px] text-muted-foreground leading-relaxed">{chat.subject}</p>}
        <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">{chat.memberCount} members · {chat.server}</p>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Encryption</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-accent" />
            <span className="text-sm text-foreground">OMEMO E2EE</span>
          </div>
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${chat.encrypted ? 'text-accent bg-accent/10' : 'text-muted-foreground bg-secondary'}`}>
            {chat.encrypted ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Members</p>
          <button className="flex items-center gap-1 text-[11px] font-mono text-primary hover:underline">
            <UserPlus size={11} />Invite
          </button>
        </div>
        <div className="flex flex-col gap-0">
          {chat.participants.filter((p) => p.id !== ME).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold">{p.name[0]}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[12px] font-medium text-foreground truncate">{p.name}</span>
                  <RoleIcon role={p.role} />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground truncate">{p.handle}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${p.online ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-border">
        {[
          { icon: chat.muted ? Bell : BellOff, label: chat.muted ? 'Unmute' : 'Mute notifications', action: onToggleMute },
          { icon: Archive, label: chat.archived ? 'Unarchive' : 'Archive', action: onArchive },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left text-foreground/80">
            <Icon size={15} /><span className="text-sm">{label}</span>
          </button>
        ))}
      </div>
      <button onClick={onLeave} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left text-destructive">
        <LogOut size={15} /><span className="text-sm">Leave group</span>
      </button>
    </div>
  )
}

function MucSettings({ chat, onKick, onBan, onConfig }: { chat: ChatData; onKick?: (jid: string) => void; onBan?: (jid: string) => void; onConfig?: () => void }) {
  const [muted, setMuted] = useState(chat.muted ?? false)
  const [showActionPicker, setShowActionPicker] = useState<{ type: 'kick' | 'ban' } | null>(null)
  const myRole = chat.participants.find((p) => p.id === ME)?.role
  const canModerate = myRole === 'owner' || myRole === 'admin' || myRole === 'moderator'

  return (
    <div className="overflow-y-auto flex-1">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center border border-primary/20 flex-shrink-0">
            <Hash size={14} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground">{chat.name}</p>
            <p className="font-mono text-[10px] text-muted-foreground truncate">{chat.handle}</p>
          </div>
        </div>
        {chat.subject && <p className="text-[12px] text-muted-foreground leading-relaxed mt-2">{chat.subject}</p>}
      </div>

      <div className="px-4 py-3 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Room properties</p>
        <div className="space-y-2">
          {[
            { label: 'Members', value: `${chat.memberCount?.toLocaleString() ?? '—'} online` },
            { label: 'Persistent', value: chat.persistent ? 'Yes' : 'No' },
            { label: 'Moderated', value: chat.moderated ? 'Yes' : 'No' },
            { label: 'Anonymous', value: chat.anonymous ? 'Semi-anon' : 'Non-anon' },
            { label: 'Members only', value: chat.memberOnly ? 'Yes' : 'Open' },
            { label: 'Password', value: chat.passwordProtected ? 'Protected' : 'None' },
            { label: 'Encryption', value: chat.encrypted ? 'OMEMO' : 'None' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
              <span className="font-mono text-[10px] text-foreground/70">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Online now</p>
          <span className="font-mono text-[10px] text-muted-foreground">{chat.participants.filter((p) => p.online).length} visible</span>
        </div>
        {chat.participants.filter((p) => p.online).map((p) => (
          <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-secondary flex-shrink-0">
              {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-[9px] font-semibold">{p.name[0]}</div>}
            </div>
            <span className="text-[12px] text-foreground/80 flex-1 truncate font-mono">{p.id === ME ? 'you' : p.handle.split('@')[0]}</span>
            <RoleIcon role={p.role} />
          </div>
        ))}
      </div>

      <div className="border-b border-border">
        {[
          { icon: muted ? Bell : BellOff, label: muted ? 'Unmute' : 'Mute notifications', action: () => setMuted((v) => !v) },
          { icon: Star, label: 'Bookmark room (XEP-0048)' },
          { icon: Copy, label: 'Copy room JID' },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left text-foreground/80">
            <Icon size={15} /><span className="text-sm">{label}</span>
          </button>
        ))}
      </div>

      {canModerate && (
        <div className="border-b border-border">
          <p className="px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Moderation</p>
          <button onClick={onConfig} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
            <Settings size={15} /><span className="text-sm">Room configuration</span>
            <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
          </button>
          <button onClick={() => setShowActionPicker({ type: 'kick' })} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
            <UserMinus size={15} /><span className="text-sm">Kick participant</span>
            <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
          </button>
          <button onClick={() => setShowActionPicker({ type: 'ban' })} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
            <AlertTriangle size={15} /><span className="text-sm">Ban participant</span>
            <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
          </button>
        </div>
      )}

      {showActionPicker && (
        <div className="border-b border-border px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {showActionPicker.type === 'kick' ? 'Select participant to kick' : 'Select participant to ban'}
          </p>
          {chat.participants.filter((p) => p.id !== ME).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if (showActionPicker.type === 'kick') onKick?.(p.handle || p.id)
                else onBan?.(p.handle || p.id)
                setShowActionPicker(null)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary transition-colors rounded-lg text-left"
            >
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
                {p.name[0]}
              </div>
              <span className="text-[12px] text-foreground/80 flex-1 font-mono">{p.handle}</span>
            </button>
          ))}
          <button onClick={() => setShowActionPicker(null)} className="mt-2 text-[11px] font-mono text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      )}
      <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left text-destructive">
        <LogOut size={15} /><span className="text-sm">Leave channel</span>
      </button>

      <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left text-destructive">
        <LogOut size={15} /><span className="text-sm">Leave channel</span>
      </button>
    </div>
  )
}

export default function ChatThreadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { onlinePeers } = useRosterBridge()
  const { chat: resolvedChat, messages: initialMessages } = useChatThreadBridge(id)
  const chat = useMemo(() => {
    const c = { ...resolvedChat } as ChatData
    if (c.handle && onlinePeers.has(c.handle)) {
      c.online = true
    }
    if (c.participants) {
      c.participants = c.participants.map((p: any) => ({
        ...p,
        online: onlinePeers.has(p.handle) || onlinePeers.has(`${p.handle}@${p.server}`) || p.online
      }))
    }
    return c
  }, [resolvedChat, onlinePeers])
  const [groupMuted, setGroupMuted] = useState(chat.muted ?? false)
  const [groupArchived, setGroupArchived] = useState(chat.archived ?? false)
  const [showInfo, setShowInfo] = useState(false)
  const [mediaViewer, setMediaViewer] = useState<{ items: Array<{ url: string; alt: string }>; index: number } | null>(null)
  const [modAction, setModAction] = useState<{ type: 'kick' | 'ban'; target: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const {
    messages,
    input,
    showImagePicker,
    showEmojiPicker,
    showMentionPicker,
    mentionQuery,
    emojiCategory,
    emojiSearch,
    selectedAttachments,
    replyTo,
    filteredMentions,
    handleInputChange,
    insertMention,
    insertEmoji,
    toggleAttachment,
    removeAttachment,
    setShowImagePicker,
    toggleImagePicker,
    setShowEmojiPicker,
    toggleEmojiPicker,
    setShowMentionPicker,
    setEmojiCategory,
    setEmojiSearch,
    setReplyTo,
    sendMessage,
    editingMessageId,
    startEdit,
    cancelEdit,
    typingPeer,
  } = useChatBridge(chat as BridgeChatThread, initialMessages as BridgeChatMessage[])

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [messages])

  useEffect(() => {
    if (chat.type !== 'group') {
      return
    }

    const bridge = getBrowserXmppBridge()
    if (!bridge?.getMucRoomSettings) {
      return
    }

    let cancelled = false
    void bridge.getMucRoomSettings(chat.id).then((settings) => {
      if (cancelled || !settings || typeof settings.archived !== 'boolean') {
        return
      }

      setGroupArchived((currentArchived) => {
        if (currentArchived === settings.archived) {
          return currentArchived
        }

        updateGroupChatSession(chat.id, (session) => ({
          ...session,
          chat: {
            ...session.chat,
            archived: settings.archived ?? false
          }
        }))
        return settings.archived ?? false
      })
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [chat.id])

  useEffect(() => {
    if (!modAction || !chat.handle) return
    const bridge = getBrowserXmppBridge()
    const roomJid = chat.handle
    const action = modAction.type === 'kick'
      ? bridge?.kickMucParticipant(roomJid, modAction.target)
      : bridge?.banMucParticipant(roomJid, modAction.target)
    if (action) {
      void action.then(() => {
        emitToast(`Participant ${modAction.type === 'kick' ? 'kicked' : 'banned'}`, 'success')
      }).catch(() => {
        emitToast(`Failed to ${modAction.type} participant`, 'error')
      })
    }
    setModAction(null)
  }, [modAction, chat.handle])

  const isMine = (msg: Message) => msg.senderId === ME
  const showAvatar = (i: number) => {
    const cur = messages[i]
    const next = messages[i + 1]
    return !next || next.senderId !== cur.senderId || next.kind === 'system'
  }

  const resolveReplyPreview = (msg: Message) => {
    const replyId = msg.replyTo?.messageId
    if (!replyId) {
      return msg.replyTo?.senderName || msg.replyTo?.content
        ? { senderName: msg.replyTo?.senderName ?? 'Reply', content: msg.replyTo?.content ?? 'Referenced message' }
        : undefined
    }

    const original = messages.find((entry) => entry.id === replyId)
    if (!original) {
      return msg.replyTo?.senderName || msg.replyTo?.content
        ? { senderName: msg.replyTo?.senderName ?? 'Reply', content: msg.replyTo?.content ?? 'Referenced message' }
        : undefined
    }

    return {
      senderName: original.senderName,
      content: original.content
    }
  }

  const isPrivateGroupChat = chat.type === 'group'
  const groupChatState = isPrivateGroupChat
    ? { ...chat, muted: groupMuted, archived: groupArchived }
    : chat

  const handleToggleGroupMute = () => {
    setGroupMuted((nextMuted) => {
      const updatedMuted = !nextMuted
      if (chat.type === 'group') {
        updateGroupChatSession(chat.id, (session) => ({
          ...session,
          chat: {
            ...session.chat,
            muted: updatedMuted
          }
        }))
      }
      return updatedMuted
    })
  }

  const handleArchiveGroup = () => {
    const nextArchived = !groupArchived
    setGroupArchived(nextArchived)
    if (chat.type === 'group') {
      updateGroupChatSession(chat.id, (session) => ({
        ...session,
        chat: {
          ...session.chat,
          archived: nextArchived
        }
      }))
    }

    const bridge = getBrowserXmppBridge()
    if (bridge?.updateMucRoomSettings && chat.type === 'group') {
      void bridge.updateMucRoomSettings(chat.id, {
        topic: groupChatState.subject,
        defaultSecure: true,
        autoJoin: true,
        archived: nextArchived
      }).catch(() => {})
    }

    setShowInfo(false)
    navigate('/chats')
  }

  const handleLeaveGroup = () => {
    if (chat.type === 'group') {
      removeGroupChatSession(chat.id)
    }
    setShowInfo(false)
    navigate('/chats')
  }

  const renderHeader = () => {
    if (groupChatState.type === 'direct') {
      return (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border">
              {groupChatState.avatar && <img src={groupChatState.avatar} alt={groupChatState.name} className="w-full h-full object-cover" />}
            </div>
            <span className={`absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-background ${groupChatState.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm text-foreground truncate">{groupChatState.name}</span>
              {groupChatState.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
              {groupChatState.encrypted && <Lock size={9} className="text-accent flex-shrink-0" />}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              {typingPeer ? (
                <span className="flex items-center gap-1 text-accent">
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  typing…
                </span>
              ) : groupChatState.online ? 'Online' : groupChatState.handle}
            </span>
          </div>
        </div>
      )
    }
    if (groupChatState.type === 'group') {
      return (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute top-0 left-0 w-5 h-5 rounded-full bg-secondary border border-background overflow-hidden">
              {groupChatState.participants[0]?.avatar && <img src={groupChatState.participants[0].avatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-secondary border border-background overflow-hidden">
              {groupChatState.participants[1]?.avatar && <img src={groupChatState.participants[1].avatar} alt="" className="w-full h-full object-cover" />}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm text-foreground truncate">{groupChatState.name}</span>
              {groupChatState.encrypted && <Lock size={9} className="text-accent flex-shrink-0" />}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{groupChatState.memberCount} members</span>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center border border-primary/20 flex-shrink-0">
          <Hash size={14} className="text-primary" />
        </div>
        <div className="min-w-0">
          <span className="font-semibold text-sm text-foreground truncate block">{groupChatState.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{groupChatState.memberCount?.toLocaleString()} members</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </button>

          {renderHeader()}

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {chat.type === 'direct' && (
              <>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                  <Phone size={16} />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                  <Video size={16} />
                </button>
              </>
            )}
            <button onClick={() => setShowInfo((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${showInfo ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
              {showInfo ? <X size={16} /> : <Info size={16} />}
            </button>
          </div>
        </div>

          {groupChatState.subject && !showInfo && (
          <div className="px-4 py-1.5 border-t border-border bg-secondary/30">
            <p className="font-mono text-[10px] text-muted-foreground truncate">{groupChatState.subject}</p>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className={`flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5 ${showInfo ? 'hidden' : ''}`}>
          {messages.map((msg, i) => (
            <Bubble
              key={msg.id}
              msg={msg}
              isMine={isMine(msg)}
              showAvatar={showAvatar(i)}
              type={groupChatState.type}
              onReply={(message) => {
                setReplyTo({
                  messageId: message.id,
                  senderName: message.senderName,
                  content: message.content,
                  to: groupChatState.handle
                })
                setTimeout(() => textareaRef.current?.focus(), 0)
              }}
              onEdit={(messageId) => {
                startEdit(messageId)
                setTimeout(() => textareaRef.current?.focus(), 0)
              }}
              onImageClick={(url, alt) => {
                const allImages = messages.flatMap((m) => m.attachments?.filter((a) => a.kind === 'image') ?? [])
                const index = allImages.findIndex((img) => img.url === url)
                setMediaViewer({ items: allImages, index: index >= 0 ? index : 0 })
              }}
              replyPreview={resolveReplyPreview(msg)}
            />
          ))}
          <div ref={bottomRef} />
        </main>

        {showInfo && (
          <div className="flex-1 overflow-hidden flex flex-col border-l border-border">
            <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {groupChatState.type === 'direct' ? 'Contact info' : groupChatState.type === 'group' ? 'Group info' : 'Room info'}
              </p>
            </div>
            {groupChatState.type === 'direct' && <DirectSettings chat={groupChatState} />}
            {groupChatState.type === 'group' && (
              <GroupSettings
                chat={groupChatState}
                onToggleMute={handleToggleGroupMute}
                onArchive={handleArchiveGroup}
                onLeave={handleLeaveGroup}
              />
            )}
            {groupChatState.type === 'muc' && (
              <MucSettings
                chat={groupChatState}
                onKick={(jid) => setModAction({ type: 'kick', target: jid })}
                onBan={(jid) => setModAction({ type: 'ban', target: jid })}
                onConfig={() => navigate('/settings')}
              />
            )}
          </div>
        )}
      </div>

      {!showInfo && (
        <>
          {editingMessageId && (
            <div className="border-t border-border bg-background px-3 py-2 flex items-start gap-2">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent flex-shrink-0">
                <Zap size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent">Editing message</span>
                </div>
                <p className="mt-0.5 text-[12px] text-accent/60">Press Enter to save changes</p>
              </div>
              <button
                onClick={() => cancelEdit()}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
                aria-label="Cancel editing"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {replyTo && (
            <div className="border-t border-border bg-background px-3 py-2 flex items-start gap-2">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary flex-shrink-0">
                <CornerUpLeft size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-primary">Replying</span>
                  <span className="font-mono text-[10px] text-muted-foreground truncate">@{replyTo.senderName ?? 'message'}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-foreground/80 truncate">{replyTo.content ?? 'Referenced message'}</p>
              </div>
              <button
                onClick={() => setReplyTo(undefined)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
                aria-label="Cancel reply"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {showMentionPicker && (
            <div className="border-t border-border bg-background">
              <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-primary">@mention</span>
                <span className="font-mono text-[10px] text-muted-foreground">· {filteredMentions.length} member{filteredMentions.length !== 1 ? 's' : ''}</span>
                {mentionQuery && <span className="font-mono text-[10px] text-muted-foreground">for "{mentionQuery}"</span>}
              </div>
              {filteredMentions.length > 0 ? filteredMentions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    insertMention(p, textareaRef.current?.selectionStart ?? input.length)
                    setTimeout(() => textareaRef.current?.focus(), 0)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-secondary transition-colors text-left border-b border-border last:border-0"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border">
                      {p.avatar
                        ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-foreground">{p.name[0]}</div>}
                    </div>
                    <span className={`absolute -bottom-px -right-px w-2 h-2 rounded-full border border-background ${p.online ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                      <RoleIcon role={p.role} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground truncate block">{p.handle}</span>
                  </div>
                  <span className="font-mono text-[10px] text-primary flex-shrink-0">
                    @{chat.type === 'muc' ? p.handle.split('@')[0] : p.name.split(' ')[0]}
                  </span>
                </button>
              )) : (
                <div className="px-3 py-3 text-sm text-muted-foreground">No members match "{mentionQuery}"</div>
              )}
            </div>
          )}

          {showEmojiPicker && (
            <div className="border-t border-border bg-background">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2 flex-1 bg-secondary rounded-lg px-2.5 py-1.5">
                  <span className="text-[13px]">🔍</span>
                  <input
                    autoFocus
                    value={emojiSearch}
                    onChange={(e) => {
                      setEmojiSearch(e.target.value)
                      if (e.target.value) setEmojiCategory('')
                    }}
                    placeholder="Search emoji…"
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  {emojiSearch && (
                    <button onClick={() => { setEmojiSearch(''); setEmojiCategory('recent') }} className="text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button onClick={() => { setShowEmojiPicker(false); setEmojiSearch('') }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                  <X size={15} />
                </button>
              </div>

              {!emojiSearch && (
                <div className="flex overflow-x-auto border-b border-border" style={{ scrollbarWidth: 'none' }}>
                  {EMOJI_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setEmojiCategory(cat.id)}
                        className={`flex-shrink-0 px-3 py-2 text-base transition-colors relative ${emojiCategory === cat.id ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}
                        title={cat.label}
                    >
                      {cat.icon}
                      {emojiCategory === cat.id && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-primary rounded-t-full" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="overflow-y-auto max-h-44 px-1 py-1">
                {(() => {
                  const emojis = emojiSearch
                    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e, i, arr) => arr.indexOf(e) === i)
                    : (EMOJI_CATEGORIES.find((c) => c.id === emojiCategory)?.emojis ?? [])
                  return (
                    <div className="grid grid-cols-9 gap-0">
                      {emojis.map((emoji, i) => (
                        <button key={`${emoji}-${i}`}
                          onClick={() => insertEmoji(emoji)}
                          className="text-xl p-1.5 rounded hover:bg-secondary transition-colors leading-none aspect-square flex items-center justify-center">
                          {emoji}
                        </button>
                      ))}
                      {emojis.length === 0 && (
                        <div className="col-span-9 py-6 text-center text-sm text-muted-foreground">No results</div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {showImagePicker && (
            <div className="border-t border-border bg-background">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Attach files</span>
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${selectedAttachments.length >= MAX_IMAGES ? 'bg-amber-500/10 text-amber-400' : 'bg-secondary text-muted-foreground'}`}>
                    {selectedAttachments.length}/{MAX_IMAGES}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <Upload size={12} />
                    Upload
                  </button>
                  <button onClick={() => setShowImagePicker(false)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.doc,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  const bridge = getBrowserXmppBridge()
                  for (let i = 0; i < Math.min(files.length, MAX_IMAGES - selectedAttachments.length); i++) {
                    const file = files[i]
                    if (bridge?.uploadFile) {
                      try {
                        const result = await bridge.uploadFile(file)
                        toggleAttachment({
                          id: result.url,
                          url: result.url,
                          alt: result.alt,
                          kind: result.kind,
                        })
                      } catch {
                        toggleAttachment({
                          id: `upload-${Date.now()}-${i}`,
                          url: URL.createObjectURL(file),
                          alt: file.name,
                          kind: file.type.startsWith('image/') ? 'image' : 'file',
                        })
                      }
                    } else {
                      toggleAttachment({
                        id: `upload-${Date.now()}-${i}`,
                        url: URL.createObjectURL(file),
                        alt: file.name,
                        kind: file.type.startsWith('image/') ? 'image' : 'file',
                      })
                    }
                  }
                  e.target.value = ''
                }}
              />

              <div className="grid grid-cols-4 gap-0.5 p-0.5 max-h-52 overflow-y-auto">
                {GALLERY_PHOTOS.map((photo) => {
                  const isSelected = !!selectedAttachments.find((s) => s.id === photo.id)
                  const isDisabled = !isSelected && selectedAttachments.length >= MAX_IMAGES
                  return (
                    <button
                      key={photo.id}
                      onClick={() => !isDisabled && toggleAttachment({ ...photo, kind: 'image' })}
                      className={`relative aspect-square overflow-hidden rounded transition-all ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:ring-2 hover:ring-primary/60'} ${isSelected ? 'ring-2 ring-primary' : ''}`}
                    >
                      <img src={photo.url} alt={photo.alt} className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-end justify-end p-1">
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">
                              {selectedAttachments.findIndex((s) => s.id === photo.id) + 1}
                            </span>
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedAttachments.length > 0 && (
                <div className="px-4 py-2.5 border-t border-border flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {selectedAttachments.map((asset) => (
                    <div key={asset.id} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border bg-secondary group">
                      {asset.kind === 'image' ? (
                        <img src={asset.url} alt={asset.alt} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center">
                          <FileText size={18} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground leading-tight break-all">{asset.alt}</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(asset.id)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} className="text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-border bg-background/95 backdrop-blur flex-shrink-0 px-3 py-2.5 flex items-end gap-2">
            <button
              onClick={() => toggleImagePicker()}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${showImagePicker ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
            >
              <Paperclip size={18} />
            </button>

            <div className="flex-1 min-w-0 bg-secondary rounded-2xl px-3 py-2 flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && showMentionPicker) {
                    setShowMentionPicker(false)
                    return
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder={chat.type === 'muc' ? `Message ${chat.name}…` : `Message ${chat.name.split(' ')[0]}…`}
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed max-h-28"
                style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
              <button
                onClick={() => toggleEmojiPicker()}
                className={`text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 pb-0.5 ${showEmojiPicker ? 'text-primary' : ''}`}
              >
                <Smile size={17} />
              </button>
            </div>

            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() && selectedAttachments.length === 0}
              className={`p-2.5 rounded-full flex-shrink-0 transition-all ${input.trim() || selectedAttachments.length > 0 ? 'bg-primary text-white hover:bg-primary/90' : 'bg-secondary text-muted-foreground'}`}
            >
              {input.trim() || selectedAttachments.length > 0 ? <Send size={16} /> : <Mic size={16} />}
            </button>
          </div>
        </>
      )}

      {mediaViewer && (
        <MediaViewer
          items={mediaViewer.items}
          initialIndex={mediaViewer.index}
          onClose={() => setMediaViewer(null)}
        />
      )}
    </div>
  )
}
