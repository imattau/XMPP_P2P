import * as React from 'react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Share2,
  Bookmark, Hash, Users, Globe, Lock, Shield, MoreHorizontal,
  Zap, Image, Smile, AtSign, Send, ChevronDown, Check,
} from 'lucide-react'

interface Author {
  name: string
  handle: string
  avatar: string
  verified?: boolean
  server: string
}

interface Reply {
  id: string
  author: Author
  content: string
  timestamp: string
  likes: number
  liked?: boolean
  replies?: Reply[]
  depth?: number
}

interface Post {
  id: string
  author: Author
  content: string
  timestamp: string
  fullDate: string
  topic?: string
  topicColor?: string
  community?: string
  communityIcon?: string
  likes: number
  comments: number
  reposts: number
  views: number
  liked?: boolean
  reposted?: boolean
  bookmarked?: boolean
  privacy?: 'public' | 'followers' | 'community'
  media?: { url: string; alt: string }
}

const POSTS: Record<string, Post> = {
  '1': {
    id: '1',
    author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format', verified: true, server: 'social.coop' },
    content: 'The decentralized web is finally catching up to the UX expectations users have from centralized platforms. XMPP has been quietly powering this transition for years - it just never got the credit.\n\nThe protocol is mature, battle-tested, and extensible. What it lacked was a coherent product story. That\'s changing.',
    timestamp: '2m', fullDate: '10:14 AM · Jun 19, 2026',
    topic: 'DecentralWeb', topicColor: '#3b82f6',
    likes: 284, comments: 31, reposts: 47, views: 8420,
    liked: true, privacy: 'public',
  },
  '3': {
    id: '3',
    author: { name: 'Elif Şahin', handle: 'elif_dev', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&auto=format', server: 'mastodon.social' },
    content: 'Hot take: the problem with federated social networks isn\'t tech, it\'s onboarding. Most people don\'t understand why they\'d choose a server. We need to abstract that entirely.\n\nThe server choice question should be opt-in for power users, not the default first interaction.',
    timestamp: '38m', fullDate: '9:38 AM · Jun 19, 2026',
    likes: 1420, comments: 203, reposts: 311, views: 42100,
    bookmarked: true, privacy: 'public',
  },
  '7': {
    id: '7',
    author: { name: 'Yuki Tanaka', handle: 'yukitan', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&h=64&fit=crop&auto=format', server: 'infosec.exchange' },
    content: 'End-to-end encryption in XMPP with OMEMO is underrated. Signal-level security, open protocol, no phone number required. Why aren\'t more people talking about this?\n\nOMEMO uses the Double Ratchet algorithm - the same one Signal uses. Your server literally cannot read your messages.',
    timestamp: '4h', fullDate: '6:12 AM · Jun 19, 2026',
    topic: 'Privacy', topicColor: '#a855f7',
    likes: 2103, comments: 147, reposts: 489, views: 61800,
    liked: true, bookmarked: true, privacy: 'public',
  },
}

const REPLIES: Record<string, Reply[]> = {
  '1': [
    {
      id: 'r1', depth: 0,
      author: { name: 'Felix Bergström', handle: 'felixb', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', server: 'chaos.social' },
      content: 'Completely agree. The UX gap was always the biggest barrier, not the protocol itself. Prosody + a good client is already competitive with most commercial options.',
      timestamp: '1m', likes: 34, liked: false,
      replies: [
        {
          id: 'r1a', depth: 1,
          author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', verified: true, server: 'social.coop' },
          content: 'Exactly - and Prosody\'s plugin ecosystem has matured massively in the last two years. mod_http_upload, MAM, push - it\'s all there.',
          timestamp: 'just now', likes: 12, liked: true,
        },
      ],
    },
    {
      id: 'r2', depth: 0,
      author: { name: 'Kaspar Vold', handle: 'kvold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', verified: true, server: 'fosstodon.org' },
      content: 'The RFC for push notifications is going to be a significant inflection point. Once mobile battery issues are solved properly, the last real objection disappears.',
      timestamp: '1m', likes: 18,
    },
    {
      id: 'r3', depth: 0,
      author: { name: 'Amara Diallo', handle: 'amara_d', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=48&h=48&fit=crop&auto=format', server: 'blacktwitter.io' },
      content: 'What clients are people actually recommending these days? I\'ve been on Conversations for Android but curious if something better has landed.',
      timestamp: '2m', likes: 7,
      replies: [
        {
          id: 'r3a', depth: 1,
          author: { name: 'Ingrid Larsen', handle: 'ingridl', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', server: 'sigmoid.social' },
          content: 'Monal on iOS has been solid. Conversations is still king on Android imo. Dino on desktop if you\'re on Linux.',
          timestamp: '1m', likes: 11,
        },
        {
          id: 'r3b', depth: 1,
          author: { name: 'Theo Nakashima', handle: 'theo_n', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', server: 'hachyderm.io' },
          content: 'Been building one actually. Go backend, React Native frontend. OMEMO from day one. Should have a beta in Q3.',
          timestamp: 'just now', likes: 29, liked: true,
        },
      ],
    },
    {
      id: 'r4', depth: 0,
      author: { name: 'Yuki Tanaka', handle: 'yukitan', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=48&h=48&fit=crop&auto=format', server: 'infosec.exchange' },
      content: 'The credit gap is partially a marketing problem. ActivityPub got Mastodon, XMPP never had a flagship product. That\'s what\'s missing - a reference implementation people actually want to use.',
      timestamp: '3m', likes: 44,
    },
  ],
  '3': [
    {
      id: 'r5', depth: 0,
      author: { name: 'Felix Bergström', handle: 'felixb', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', server: 'chaos.social' },
      content: 'This is exactly why I moved everything to self-hosted. Once you stop thinking about which server and just pick one, it clicks immediately.',
      timestamp: '30m', likes: 88, liked: true,
    },
    {
      id: 'r6', depth: 0,
      author: { name: 'Kaspar Vold', handle: 'kvold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', verified: true, server: 'fosstodon.org' },
      content: 'The "pick a server" step is genuinely confusing. Even technical people second-guess themselves. A curated default with migration support would fix 80% of this.',
      timestamp: '25m', likes: 203,
      replies: [
        {
          id: 'r6a', depth: 1,
          author: { name: 'Elif Şahin', handle: 'elif_dev', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', server: 'mastodon.social' },
          content: 'Exactly what I mean - migration support is the key. You should be able to move your account without losing your social graph.',
          timestamp: '20m', likes: 67, liked: true,
        },
      ],
    },
  ],
  '7': [
    {
      id: 'r7', depth: 0,
      author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', verified: true, server: 'social.coop' },
      content: 'I\'ve been running OMEMO for two years. The UX in Conversations is actually really smooth - it just works. No key management headaches for end users.',
      timestamp: '3h', likes: 156, liked: true,
    },
    {
      id: 'r8', depth: 0,
      author: { name: 'Kaspar Vold', handle: 'kvold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', verified: true, server: 'fosstodon.org' },
      content: 'The Double Ratchet detail matters. People compare OMEMO to PGP but that\'s wrong - it\'s fundamentally different. Forward secrecy, break-in recovery. The security model is far superior to anything email-based.',
      timestamp: '2h', likes: 89,
    },
  ],
}

function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function PrivacyIcon({ privacy }: { privacy?: string }) {
  if (privacy === 'followers') return <Lock size={11} className="text-muted-foreground" />
  if (privacy === 'community') return <Users size={11} className="text-muted-foreground" />
  return <Globe size={11} className="text-muted-foreground" />
}

function ReplyThread({ reply, onLike, onReply }: { reply: Reply; onLike: (id: string) => void; onReply: (reply: Reply) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = reply.replies && reply.replies.length > 0
  const isNested = (reply.depth ?? 0) > 0

  return (
    <div className={`${isNested ? 'ml-8 border-l-2 border-border pl-3' : ''}`}>
      <div className="flex gap-2.5 py-3 px-4 hover:bg-white/[0.02] transition-colors cursor-pointer">
        <div className="flex-shrink-0 flex flex-col items-center gap-0 relative">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
            <img src={reply.author.avatar} alt={reply.author.name} className="w-full h-full object-cover" />
          </div>
          {hasChildren && !collapsed && (
            <div className="w-px flex-1 bg-border mt-1 min-h-[12px]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-semibold text-[13px] text-foreground leading-tight">{reply.author.name}</span>
            {reply.author.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
            <span className="font-mono text-[11px] text-muted-foreground">@{reply.author.handle}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="font-mono text-[11px] text-muted-foreground">{reply.timestamp}</span>
            <button className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal size={13} />
            </button>
          </div>

          <p className="text-[13px] text-foreground/90 leading-relaxed mb-2">{reply.content}</p>

          <div className="flex items-center gap-4 -ml-1">
            <button onClick={() => onReply(reply)} className="flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all">
              <MessageCircle size={13} />
              {hasChildren && <span className="font-mono text-[10px]">{reply.replies!.length}</span>}
            </button>
            <button className="flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition-all">
              <Repeat2 size={13} />
            </button>
            <button onClick={() => onLike(reply.id)}
              className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${reply.liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}>
              <Heart size={13} fill={reply.liked ? 'currentColor' : 'none'} />
              {reply.likes > 0 && <span className="font-mono text-[10px]">{formatNum(reply.likes)}</span>}
            </button>
            <button className="flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {hasChildren && !collapsed && (
        <div>
          {reply.replies!.map((child) => (
            <ReplyThread key={child.id} reply={{ ...child, depth: (reply.depth ?? 0) + 1 }} onLike={onLike} onReply={onReply} />
          ))}
        </div>
      )}

      {hasChildren && (
        <button onClick={() => setCollapsed((v) => !v)}
          className="ml-12 mb-1 flex items-center gap-1 text-[11px] font-mono text-primary hover:underline">
          <ChevronDown size={11} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          {collapsed ? `Show ${reply.replies!.length} repl${reply.replies!.length > 1 ? 'ies' : 'y'}` : 'Collapse'}
        </button>
      )}
    </div>
  )
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const post = POSTS[id ?? ''] ?? POSTS['1']
  const [liked, setLiked] = useState(post.liked ?? false)
  const [likes, setLikes] = useState(post.likes)
  const [reposts, setReposts] = useState(post.reposts)
  const [reposted, setReposted] = useState(post.reposted ?? false)
  const [bookmarked, setBookmarked] = useState(post.bookmarked ?? false)
  const [replyText, setReplyText] = useState('')
  const [replies, setReplies] = useState<Reply[]>(REPLIES[id ?? ''] ?? REPLIES['1'] ?? [])
  const [replyTarget, setReplyTarget] = useState<Reply | null>(null)

  const handleLikeReply = (replyId: string) => {
    const toggle = (list: Reply[]): Reply[] =>
      list.map((r) => {
        if (r.id === replyId) return { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
        if (r.replies) return { ...r, replies: toggle(r.replies) }
        return r
      })
    setReplies((prev) => toggle(prev))
  }

  const handleReplyTarget = (target: Reply) => {
    setReplyTarget(target)
    setTimeout(() => {
      const textarea = document.getElementById('reply-textarea')
      if (textarea) {
        (textarea as HTMLTextAreaElement).focus()
      }
    }, 50)
  }

  const handleSubmitReply = () => {
    if (!replyText.trim()) return
    const newReply: Reply = {
      id: `new-${Date.now()}`, depth: replyTarget ? (replyTarget.depth ?? 0) + 1 : 0,
      author: { name: 'You', handle: 'you', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=48&h=48&fit=crop&auto=format', verified: true, server: 'jabber.de' },
      content: replyText.trim(),
      timestamp: 'just now', likes: 0,
    }
    if (replyTarget) {
      const insertNested = (list: Reply[]): Reply[] =>
        list.map((r) => {
          if (r.id === replyTarget.id) {
            return { ...r, replies: [newReply, ...(r.replies ?? [])] }
          }
          if (r.replies) {
            return { ...r, replies: insertNested(r.replies) }
          }
          return r
        })
      setReplies((prev) => insertNested(prev))
      setReplyTarget(null)
    } else {
      setReplies((prev) => [newReply, ...prev])
    }
    setReplyText('')
  }

  const handleRepost = () => {
    if (reposted) {
      return
    }
    setReposted(true)
    setReposts((count) => count + 1)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center gap-3 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <span className="font-semibold text-sm">Post</span>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
              <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-foreground">{post.author.name}</span>
                {post.author.verified && <Shield size={12} className="text-primary" />}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted-foreground">@{post.author.handle}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-mono text-[11px] text-muted-foreground">{post.author.server}</span>
              </div>
            </div>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal size={16} />
            </button>
          </div>

          {post.topic && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded"
                style={{ color: post.topicColor, backgroundColor: post.topicColor + '1a' }}>
                <Hash size={9} />{post.topic}
              </span>
            </div>
          )}
          {post.community && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                {post.communityIcon} {post.community}
              </span>
            </div>
          )}

          <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-line mb-3">{post.content}</p>

          {post.media && (
            <div className="mb-3 rounded-lg overflow-hidden border border-border bg-secondary">
              <img src={post.media.url} alt={post.media.alt} className="w-full object-cover max-h-72" />
            </div>
          )}

          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
            <span className="font-mono text-[11px] text-muted-foreground">{post.fullDate}</span>
            <span className="text-border">·</span>
            <PrivacyIcon privacy={post.privacy} />
            <span className="font-mono text-[11px] text-muted-foreground capitalize">{post.privacy ?? 'public'}</span>
            <span className="text-border">·</span>
            <span className="font-mono text-[11px] text-muted-foreground">{formatNum(post.views)} views</span>
          </div>

          <div className="flex items-center gap-4 pb-3 border-b border-border">
            <span className="text-[13px] text-foreground">
              <span className="font-semibold">{formatNum(likes)}</span> <span className="text-muted-foreground">Likes</span>
            </span>
            <span className="text-[13px] text-foreground">
              <span className="font-semibold">{formatNum(reposts)}</span> <span className="text-muted-foreground">Reposts</span>
            </span>
            <span className="text-[13px] text-foreground">
              <span className="font-semibold">{formatNum(post.comments)}</span> <span className="text-muted-foreground">Replies</span>
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button className="flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all">
              <MessageCircle size={19} />
            </button>
            <button
              onClick={handleRepost}
              className={`flex items-center gap-1.5 p-2 rounded-lg transition-all ${reposted ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10'}`}
            >
              <Repeat2 size={19} />
            </button>
            <button onClick={() => { setLiked((v) => !v); setLikes((n) => liked ? n - 1 : n + 1) }}
              className={`flex items-center gap-1.5 p-2 rounded-lg transition-all ${liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}>
              <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => setBookmarked((v) => !v)}
              className={`flex items-center gap-1.5 p-2 rounded-lg transition-all ${bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
              <Bookmark size={19} fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button className="flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={18} />
            </button>
          </div>
        </div>

        {replyTarget && (
          <div className="px-4 py-1.5 bg-primary/10 border-b border-border flex items-center justify-between text-xs text-primary font-mono">
            <span>Replying to @{replyTarget.author.handle}</span>
            <button onClick={() => setReplyTarget(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="px-4 py-3 border-b border-border flex gap-3 items-start">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0 mt-0.5">
            <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=48&h=48&fit=crop&auto=format" alt="You" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              id="reply-textarea"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={replyTarget ? `Reply to @${replyTarget.author.handle}…` : `Reply to @${post.author.handle}…`}
              rows={replyText.length > 80 ? 3 : 1}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed"
            />
            {(replyText.length > 0 || replyTarget) && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-0.5">
                  {[Image, AtSign, Smile].map((Icon, i) => (
                    <button key={i} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                      <Icon size={15} />
                    </button>
                  ))}
                </div>
                <span className={`font-mono text-[10px] ml-auto ${500 - replyText.length < 50 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                  {500 - replyText.length}
                </span>
                <button onClick={handleSubmitReply}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors">
                  <Send size={12} />Reply
                </button>
              </div>
            )}
          </div>
        </div>

        {replies.length > 0 && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {replies.length} repl{replies.length !== 1 ? 'ies' : 'y'}
            </span>
          </div>
        )}

        <div>
          {replies.map((reply) => (
            <div key={reply.id} className="border-b border-border last:border-0">
              <ReplyThread reply={reply} onLike={handleLikeReply} onReply={handleReplyTarget} />
            </div>
          ))}
        </div>

        {replies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <MessageCircle size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No replies yet. Be the first.</p>
          </div>
        )}
      </main>
    </div>
  )
}
