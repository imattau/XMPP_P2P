import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useChatBridge, type ChatMessage as BridgeChatMessage, type ChatThread as BridgeChatThread } from '../bridge'
import {
  ArrowLeft, Phone, Video, Info, X, Send, Smile, Paperclip,
  Mic, Shield, Lock, BellOff, Bell, Trash2, LogOut, Users,
  Hash, Globe, EyeOff, UserPlus, UserMinus, Settings,
  CheckCheck, Check, Image, FileText, MoreHorizontal,
  MessageSquare, Key, Archive, ChevronRight, Crown, Gavel,
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
  replyTo?: { senderName: string; content: string }
  fileName?: string
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

const CHATS: Record<string, ChatData> = {
  '1': {
    id: '1', type: 'direct', name: 'Maren Holdt', handle: 'maren@social.coop',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format',
    server: 'social.coop', encrypted: true, online: true, verified: true,
    participants: [
      { id: 'maren', name: 'Maren Holdt', handle: 'maren@social.coop', server: 'social.coop', online: true, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format' },
      { id: ME, name: 'You', handle: 'you@jabber.de', server: 'jabber.de', online: true },
    ],
  },
  '2': {
    id: '2', type: 'group', name: 'Protocol Working Group',
    subject: 'XMPP MUC spec review - deadline 2026-07-01',
    server: 'jabber.de', encrypted: true, memberCount: 7,
    participants: [
      { id: 'theo', name: 'Theo N', handle: 'theo_n@hachyderm.io', server: 'hachyderm.io', online: true, role: 'owner', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&auto=format' },
      { id: 'kaspar', name: 'Kaspar V', handle: 'kvold@fosstodon.org', server: 'fosstodon.org', online: false, role: 'admin', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&auto=format' },
      { id: 'elif', name: 'Elif Ş', handle: 'elif_dev@mastodon.social', server: 'mastodon.social', online: true, role: 'member', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&auto=format' },
      { id: 'maren', name: 'Maren H', handle: 'maren@social.coop', server: 'social.coop', online: true, role: 'member', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format' },
      { id: ME, name: 'You', handle: 'you@jabber.de', server: 'jabber.de', online: true, role: 'member' },
    ],
  },
  '3': {
    id: '3', type: 'muc', name: '#fedidev', handle: 'fedidev@conference.fosstodon.org',
    server: 'conference.fosstodon.org', memberCount: 341,
    subject: 'Federated dev community · monthly call Thu 18:00 UTC',
    encrypted: false, persistent: true, moderated: false, anonymous: false,
    memberOnly: false, passwordProtected: false,
    participants: [
      { id: 'ingrid', name: 'Ingrid L', handle: 'ingridl@sigmoid.social', server: 'sigmoid.social', online: true, role: 'moderator', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format' },
      { id: 'kaspar', name: 'Kaspar V', handle: 'kvold@fosstodon.org', server: 'fosstodon.org', online: false, role: 'owner', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&auto=format' },
      { id: 'theo', name: 'Theo N', handle: 'theo_n@hachyderm.io', server: 'hachyderm.io', online: true, role: 'member', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&auto=format' },
      { id: ME, name: 'you', handle: 'you@jabber.de', server: 'jabber.de', online: true, role: 'member' },
    ],
  },
  '7': {
    id: '7', type: 'direct', name: 'Ingrid Larsen', handle: 'ingridl@sigmoid.social',
    avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format',
    server: 'sigmoid.social', encrypted: true, online: true,
    participants: [
      { id: 'ingrid', name: 'Ingrid Larsen', handle: 'ingridl@sigmoid.social', server: 'sigmoid.social', online: true, avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format' },
      { id: ME, name: 'You', handle: 'you@jabber.de', server: 'jabber.de', online: true },
    ],
  },
}

const MESSAGES: Record<string, Message[]> = {
  '1': [
    { id: 'm1', senderId: 'maren', senderName: 'Maren', senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', content: 'Hey! Did you get a chance to look at the new RFC draft?', timestamp: '10:02', read: true },
    { id: 'm2', senderId: ME, senderName: 'You', content: 'Just skimming it now. The push notification section is interesting.', timestamp: '10:04', delivered: true, read: true },
    { id: 'm3', senderId: 'maren', senderName: 'Maren', senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', content: 'Right? Finally addressing the battery drain properly. The proxy approach is clever.', timestamp: '10:06', reactions: [{ emoji: '👍', count: 1, mine: true }] },
    { id: 'm4', senderId: ME, senderName: 'You', content: 'The mobile XMPP situation has always been the weakest link. If this lands, it removes the last major objection.', timestamp: '10:08', delivered: true, read: true },
    { id: 'm5', senderId: 'maren', senderName: 'Maren', senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', content: 'Exactly. And the spec is already further along than I expected. The authors clearly know what they\'re doing.', timestamp: '10:11' },
    { id: 'm6', senderId: ME, senderName: 'You', content: 'The new RFC looks solid. Did you get a chance to review the push notification section?', timestamp: '10:14', delivered: true, read: false },
  ],
  '2': [
    { id: 'm1', kind: 'system', senderId: 'system', senderName: '', content: 'Group created by Theo N · 7 members', timestamp: 'Mon' },
    { id: 'm2', senderId: 'theo', senderName: 'Theo', senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', content: 'Alright everyone, let\'s kick off the MUC spec review. I\'ve put the draft in the topic.', timestamp: 'Mon 14:00' },
    { id: 'm3', senderId: 'kaspar', senderName: 'Kaspar', senderAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', content: 'Read through sections 1-4 this morning. The history management changes are significant.', timestamp: 'Mon 14:22' },
    { id: 'm4', senderId: 'elif', senderName: 'Elif', senderAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', content: 'The subscription model looks cleaner than the current XEP-0045 approach. Less state to manage on the server.', timestamp: 'Mon 15:01' },
    { id: 'm5', senderId: ME, senderName: 'You', content: 'Agreed. The old model was complex enough that most servers had subtle incompatibilities.', timestamp: 'Mon 15:04', delivered: true, read: true },
    { id: 'm6', senderId: 'theo', senderName: 'Theo', senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', content: 'Benchmarks are looking great. 2x throughput at 10k connections.', timestamp: '4m', reactions: [{ emoji: '🚀', count: 3 }, { emoji: '🔥', count: 2 }] },
  ],
  '3': [
    { id: 'm1', kind: 'system', senderId: 'system', senderName: '', content: 'You joined #fedidev', timestamp: '2 weeks ago' },
    { id: 'm2', senderId: 'kaspar', senderName: 'kvold', senderAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', content: 'Welcome everyone to the monthly sync. Agenda in the topic.', timestamp: 'Thu 17:59' },
    { id: 'm3', senderId: 'ingrid', senderName: 'ingridl', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Monthly call tomorrow 18:00 UTC - agenda in the topic', timestamp: '9m' },
    { id: 'm4', senderId: 'theo', senderName: 'theo_n', senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', content: 'Will the call be recorded? Can\'t make it live.', timestamp: '7m' },
    { id: 'm5', senderId: 'ingrid', senderName: 'ingridl', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Yes, notes will be posted in the wiki within 24h.', timestamp: '5m' },
  ],
  '7': [
    { id: 'm1', senderId: 'ingrid', senderName: 'Ingrid', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Hey! Quick question - are you going to the FediDev call tomorrow?', timestamp: '09:15' },
    { id: 'm2', senderId: ME, senderName: 'You', content: 'Planning to, yes. You presenting anything?', timestamp: '09:22', delivered: true, read: true },
    { id: 'm3', senderId: 'ingrid', senderName: 'Ingrid', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Just a short update on the ActivityPub C2S item. 10 minutes max.', timestamp: '09:24', kind: 'audio', fileName: 'Voice message · 0:42' },
  ],
}

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

function Bubble({ msg, isMine, showAvatar, type }: { msg: Message; isMine: boolean; showAvatar: boolean; type: ChatType }) {
  if (msg.kind === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="font-mono text-[10px] text-muted-foreground bg-secondary/60 px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    )
  }

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

        {msg.replyTo && (
          <div className={`text-[11px] px-2.5 py-1 mb-0.5 rounded border-l-2 border-primary bg-primary/5 text-muted-foreground max-w-full ${isMine ? 'text-right' : ''}`}>
            <span className="font-mono text-primary">{msg.replyTo.senderName}</span>
            <p className="truncate">{msg.replyTo.content}</p>
          </div>
        )}

        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
          isMine
            ? 'bg-primary text-white rounded-tr-sm'
            : 'bg-secondary text-foreground rounded-tl-sm'
        } ${msg.kind === 'audio' ? 'flex items-center gap-2' : ''}`}>
          {msg.kind === 'audio' ? (
            <>
              <Mic size={14} className={isMine ? 'text-white/80' : 'text-muted-foreground'} />
              <span className="font-mono text-[12px]">{msg.fileName || msg.content}</span>
            </>
          ) : msg.kind === 'file' ? (
            <span className="flex items-center gap-1.5">
              <FileText size={13} />
              <span className="font-mono text-[12px]">{msg.fileName || msg.content}</span>
            </span>
          ) : (
            msg.content
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
      </div>
    </div>
  )
}

function DirectSettings({ chat }: { chat: ChatData }) {
  const [muted, setMuted] = useState(chat.muted ?? false)
  const other = chat.participants.find((p) => p.id !== ME)!
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

function GroupSettings({ chat }: { chat: ChatData }) {
  const [muted, setMuted] = useState(chat.muted ?? false)
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
          { icon: muted ? Bell : BellOff, label: muted ? 'Unmute' : 'Mute notifications', action: () => setMuted((v) => !v) },
          { icon: Archive, label: 'Archive' },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left text-foreground/80">
            <Icon size={15} /><span className="text-sm">{label}</span>
          </button>
        ))}
      </div>
      <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left text-destructive">
        <LogOut size={15} /><span className="text-sm">Leave group</span>
      </button>
    </div>
  )
}

function MucSettings({ chat }: { chat: ChatData }) {
  const [muted, setMuted] = useState(chat.muted ?? false)
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
          {[
            { icon: Settings, label: 'Room configuration' },
            { icon: UserMinus, label: 'Kick participant' },
            { icon: AlertTriangle, label: 'Ban participant' },
          ].map(({ icon: Icon, label }) => (
            <button key={label} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary transition-colors text-left text-foreground/80">
              <Icon size={15} /><span className="text-sm">{label}</span>
              <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
            </button>
          ))}
        </div>
      )}

      <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left text-destructive">
        <LogOut size={15} /><span className="text-sm">Leave channel</span>
      </button>
    </div>
  )
}

export default function ChatThreadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const chat = CHATS[id ?? ''] ?? CHATS['1']
  const initialMessages = MESSAGES[id ?? ''] ?? MESSAGES['1'] ?? []
  const [showInfo, setShowInfo] = useState(false)
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
    sendMessage,
  } = useChatBridge(chat as BridgeChatThread, initialMessages as BridgeChatMessage[])

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [messages])

  const isMine = (msg: Message) => msg.senderId === ME
  const showAvatar = (i: number) => {
    const cur = messages[i]
    const next = messages[i + 1]
    return !next || next.senderId !== cur.senderId || next.kind === 'system'
  }

  const renderHeader = () => {
    if (chat.type === 'direct') {
      return (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border">
              {chat.avatar && <img src={chat.avatar} alt={chat.name} className="w-full h-full object-cover" />}
            </div>
            <span className={`absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-background ${chat.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm text-foreground truncate">{chat.name}</span>
              {chat.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
              {chat.encrypted && <Lock size={9} className="text-accent flex-shrink-0" />}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{chat.online ? 'Online' : chat.handle}</span>
          </div>
        </div>
      )
    }
    if (chat.type === 'group') {
      return (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute top-0 left-0 w-5 h-5 rounded-full bg-secondary border border-background overflow-hidden">
              {chat.participants[0]?.avatar && <img src={chat.participants[0].avatar} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-secondary border border-background overflow-hidden">
              {chat.participants[1]?.avatar && <img src={chat.participants[1].avatar} alt="" className="w-full h-full object-cover" />}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm text-foreground truncate">{chat.name}</span>
              {chat.encrypted && <Lock size={9} className="text-accent flex-shrink-0" />}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{chat.memberCount} members</span>
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
          <span className="font-semibold text-sm text-foreground truncate block">{chat.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{chat.memberCount?.toLocaleString()} members</span>
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

        {chat.subject && !showInfo && (
          <div className="px-4 py-1.5 border-t border-border bg-secondary/30">
            <p className="font-mono text-[10px] text-muted-foreground truncate">{chat.subject}</p>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className={`flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5 ${showInfo ? 'hidden' : ''}`}>
          {messages.map((msg, i) => (
            <Bubble key={msg.id} msg={msg} isMine={isMine(msg)} showAvatar={showAvatar(i)} type={chat.type} />
          ))}
          <div ref={bottomRef} />
        </main>

        {showInfo && (
          <div className="flex-1 overflow-hidden flex flex-col border-l border-border">
            <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {chat.type === 'direct' ? 'Contact info' : chat.type === 'group' ? 'Group info' : 'Room info'}
              </p>
            </div>
            {chat.type === 'direct' && <DirectSettings chat={chat} />}
            {chat.type === 'group' && <GroupSettings chat={chat} />}
            {chat.type === 'muc' && <MucSettings chat={chat} />}
          </div>
        )}
      </div>

      {!showInfo && (
        <>
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
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  files.slice(0, MAX_IMAGES - selectedAttachments.length).forEach((file, i) => {
                    toggleAttachment({
                      id: `upload-${Date.now()}-${i}`,
                      url: URL.createObjectURL(file),
                      alt: file.name,
                      kind: file.type.startsWith('image/') ? 'image' : 'file',
                    })
                  })
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
    </div>
  )
}
