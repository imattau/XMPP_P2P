import * as React from 'react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { getBrowserXmppBridge, useChatBridge, useChatThreadBridge, type ChatAttachment as BridgeChatAttachment, type ChatMessage as BridgeChatMessage, type ChatMessageReply as BridgeChatMessageReply, type ChatThread as BridgeChatThread } from '../bridge'
import { useRosterBridge } from '../bridge/useRosterBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { removeGroupChatSession, setActiveGroupChat, updateGroupChatSession } from './chat-session'
import { canonicalDirectChatId, clearDirectChatHistory, setDirectChatEncryptionEnabled, setDirectChatMuted, supportsDirectChatOmemo } from '../bridge/direct-chat-history'
import { getPendingMessages } from '../lib/message-queue'
import { getPeerAddress } from '../lib/peer-addresses'
import MediaViewer from '../components/MediaViewer'
import { emitToast } from '../lib/toast-events'
import {
  ArrowLeft, Info, X, Send, Smile, Paperclip,
  Mic, Shield, Lock, BellOff, Bell, Trash2, LogOut, Users,
  Hash, Globe, EyeOff, UserMinus,
  CheckCheck, Check, FileText, MoreHorizontal,
  MessageSquare, Key, Archive, ChevronRight, Crown, Gavel, CornerUpLeft,
  Zap, Copy, AlertTriangle, Upload, ImagePlus, AtSign, RotateCcw, Square, Loader2, Clock3, Edit3,
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
  receiptReceived?: boolean
  read?: boolean
  encrypted?: boolean
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
  peerAddress?: string
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

const MAX_ATTACHMENTS = 4
const MAX_VOICE_SECONDS = 120

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

function MessageStatus({ msg }: { msg: Message }) {
  if (msg.senderId !== ME) return null
  if (msg.read) return <CheckCheck size={12} aria-label="Read" className="text-primary" />
  if (msg.receiptReceived) return <CheckCheck size={12} aria-label="Delivered" className="text-muted-foreground" />
  if (msg.delivered) return <Check size={12} aria-label="Sent" className="text-muted-foreground" />
  return <Check size={12} aria-label="Not sent" className="text-muted-foreground" />
}

function RoleIcon({ role }: { role?: string }) {
  if (role === 'owner') return <Crown size={11} className="text-warn" />
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

function useResolvedAttachmentUrl(sourceUrl: string) {
  const [resolvedUrl, setResolvedUrl] = useState(sourceUrl.startsWith('upload://') ? '' : sourceUrl)
  const [loading, setLoading] = useState(sourceUrl.startsWith('upload://'))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!sourceUrl.startsWith('upload://')) {
      setResolvedUrl(sourceUrl)
      setLoading(false)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let objectUrl: string | undefined
    let retries = 0
    setResolvedUrl('')
    setLoading(true)

    const resolve = async () => {
      try {
        const resolved = await getBrowserXmppBridge()?.resolveUploadUrl(sourceUrl)
        if (resolved) {
          objectUrl = resolved
          if (!cancelled) {
            setResolvedUrl(resolved)
            setLoading(false)
          }
          return
        }
      } catch { /* the upload may still be arriving */ }

      retries += 1
      if (!cancelled && retries < 10) {
        timer = setTimeout(() => { void resolve() }, 700)
      } else if (!cancelled) {
        setLoading(false)
      }
    }

    void resolve()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [sourceUrl, attempt])

  return { url: resolvedUrl, loading, retry: () => { setAttempt((value) => value + 1) } }
}

function ImageAttachment({ attachment, onOpen }: { attachment: BridgeChatAttachment; onOpen?: (url: string, alt: string) => void }) {
  const { url, loading, retry } = useResolvedAttachmentUrl(attachment.url)
  if (!url) {
    return (
      <button type="button" onClick={retry} disabled={loading} aria-label={loading ? `Loading ${attachment.alt}` : `Retry loading ${attachment.alt}`} className="flex aspect-video w-full items-center justify-center rounded-xl bg-secondary text-xs text-muted-foreground disabled:cursor-wait">
        {loading ? 'Loading image…' : 'Image unavailable · Retry'}
      </button>
    )
  }
  return (
    <button type="button" onClick={() => onOpen?.(url, attachment.alt)} aria-label={`Open image: ${attachment.alt}`} className="block w-full overflow-hidden rounded-xl border border-border bg-black/10 text-left">
      <img src={url} alt={attachment.alt} className="block max-h-72 h-full w-full object-cover" />
    </button>
  )
}

function FileAttachment({ attachment, isMine }: { attachment: BridgeChatAttachment; isMine: boolean }) {
  const { url, loading, retry } = useResolvedAttachmentUrl(attachment.url)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2">
      <FileText size={13} className={isMine ? 'text-white/80' : 'text-muted-foreground'} />
      {url ? (
        <a href={url} download={attachment.alt} target={url.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="min-w-0 truncate font-mono text-[12px] underline decoration-current/30 underline-offset-2 hover:decoration-current">
          {attachment.alt || 'Download file'}
        </a>
      ) : loading ? (
        <span className="font-mono text-[11px] text-muted-foreground">Preparing {attachment.alt}…</span>
      ) : (
        <button type="button" onClick={retry} className="font-mono text-[11px] text-primary hover:underline">Retry {attachment.alt}</button>
      )}
    </div>
  )
}

function AudioAttachment({ attachment }: { attachment: BridgeChatAttachment }) {
  const { url, loading, retry } = useResolvedAttachmentUrl(attachment.url)
  if (url) {
    return <audio controls preload="metadata" src={url} aria-label={`Voice message: ${attachment.alt}`} className="w-64 max-w-full" />
  }
  if (loading) return <span className="font-mono text-[11px] text-muted-foreground">Preparing voice message…</span>
  return <button type="button" onClick={retry} className="font-mono text-[11px] text-primary hover:underline">Retry voice message</button>
}

function Bubble({
  msg,
  isMine,
  showAvatar,
  type,
  onReply,
  onEdit,
  onRetry,
  queued = false,
  queueConnectionName = 'peer network connection',
  onImageClick,
  replyPreview,
}: {
  msg: Message
  isMine: boolean
  showAvatar: boolean
  type: ChatType
  onReply: (message: Message) => void
  onEdit?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  queued?: boolean
  queueConnectionName?: string
  onImageClick?: (url: string, alt: string) => void
  replyPreview?: { senderName: string; content: string }
}) {
  if (msg.kind === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="max-w-[90%] break-words rounded-full bg-secondary/60 px-3 py-1 text-center font-mono text-[10px] text-muted-foreground">{msg.content}</span>
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

      <div className={`max-w-[88%] flex flex-col sm:max-w-[78%] ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (type === 'group' || type === 'muc') && showAvatar && (
          <span className="mb-0.5 max-w-full break-all px-1 font-mono text-[10px] text-muted-foreground">{msg.senderName}</span>
        )}

        {replyPreview && (
          <div className={`text-[11px] px-2.5 py-1 mb-0.5 rounded border-l-2 border-primary bg-primary/5 text-muted-foreground max-w-full ${isMine ? 'text-right' : ''}`}>
            <span className="font-mono text-primary">{replyPreview.senderName}</span>
            <p className="truncate">{replyPreview.content}</p>
          </div>
        )}

        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
          isMine
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-secondary text-foreground rounded-tl-sm'
        } ${msg.kind === 'audio' ? 'flex items-center gap-2' : ''}`}>
          {imageAttachments.length > 0 ? (
            <div className="space-y-2">
              <div className={`grid gap-2 ${imageAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {imageAttachments.map((attachment) => (
                  <ImageAttachment
                    key={attachment.id}
                    attachment={attachment}
                    onOpen={onImageClick}
                  />
                ))}
              </div>
              {parsedBody?.body ? <p className="break-words whitespace-pre-wrap">{parsedBody.body}</p> : null}
            </div>
          ) : msg.kind === 'audio' ? (
            <>
              {msg.attachments?.find((attachment) => attachment.kind === 'file')
                ? <AudioAttachment attachment={msg.attachments.find((attachment) => attachment.kind === 'file')!} />
                : <><Mic size={14} className={isMine ? 'shrink-0 text-white/80' : 'shrink-0 text-muted-foreground'} /><span className="min-w-0 break-all font-mono text-[12px]">{msg.fileName || msg.content}</span></>}
            </>
          ) : msg.kind === 'file' || fileAttachments.length > 0 ? (
            <div className="space-y-2">
              {msg.content ? <p className="break-words whitespace-pre-wrap">{msg.content}</p> : null}
              <div className="space-y-2">
                {(msg.attachments ?? []).filter((attachment) => attachment.kind === 'file').map((attachment) => (
                  <FileAttachment key={attachment.id} attachment={attachment} isMine={isMine} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {parsedBody?.quote && (
                <div className={`rounded-lg border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed ${isMine ? 'border-white/40 bg-white/10 text-primary-foreground/85' : 'border-primary bg-primary/5 text-muted-foreground'}`}>
                  <p className="font-mono mb-1 opacity-80">Quoted</p>
                  <p className="break-words whitespace-pre-wrap">{parsedBody.quote}</p>
                </div>
              )}
              {parsedBody?.body ? (
                <p className="break-words whitespace-pre-wrap">{parsedBody.body}</p>
              ) : !parsedBody?.quote ? (
                <p className="break-words whitespace-pre-wrap">{msg.content}</p>
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
          {isMine && msg.delivered === false && queued && (
            <span role="status" title={`Waiting for your ${queueConnectionName}`} className="inline-flex items-center gap-1 font-mono text-[9px] text-muted-foreground" aria-label={`Message queued until your ${queueConnectionName} is available`}>
              <Clock3 size={10} /> Queued
            </span>
          )}
          {isMine && msg.delivered === false && !queued && onRetry && (
            <button onClick={() => onRetry(msg.id)} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 font-mono text-xs text-destructive hover:bg-destructive/10 hover:text-destructive/80" aria-label="Retry sending message">
              <RotateCcw size={10} /> Retry
            </button>
          )}
          <details className="relative md:hidden">
            <summary aria-label="Message actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
              <MoreHorizontal size={16} />
            </summary>
            <div className={`absolute bottom-full z-20 mb-1 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl ${isMine ? 'right-0' : 'left-0'}`}>
              <button type="button" onClick={(event) => { onReply(msg); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                <CornerUpLeft size={15} /> Reply
              </button>
              {isMine && onEdit && (
                <button type="button" onClick={(event) => { onEdit(msg.id); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                  <Edit3 size={15} /> Edit
                </button>
              )}
            </div>
          </details>
        </div>

        <div className={`mt-0.5 hidden items-center md:flex ${isMine ? 'justify-end' : 'justify-start'}`}>
          <button onClick={() => onReply(msg)} aria-label="Reply to message" title="Reply" className="hidden h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary md:inline-flex">
            <CornerUpLeft size={14} />
          </button>
          {isMine && onEdit && (
              <button onClick={() => onEdit(msg.id)} aria-label="Edit message" title="Edit" className="hidden h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary md:inline-flex">
              <Edit3 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DirectSettings({ chat }: { chat: ChatData }) {
  const [muted, setMuted] = useState(chat.muted ?? false)
  const omemoSupported = supportsDirectChatOmemo(chat.handle || chat.id)
  const [encrypted, setEncrypted] = useState(omemoSupported && chat.encrypted)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [fingerprintState, setFingerprintState] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [clearHistoryError, setClearHistoryError] = useState('')
  const clearHistoryTriggerRef = useRef<HTMLButtonElement>(null)
  const clearHistoryDialogWasOpen = useRef(false)
  const other = chat.participants.find((p) => p.id !== ME)!

  useEffect(() => {
    if (confirmClearHistory) {
      clearHistoryDialogWasOpen.current = true
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = previousOverflow }
    }
    if (clearHistoryDialogWasOpen.current) {
      clearHistoryDialogWasOpen.current = false
      clearHistoryTriggerRef.current?.focus()
    }
  }, [confirmClearHistory])

  const copyJid = async () => {
    try {
      await navigator.clipboard.writeText(chat.handle || chat.id)
      emitToast('JID copied', 'success')
    } catch {
      emitToast('Could not copy the JID', 'error')
    }
  }

  const clearHistory = () => {
    if (!clearDirectChatHistory(chat.handle || chat.id)) {
      setClearHistoryError('Could not clear message history from this device. Check browser storage and try again.')
      return
    }
    setConfirmClearHistory(false)
    setClearHistoryError('')
    emitToast('Conversation history cleared', 'success')
  }

  const handleClearHistoryDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setConfirmClearHistory(false)
      return
    }
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    setEncrypted(omemoSupported && chat.encrypted)
  }, [chat.id, chat.encrypted, omemoSupported])

  useEffect(() => {
    let cancelled = false
    setFingerprint(null)
    if (!omemoSupported) {
      setFingerprintState('unavailable')
      return
    }
    setFingerprintState('checking')
    const bridge = getBrowserXmppBridge()
    if (!bridge?.getPeerOmemoFingerprint || !other.handle) {
      setFingerprintState('unavailable')
      return
    }
    void bridge.getPeerOmemoFingerprint(other.handle).then((fp) => {
      if (!cancelled) {
        setFingerprint(fp ?? null)
        setFingerprintState(fp ? 'available' : 'unavailable')
      }
    }).catch(() => {
      if (!cancelled) {
        setFingerprint(null)
        setFingerprintState('unavailable')
      }
    })
    return () => { cancelled = true }
  }, [other.handle, omemoSupported])

  const toggleEncryption = () => {
    if (!omemoSupported) return
    const next = !encrypted
    setEncrypted(next)
    setDirectChatEncryptionEnabled(chat.handle || chat.id, next)
    emitToast(next
      ? 'Secure mode on. Messages require OMEMO and will not fall back to plaintext.'
      : 'Secure mode off. New messages may be sent without encryption.', next ? 'success' : 'info')
  }

  return (
    <div className="overflow-y-auto flex-1">
      <div className="border-b border-border px-4 py-3">
        <p className="break-all font-mono text-[11px] text-muted-foreground">{chat.handle || chat.id}</p>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Encryption</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock size={14} className={encrypted ? 'text-accent' : 'text-muted-foreground'} />
            <span className="text-sm text-foreground">OMEMO E2EE</span>
          </div>
          <button type="button" role="switch" aria-checked={encrypted} aria-disabled={!omemoSupported} disabled={!omemoSupported} aria-label="Require OMEMO encryption for direct messages" onClick={toggleEncryption}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg">
            <span aria-hidden="true" className={`relative w-10 h-5 rounded-full transition-colors ${encrypted ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${encrypted ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {!omemoSupported ? 'OMEMO direct messaging is currently supported for P2P contacts. This XMPP server contact uses the connected server transport.' : encrypted ? 'New messages require OMEMO. If this contact has no OMEMO device, sending will fail without plaintext fallback.' : 'New messages are sent without OMEMO. Turn this on to require end-to-end encryption.'}
        </p>
        {fingerprint && (
          <div className="mt-2">
            <p className="font-mono text-[10px] text-muted-foreground mb-0.5">Fingerprint (SHA-256)</p>
            <p className="font-mono text-[10px] text-foreground/80 leading-relaxed break-all select-all">{fingerprint}</p>
          </div>
        )}
        {!fingerprint && omemoSupported && <p className="mt-2 text-[10px] text-muted-foreground">{fingerprintState === 'checking' ? 'Checking for an OMEMO device…' : 'No OMEMO fingerprint is currently available for this contact.'}</p>}
      </div>

      <div className="border-b border-border">
        {[
          { icon: muted ? Bell : BellOff, label: muted ? 'Unmute notifications' : 'Mute notifications', action: () => setMuted((current) => {
            const next = !current
            setDirectChatMuted(chat.handle || chat.id, next)
            return next
          }) },
          { icon: Copy, label: 'Copy JID', action: () => { void copyJid() } },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left text-foreground/80">
            <Icon size={15} /><span className="text-sm">{label}</span>
          </button>
        ))}
      </div>

      <div className="border-b border-border">
        <button ref={clearHistoryTriggerRef} onClick={() => { setClearHistoryError(''); setConfirmClearHistory(true) }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
          <Trash2 size={15} /><span className="text-sm">Clear message history</span>
        </button>
      </div>

      {confirmClearHistory && (
        <div className="safe-area-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-chat-history-title"
            aria-describedby="clear-chat-history-description"
            onKeyDown={handleClearHistoryDialogKeyDown}
            className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h2 id="clear-chat-history-title" className="text-base font-semibold text-foreground">Clear message history?</h2>
            <p id="clear-chat-history-description" className="mt-1 text-sm leading-relaxed text-muted-foreground">
              This permanently removes the messages saved on this device. It does not delete messages from the other person’s device.
            </p>
            {clearHistoryError && <p role="alert" className="mt-3 text-sm text-destructive">{clearHistoryError}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmClearHistory(false)}
                className="min-h-11 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearHistory}
                className="min-h-11 rounded-lg bg-destructive px-3 text-sm font-semibold text-white hover:bg-destructive/90"
              >
                Clear history
              </button>
            </div>
          </div>
        </div>
      )}
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
      <div className="border-b border-border px-4 py-3">
        <p className="break-all font-mono text-[11px] text-muted-foreground">{chat.handle || chat.id}</p>
        {chat.subject && <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{chat.subject}</p>}
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{chat.server}</p>
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

      <details className="border-b border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
          <span className="flex-1">Members</span>
          <span className="text-xs font-normal text-muted-foreground">{chat.participants.filter((p) => p.id !== ME).length}</span>
          <ChevronDown size={14} className="text-muted-foreground/50" />
        </summary>
        <div className="px-4 pb-3">
          <button onClick={async () => {
            try {
              await navigator.clipboard.writeText(chat.handle || chat.id)
              emitToast('Room ID copied. Share it with people you want to join.', 'success')
            } catch {
              emitToast('Could not copy the room ID', 'error')
            }
          }} className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-primary hover:bg-primary/10">
            <Copy size={14} />Copy room ID
          </button>
          <div className="max-h-[40vh] overflow-y-auto overscroll-contain sm:max-h-none">
          {chat.participants.filter((p) => p.id !== ME).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 border-b border-border py-2 last:border-0">
              <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-secondary">
                {p.avatar ? <img src={p.avatar} alt={p.name} className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold">{p.name[0]}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[12px] font-medium text-foreground">{p.name}</span>
                  <RoleIcon role={p.role} />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground truncate">{p.handle}</span>
                <span className="sr-only">{p.online ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${p.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
              </div>
            </div>
          ))}
          </div>
        </div>
      </details>

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

function MucSettings({ chat, onKick, onBan, onToggleMute, onLeave }: { chat: ChatData; onKick?: (jid: string) => void; onBan?: (jid: string) => void; onToggleMute: () => void; onLeave: () => void }) {
  const [showActionPicker, setShowActionPicker] = useState<{ type: 'kick' | 'ban' } | null>(null)
  const myRole = chat.participants.find((p) => p.id === ME)?.role
  const canModerate = myRole === 'owner' || myRole === 'admin' || myRole === 'moderator'
  const onlineParticipants = chat.participants.filter((participant) => participant.online)

  return (
    <div className="overflow-y-auto flex-1">
      <div className="border-b border-border px-4 py-3">
        <p className="break-all font-mono text-[11px] text-muted-foreground">{chat.handle || chat.id}</p>
        {chat.subject && <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{chat.subject}</p>}
      </div>

      <details className="border-b border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 py-3 text-sm font-medium text-foreground">
          <span className="flex-1">Room properties</span>
          <ChevronDown size={14} className="text-muted-foreground/50" />
        </summary>
        <div className="space-y-2 px-4 pb-3">
          {[
            { label: 'Members', value: chat.memberCount?.toLocaleString() ?? '—' },
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
      </details>

      {onlineParticipants.length > 0 && <details className="border-b border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
          <span className="flex-1">Online now</span>
          <span className="text-xs font-normal text-muted-foreground">{onlineParticipants.length}</span>
          <ChevronDown size={14} className="text-muted-foreground/50" />
        </summary>
        <div className="px-4 pb-3">
          {onlineParticipants.map((p) => (
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
      </details>}

      <button onClick={onToggleMute} aria-pressed={chat.muted ?? false} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
        {chat.muted ? <Bell size={15} /> : <BellOff size={15} />}
        <span className="text-sm">{chat.muted ? 'Unmute notifications' : 'Mute notifications'}</span>
      </button>

      {canModerate && (
        <details className="border-b border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
            <span className="flex-1">Moderation</span>
            <ChevronDown size={14} className="text-muted-foreground/50" />
          </summary>
          <button onClick={() => setShowActionPicker({ type: 'kick' })} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
            <UserMinus size={15} /><span className="text-sm">Kick participant</span>
            <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
          </button>
          <button onClick={() => setShowActionPicker({ type: 'ban' })} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left text-foreground/80">
            <AlertTriangle size={15} /><span className="text-sm">Ban participant</span>
            <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
          </button>
        </details>
      )}

      {showActionPicker && (
        <div className="border-b border-border px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {showActionPicker.type === 'kick' ? 'Select participant to kick' : 'Select participant to ban'}
          </p>
          <div className="max-h-[40vh] overflow-y-auto overscroll-contain sm:max-h-none">
          {chat.participants.filter((p) => p.id !== ME).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if (showActionPicker.type === 'kick') onKick?.(p.handle || p.id)
                else onBan?.(p.handle || p.id)
                setShowActionPicker(null)
              }}
              className="min-h-11 w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary transition-colors rounded-lg text-left"
            >
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
                {p.name[0]}
              </div>
              <span className="text-[12px] text-foreground/80 flex-1 font-mono">{p.handle}</span>
            </button>
          ))}
          </div>
          <button onClick={() => setShowActionPicker(null)} className="mt-2 min-h-11 rounded-lg px-3 text-[11px] font-mono text-muted-foreground hover:bg-secondary hover:text-foreground">
            Cancel
          </button>
        </div>
      )}
      <button onClick={onLeave} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left text-destructive">
        <LogOut size={15} /><span className="text-sm">Leave channel</span>
      </button>
    </div>
  )
}

export default function ChatThreadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const thread = useChatThreadBridge(id)
  if (!thread.chat) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Conversation not found</p>
        <p className="max-w-xs text-xs text-muted-foreground">This conversation is not in your contacts or saved chats.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => navigate('/chats')} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Conversations</button>
          <button type="button" onClick={() => navigate('/chats/new')} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">Start a conversation</button>
        </div>
      </div>
    )
  }
  return <ChatThreadContent
    id={id}
    resolvedChat={thread.chat}
    initialMessages={thread.messages}
    historyLoading={thread.historyLoading}
    historyError={thread.historyError}
    refreshHistory={thread.refreshHistory}
    hasOlderHistory={thread.hasOlderHistory}
    loadingOlderHistory={thread.loadingOlderHistory}
    loadOlderHistory={thread.loadOlderHistory}
    historyErrorIsOlder={thread.historyErrorIsOlder}
  />
}

function ChatThreadContent({ id, resolvedChat, initialMessages, historyLoading, historyError, refreshHistory, hasOlderHistory, loadingOlderHistory, loadOlderHistory, historyErrorIsOlder }: {
  id: string
  resolvedChat: BridgeChatThread
  initialMessages: BridgeChatMessage[]
  historyLoading: boolean
  historyError?: string
  refreshHistory: () => void
  hasOlderHistory: boolean
  loadingOlderHistory: boolean
  loadOlderHistory: () => void
  historyErrorIsOlder: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { onlinePeers } = useRosterBridge()
  const { permissions } = useIdentityBridge()
  const chat = useMemo(() => {
    const c = { ...resolvedChat } as ChatData
    const chatPeerId = c.id.toLowerCase().endsWith('@p2p') ? c.id.slice(0, -4) : c.id
    const routeAddress = new URLSearchParams(location.search).get('address')
    const routeAddressId = routeAddress?.match(/\/p2p\/([^/]+)$/)?.[1]
    const peerAddress = routeAddress?.startsWith('/') && routeAddressId === chatPeerId
      ? routeAddress
      : getPeerAddress(chatPeerId)
    if (c.type === 'direct' && peerAddress) {
      c.peerAddress = peerAddress
    }
    if (c.handle && onlinePeers.has(canonicalDirectChatId(c.handle))) {
      c.online = true
    }
    if (c.participants) {
      c.participants = c.participants.map((p: any) => ({
        ...p,
        online: onlinePeers.has(canonicalDirectChatId(p.handle)) || onlinePeers.has(canonicalDirectChatId(`${p.handle}@${p.server}`)) || p.online
      }))
    }
    return c
  }, [resolvedChat, onlinePeers, location.search])
  const historyLabel = chat.type === 'direct' ? 'conversation' : 'room'
  useEffect(() => {
    const activeChatId = chat.type === 'direct' ? chat.handle || chat.id : null
    window.dispatchEvent(new CustomEvent('xmpp-p2p:active-direct-chat', { detail: activeChatId }))
    setActiveGroupChat(chat.type === 'direct' ? undefined : chat.id)
    return () => {
      window.dispatchEvent(new CustomEvent('xmpp-p2p:active-direct-chat', { detail: null }))
      setActiveGroupChat(undefined)
    }
  }, [chat.type, chat.handle, chat.id])
  useEffect(() => {
    if (chat.type !== 'muc' || chat.server === 'muc.p2p') return
    const bridge = getBrowserXmppBridge()
    const joinServerMuc = bridge?.joinServerMuc
    if (!bridge || !joinServerMuc) return
    const roomJid = (chat.handle || chat.id).split('/')[0].toLowerCase()
    const unsubscribeError = bridge.onMucError?.((event: any) => {
      if (String(event.room ?? event.roomJid ?? '').split('/')[0].toLowerCase() !== roomJid) return
      const reason = event.stanzaError?.text || event.stanzaError?.condition
      emitToast(reason ? `Could not join XMPP room: ${reason}` : 'The XMPP server rejected the room join.', 'error')
    })
    const join = () => {
      if (!bridge.isServerConnected()) return
      const nick = bridge.getServerJid?.()?.split('@')[0] || bridge.getLocalJid().split('@')[0]
      void joinServerMuc.call(bridge, roomJid, nick).catch((error) => {
        emitToast(error instanceof Error ? error.message : 'Could not join the XMPP room', 'error')
      })
    }
    join()
    const unsubscribeConnection = bridge.onServerConnection?.((info) => {
      if (info.status === 'connected') join()
    })
    return () => {
      unsubscribeError?.()
      unsubscribeConnection?.()
    }
  }, [chat.type, chat.server, chat.handle, chat.id])
  const [groupMuted, setGroupMuted] = useState(chat.muted ?? false)
  const isExternalXmppDirect = chat.type === 'direct'
    && Boolean((chat.handle || chat.id).includes('@'))
    && !(chat.handle || chat.id).toLowerCase().split('/')[0].endsWith('@p2p')
  const [groupArchived, setGroupArchived] = useState(chat.archived ?? false)
  const [showInfo, setShowInfo] = useState(false)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const [mediaViewer, setMediaViewer] = useState<{ items: Array<{ url: string; alt: string }>; index: number } | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState('')
  const [modAction, setModAction] = useState<{ type: 'kick' | 'ban'; target: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const historyScrollRef = useRef<HTMLElement>(null)
  const pendingOlderScrollRef = useRef<{ top: number; height: number; messageCount: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const voiceComponentMountedRef = useRef(true)
  const startingVoiceRef = useRef(false)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const discardRecordingRef = useRef(false)
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [startingVoice, setStartingVoice] = useState(false)
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const uploadingAttachmentsRef = useRef(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const {
    messages,
    input,
    sending,
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
    retryMessage,
    editingMessageId,
    startEdit,
    cancelEdit,
    typingPeer,
  } = useChatBridge(chat as BridgeChatThread, initialMessages as BridgeChatMessage[])

  useEffect(() => {
    setActiveMentionIndex(0)
  }, [mentionQuery])

  const selectMention = (participant: Participant) => {
    const caret = insertMention(participant, textareaRef.current?.selectionStart ?? input.length)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      if (caret !== undefined) textareaRef.current?.setSelectionRange(caret, caret)
    })
  }

  const stopVoiceRecording = (discard = false) => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    discardRecordingRef.current = discard
    recorder.stop()
  }

  const startVoiceRecording = async () => {
    if (recordingVoice || uploadingVoice || startingVoiceRef.current) return
    if (!permissions.photosAndFiles) {
      emitToast('Enable Photos and files in Settings to send a voice message.', 'info')
      return
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      emitToast('Voice recording is not supported by this browser.', 'error')
      return
    }

    startingVoiceRef.current = true
    setStartingVoice(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!voiceComponentMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      recorderStreamRef.current = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      audioChunksRef.current = []
      discardRecordingRef.current = false
      setRecordingSeconds(0)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const discarded = discardRecordingRef.current
        discardRecordingRef.current = false
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop())
        recorderStreamRef.current = null
        recorderRef.current = null
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current)
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
        recordingIntervalRef.current = null
        recordingTimeoutRef.current = null
        setRecordingVoice(false)
        if (discarded) {
          audioChunksRef.current = []
          return
        }

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        audioChunksRef.current = []
        if (blob.size === 0) {
          emitToast('No audio was captured. Try recording again.', 'error')
          return
        }

        const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `voice-message-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' })
        const bridge = getBrowserXmppBridge()
        if (!bridge?.uploadFile) {
          emitToast('Reconnect to the peer network before adding a voice message.', 'error')
          return
        }
        setUploadingVoice(true)
        try {
          const attachment = await bridge.uploadFile(file, chat.handle || chat.id)
          toggleAttachment({ id: attachment.url, url: attachment.url, alt: attachment.alt, kind: 'file' })
          emitToast('Voice message ready to send', 'success')
        } catch (error) {
          emitToast(error instanceof Error ? `Could not prepare voice message: ${error.message}` : 'Could not prepare voice message', 'error')
        } finally {
          setUploadingVoice(false)
        }
      }
      recorder.start(500)
      setRecordingVoice(true)
      recordingIntervalRef.current = setInterval(() => setRecordingSeconds((seconds) => Math.min(seconds + 1, MAX_VOICE_SECONDS)), 1000)
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
        emitToast('Voice recording stopped at 2 minutes', 'info')
      }, MAX_VOICE_SECONDS * 1000)
    } catch (error) {
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop())
      recorderStreamRef.current = null
      if (!voiceComponentMountedRef.current) return
      emitToast(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow microphone access in your browser to record.'
        : error instanceof Error ? error.message : 'Could not access the microphone', 'error')
    } finally {
      startingVoiceRef.current = false
      if (voiceComponentMountedRef.current) setStartingVoice(false)
    }
  }

  useEffect(() => {
    voiceComponentMountedRef.current = true
    return () => {
      voiceComponentMountedRef.current = false
      discardRecordingRef.current = true
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current)
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const beginOlderHistoryLoad = () => {
    const container = historyScrollRef.current
    if (container) {
      pendingOlderScrollRef.current = {
        top: container.scrollTop,
        height: container.scrollHeight,
        messageCount: messages.length,
      }
    }
    loadOlderHistory()
  }

  const messageRangeKey = `${messages.length}:${messages[0]?.id ?? ''}:${messages[messages.length - 1]?.id ?? ''}`

  useEffect(() => {
    const targetId = new URLSearchParams(location.search).get('message')
    const target = targetId ? document.getElementById(`message-${encodeURIComponent(targetId)}`) : null
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(targetId!)
      const timeout = window.setTimeout(() => setHighlightedMessageId(''), 1800)
      return () => window.clearTimeout(timeout)
    }
    const pendingOlderScroll = pendingOlderScrollRef.current
    if (pendingOlderScroll) {
      const container = historyScrollRef.current
      if (container && messages.length > pendingOlderScroll.messageCount) {
        container.scrollTop = pendingOlderScroll.top + container.scrollHeight - pendingOlderScroll.height
        pendingOlderScrollRef.current = null
      }
      return
    }
    bottomRef.current?.scrollIntoView()
  }, [messageRangeKey, location.search])

  useEffect(() => {
    const pendingOlderScroll = pendingOlderScrollRef.current
    if (pendingOlderScroll && !loadingOlderHistory && messages.length <= pendingOlderScroll.messageCount) {
      pendingOlderScrollRef.current = null
    }
  }, [loadingOlderHistory, messages.length])

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
  const queuedMessageIds = new Set(getPendingMessages().map((message) => message.id))
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

  const groupChatState = chat.type !== 'direct'
    ? { ...chat, muted: groupMuted, archived: groupArchived }
    : chat

  const handleToggleGroupMute = () => {
    setGroupMuted((nextMuted) => {
      const updatedMuted = !nextMuted
      if (chat.type === 'group' || chat.type === 'muc') {
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
        archived: nextArchived
      }).catch(() => {})
    }

    setShowInfo(false)
    navigate('/chats')
  }

  const handleLeaveGroup = async () => {
    const bridge = getBrowserXmppBridge()
    try {
      if (chat.type === 'muc' && chat.server !== 'muc.p2p') {
        if (!bridge?.leaveServerMuc) throw new Error('XMPP room support is unavailable in this browser.')
        const roomJid = chat.handle || chat.id
        const nick = bridge.getServerJid?.()?.split('@')[0] || bridge.getLocalJid().split('@')[0]
        await bridge.leaveServerMuc(roomJid, nick)
      } else {
        await bridge?.updateMucRoomSettings(chat.id, { autoJoin: false })
        await bridge?.leaveMucRoom(chat.id)
      }
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not leave the room', 'error')
      return
    }
    removeGroupChatSession(chat.id.replace(/@muc\.p2p$/, ''))
    setShowInfo(false)
    navigate('/chats')
  }

  const renderHeader = () => {
    if (groupChatState.type === 'direct') {
      return (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-[11px] font-semibold text-muted-foreground">
              <span aria-hidden="true">{groupChatState.name.trim().charAt(0).toUpperCase() || '?'}</span>
              {groupChatState.avatar && <img src={groupChatState.avatar} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
            </div>
            <span className={`absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-background ${groupChatState.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm text-foreground truncate">{groupChatState.name}</span>
              {groupChatState.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
              {groupChatState.encrypted && <Lock size={9} className="text-accent flex-shrink-0" />}
            </div>
            {typingPeer ? (
              <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-accent">
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  typing…
              </span>
            ) : (
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {groupChatState.online
                  ? 'Online'
                  : <><span className="sm:hidden">Offline</span><span className="hidden sm:inline">{groupChatState.handle}</span></>}
              </span>
            )}
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
            <span className="font-mono text-[10px] text-muted-foreground">{groupChatState.memberCount} {groupChatState.memberCount === 1 ? 'member' : 'members'}</span>
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
          <span className="font-mono text-[10px] text-muted-foreground">{groupChatState.memberCount?.toLocaleString()} {groupChatState.memberCount === 1 ? 'member' : 'members'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>

          {renderHeader()}

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => setShowInfo((v) => !v)} aria-label={showInfo ? 'Close conversation details' : 'Conversation details'} aria-expanded={showInfo}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${showInfo ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
              {showInfo ? <X size={16} /> : <Info size={16} />}
            </button>
          </div>
        </div>

      </header>

      <div className="flex flex-1 overflow-hidden">
        <main ref={historyScrollRef} className={`flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5 ${showInfo ? 'hidden' : ''}`}>
          {historyError && (
            <div role="alert" className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-destructive">Could not load {historyLabel} history.</p>
                <p className="mt-0.5 break-words text-[11px] text-muted-foreground">Showing messages saved on this device where available. {historyError}</p>
              </div>
              <button onClick={historyErrorIsOlder ? beginOlderHistoryLoad : refreshHistory} aria-label={historyErrorIsOlder ? 'Retry loading older messages' : `Retry loading ${historyLabel} history`} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10">
                <RotateCcw size={14} />
              </button>
            </div>
          )}
          {historyLoading && (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> {messages.length === 0 ? `Loading ${historyLabel} history…` : `Checking for newer ${historyLabel} messages…`}
            </div>
          )}
          {hasOlderHistory && (
            <div className="flex justify-center py-2">
              <button type="button" onClick={beginOlderHistoryLoad} disabled={loadingOlderHistory}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-wait disabled:opacity-60">
                {loadingOlderHistory && <Loader2 size={14} className="animate-spin" />}
                {loadingOlderHistory ? 'Loading older messages…' : 'Load older messages'}
              </button>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={msg.id} id={`message-${encodeURIComponent(msg.id)}`} className={`rounded-2xl transition-shadow ${highlightedMessageId === msg.id ? 'ring-2 ring-primary/60' : ''}`}>
              <Bubble
                msg={msg}
                isMine={isMine(msg)}
                showAvatar={showAvatar(i)}
                type={groupChatState.type}
                queued={queuedMessageIds.has(msg.id)}
                queueConnectionName={isExternalXmppDirect ? 'XMPP server connection' : 'peer network connection'}
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
                onRetry={(messageId) => { void retryMessage(messageId) }}
                onImageClick={(url, alt) => {
                  const allImages = messages.flatMap((m) => m.attachments?.filter((a) => a.kind === 'image') ?? [])
                  const index = allImages.findIndex((img) => img.url === url)
                  setMediaViewer({ items: allImages, index: index >= 0 ? index : 0 })
                }}
                replyPreview={resolveReplyPreview(msg)}
              />
            </div>
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
                onLeave={() => { void handleLeaveGroup() }}
              />
            )}
            {groupChatState.type === 'muc' && (
              <MucSettings
                chat={groupChatState}
                onKick={(jid) => setModAction({ type: 'kick', target: jid })}
                onBan={(jid) => setModAction({ type: 'ban', target: jid })}
                onToggleMute={handleToggleGroupMute}
                onLeave={() => { void handleLeaveGroup() }}
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
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
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
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                aria-label="Cancel reply"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {showMentionPicker && (
            <div id="chat-mention-options" role="listbox" aria-label="Mention suggestions" className="border-t border-border bg-background">
              <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-primary">@mention</span>
                <span className="font-mono text-[10px] text-muted-foreground">· {filteredMentions.length} member{filteredMentions.length !== 1 ? 's' : ''}</span>
                {mentionQuery && <span className="font-mono text-[10px] text-muted-foreground">for "{mentionQuery}"</span>}
              </div>
              {filteredMentions.length > 0 ? filteredMentions.map((p, index) => (
                <button
                  key={p.id}
                  id={`chat-mention-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeMentionIndex}
                  onClick={() => selectMention(p)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left border-b border-border last:border-0 ${index === activeMentionIndex ? 'bg-secondary' : 'hover:bg-secondary'}`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border">
                      {p.avatar
                        ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-foreground">{p.name[0]}</div>}
                    </div>
                    <span aria-hidden="true" className={`absolute -bottom-px -right-px w-2 h-2 rounded-full border border-background ${p.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                      <RoleIcon role={p.role} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground truncate block">{p.handle}</span>
                    <span className="sr-only">{p.online ? 'Online' : 'Offline'}</span>
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
                    aria-label="Search emoji"
                    value={emojiSearch}
                    onChange={(e) => {
                      setEmojiSearch(e.target.value)
                      if (e.target.value) setEmojiCategory('')
                    }}
                    placeholder="Search emoji…"
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  <button onClick={() => {
                    if (emojiSearch) {
                      setEmojiSearch('')
                      setEmojiCategory('recent')
                    } else {
                      setShowEmojiPicker(false)
                    }
                  }} aria-label={emojiSearch ? 'Clear emoji search' : 'Close emoji picker'} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                    <X size={15} />
                  </button>
                </div>
              </div>

              {!emojiSearch && (
                <div className="flex overflow-x-auto border-b border-border" style={{ scrollbarWidth: 'none' }}>
                  {EMOJI_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setEmojiCategory(cat.id)}
                        aria-label={`${cat.label} emoji`}
                        aria-pressed={emojiCategory === cat.id}
                        className={`flex h-11 min-w-11 flex-shrink-0 items-center justify-center px-3 text-base transition-colors relative ${emojiCategory === cat.id ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}
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
                    <div className="grid grid-cols-6 gap-0 sm:grid-cols-9">
                      {emojis.map((emoji, i) => (
                        <button key={`${emoji}-${i}`}
                          onClick={() => insertEmoji(emoji)}
                          aria-label={`Insert ${emoji}`}
                          className="flex min-h-11 w-full items-center justify-center rounded text-xl leading-none transition-colors hover:bg-secondary">
                          {emoji}
                        </button>
                      ))}
                      {emojis.length === 0 && (
                        <div className="col-span-6 py-6 text-center text-sm text-muted-foreground sm:col-span-9">No results</div>
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
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${selectedAttachments.length >= MAX_ATTACHMENTS ? 'bg-warn/10 text-warn' : 'bg-secondary text-muted-foreground'}`}>
                    {selectedAttachments.length}/{MAX_ATTACHMENTS}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!permissions.photosAndFiles || uploadingAttachments || uploadingVoice}
                    title={!permissions.photosAndFiles ? 'Enable Photos and files in Settings to attach files' : undefined}
                    aria-label="Choose files"
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploadingAttachments ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowImagePicker(false); void startVoiceRecording() }}
                    disabled={!permissions.photosAndFiles || uploadingVoice || startingVoice || uploadingAttachments}
                    aria-label={startingVoice ? 'Requesting microphone access' : 'Record voice message'}
                    title={!permissions.photosAndFiles ? 'Enable Photos and files in Settings to send voice messages' : 'Record voice message'}
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploadingVoice || startingVoice ? <Loader2 size={15} className="animate-spin" /> : <Mic size={16} />}
                  </button>
                </div>
              </div>
              <p className="px-4 py-2 text-[10px] text-muted-foreground">
                Up to {MAX_ATTACHMENTS} files · 50 MiB each.{' '}
                {isExternalXmppDirect
                  ? 'On XMPP, anyone with the link can access files; contents aren’t end-to-end encrypted.'
                  : 'Files upload to the peer network when selected.'}
              </p>

              <input
                ref={fileInputRef}
                aria-label="Choose attachments"
                type="file"
                disabled={!permissions.photosAndFiles || uploadingAttachments || uploadingVoice}
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (uploadingAttachmentsRef.current) {
                    e.target.value = ''
                    return
                  }
                  const availableSlots = Math.max(0, MAX_ATTACHMENTS - selectedAttachments.length)
                  const filesToUpload = files.slice(0, availableSlots)
                  if (files.length > filesToUpload.length) {
                    emitToast(availableSlots === 0
                      ? `You can attach up to ${MAX_ATTACHMENTS} files to a message.`
                      : `Only ${availableSlots} more file${availableSlots === 1 ? '' : 's'} can be attached.`, 'info')
                  }
                  if (filesToUpload.length === 0) {
                    e.target.value = ''
                    return
                  }
                  const bridge = getBrowserXmppBridge()
                  if (!bridge?.uploadFile) {
                    emitToast('File uploads are unavailable while the peer network is offline', 'error')
                    e.target.value = ''
                    return
                  }
                  uploadingAttachmentsRef.current = true
                  setUploadingAttachments(true)
                  try {
                    for (const file of filesToUpload) {
                      try {
                        const result = await bridge.uploadFile(file, chat.handle || chat.id)
                        toggleAttachment({
                          id: result.url,
                          url: result.url,
                          alt: result.alt,
                          kind: result.kind,
                        })
                      } catch (error) {
                        emitToast(error instanceof Error ? `Could not upload ${file.name}: ${error.message}` : `Could not upload ${file.name}`, 'error')
                      }
                    }
                  } finally {
                    uploadingAttachmentsRef.current = false
                    setUploadingAttachments(false)
                    e.target.value = ''
                  }
                }}
              />

              {uploadingAttachments && <p role="status" aria-live="polite" className="px-4 pb-2 text-[11px] text-muted-foreground">Uploading files… Sending is available when the upload finishes.</p>}

              {selectedAttachments.length > 0 && (
                <div className="px-4 py-2.5 border-t border-border flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {selectedAttachments.map((asset) => (
                    <div key={asset.id} className={`relative flex-shrink-0 rounded-lg border border-border bg-secondary group ${asset.kind === 'file' && /\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(asset.alt) ? 'w-64 min-h-16 p-2' : 'w-20 h-20 overflow-hidden'}`}>
                      {asset.kind === 'image' ? (
                        <img src={asset.url} alt={asset.alt} className="w-full h-full object-cover" />
                      ) : /\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(asset.alt) ? (
                        <AudioAttachment attachment={asset} />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center">
                          <FileText size={18} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground leading-tight break-all">{asset.alt}</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(asset.id)}
                        aria-label={`Remove ${asset.alt}`}
                        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X size={10} className="text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {recordingVoice && (
            <div role="status" className="flex items-center gap-2 border-t border-border bg-card px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <span className="flex-1 text-xs font-mono text-foreground">Recording voice message · {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')} / 02:00</span>
              <button type="button" onClick={() => stopVoiceRecording(true)} aria-label="Discard voice recording" className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X size={15} />
              </button>
              <button type="button" onClick={() => stopVoiceRecording()} aria-label="Finish voice recording" className="flex min-h-11 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                <Square size={12} /> Stop
              </button>
            </div>
          )}
          {uploadingVoice && <div role="status" className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Preparing voice message…</div>}
          <div className="border-t border-border bg-background/95 backdrop-blur flex-shrink-0 px-3 py-2.5 flex items-end gap-2">
            <button
              onClick={() => toggleImagePicker()}
              aria-label={showImagePicker ? 'Close attachment picker' : 'Attach files'}
              aria-expanded={showImagePicker}
              disabled={!permissions.photosAndFiles || uploadingAttachments || uploadingVoice}
              title={!permissions.photosAndFiles ? 'Enable Photos and files in Settings to attach files' : 'Attach files'}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${showImagePicker ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
            >
              {showImagePicker ? <X size={18} /> : <Paperclip size={18} />}
            </button>

            <div className="flex-1 min-w-0 bg-secondary rounded-2xl px-3 py-2 flex items-end gap-2">
              <textarea
                ref={textareaRef}
                aria-label={chat.type === 'muc' ? `Message ${chat.name}` : `Message ${chat.name.split(' ')[0]}`}
                aria-autocomplete="list"
                aria-expanded={showMentionPicker}
                aria-controls={showMentionPicker ? 'chat-mention-options' : undefined}
                aria-activedescendant={showMentionPicker && filteredMentions.length > 0 ? `chat-mention-option-${Math.min(activeMentionIndex, filteredMentions.length - 1)}` : undefined}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && showMentionPicker) {
                    setShowMentionPicker(false)
                    return
                  }
                  if (showMentionPicker && filteredMentions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setActiveMentionIndex((index) => (index + 1) % filteredMentions.length)
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setActiveMentionIndex((index) => (index - 1 + filteredMentions.length) % filteredMentions.length)
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      selectMention(filteredMentions[Math.min(activeMentionIndex, filteredMentions.length - 1)])
                      return
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!sending && !uploadingAttachments && !uploadingVoice) void sendMessage()
                  }
                }}
                placeholder={chat.type === 'muc' ? `Message ${chat.name}…` : `Message ${chat.name.split(' ')[0]}…`}
                rows={1}
                disabled={sending}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed max-h-28 disabled:opacity-60"
                style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
              <button
                onClick={() => toggleEmojiPicker()}
                aria-label={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'}
                aria-expanded={showEmojiPicker}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors ${showEmojiPicker ? 'text-primary bg-primary/10' : ''}`}
              >
                <Smile size={17} />
              </button>
            </div>

            <button
              onClick={() => void sendMessage()}
                aria-label={sending ? 'Sending message' : uploadingAttachments || uploadingVoice ? 'Preparing attachments' : 'Send message'}
                disabled={sending || uploadingAttachments || uploadingVoice || (!input.trim() && selectedAttachments.length === 0)}
              className={`flex h-11 w-11 items-center justify-center rounded-full flex-shrink-0 transition-all disabled:opacity-50 disabled:cursor-wait ${input.trim() || selectedAttachments.length > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-muted-foreground'}`}
            >
              {uploadingAttachments || uploadingVoice ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
