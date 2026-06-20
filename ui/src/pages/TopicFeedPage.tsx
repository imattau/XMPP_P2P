import * as React from 'react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, Hash, Users, Heart, MessageCircle, Repeat2,
  Share2, Bookmark, Shield, MoreHorizontal, TrendingUp,
  Flame, Globe, Filter, ChevronDown, Search, X,
} from 'lucide-react'

import { useFeedBridge } from '../bridge'

interface TopicMeta {
  tag: string
  description: string
  postCount: string
  memberCount: string
  color: string
  following: boolean
  hot?: boolean
}

const JID_MAP: Record<string, string> = {
  'yukitan': 'yukitan@infosec.exchange',
  'maren': 'maren@social.coop',
  'kvold': 'kvold@fosstodon.org',
  'theo_n': 'theo_n@hachyderm.io',
  'ingridl': 'ingridl@sigmoid.social',
  'felixb': 'felixb@chaos.social',
  'elif_dev': 'elif_dev@mastodon.social',
  'amara_d': 'amara_d@blacktwitter.io'
}

const TOPIC_META: Record<string, TopicMeta> = {
  Privacy: { tag: 'Privacy', description: 'Digital privacy, security research, and rights', postCount: '12.4k', memberCount: '48.2k', color: '#a855f7', following: true, hot: true },
  DecentralWeb: { tag: 'DecentralWeb', description: 'Federated protocols, ActivityPub, XMPP, Matrix', postCount: '4.2k', memberCount: '19.7k', color: '#3b82f6', following: true, hot: true },
  XMPPProtocol: { tag: 'XMPPProtocol', description: 'XMPP extensions, RFCs, client development', postCount: '1.8k', memberCount: '6.3k', color: '#00d4aa', following: true },
  OpenSource: { tag: 'OpenSource', description: 'Open source software, licenses, and community', postCount: '6.7k', memberCount: '31.0k', color: '#f59e0b', following: false, hot: true },
  FediDev: { tag: 'FediDev', description: 'Developers building on federated platforms', postCount: '891', memberCount: '3.2k', color: '#ef4444', following: true },
  SelfHosted: { tag: 'SelfHosted', description: 'Running your own infrastructure and services', postCount: '3.1k', memberCount: '14.8k', color: '#06b6d4', following: false },
  WebDev: { tag: 'WebDev', description: 'Web development, browsers, and standards', postCount: '22.1k', memberCount: '87.4k', color: '#8b5cf6', following: false, hot: true },
  Infosec: { tag: 'Infosec', description: 'Information security, CVEs, and threat intel', postCount: '8.9k', memberCount: '29.1k', color: '#f97316', following: false },
}

const TOPIC_POSTS: Record<string, any[]> = {
  Privacy: [
    { id: 'p1', author: { name: 'Yuki Tanaka', handle: 'yukitan', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=48&h=48&fit=crop&auto=format', server: 'infosec.exchange' }, content: "End-to-end encryption in XMPP with OMEMO is underrated. Signal-level security, open protocol, no phone number required. Why aren't more people talking about this?", timestamp: '4h', likes: 2103, comments: 147, reposts: 489, liked: true, bookmarked: true },
    { id: 'p2', author: { name: 'Kaspar Vold', handle: 'kvold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', verified: true, server: 'fosstodon.org' }, content: "The Double Ratchet algorithm that OMEMO uses provides forward secrecy and break-in recovery. Most people don't realize this is the same algorithm Signal uses. The security model is genuinely excellent.", timestamp: '6h', likes: 891, comments: 44, reposts: 201 },
    { id: 'p3', author: { name: 'Ingrid Larsen', handle: 'ingridl', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', server: 'sigmoid.social' }, content: "Reminder: your XMPP server can technically read your messages unless you use OMEMO. Most people assume federation = privacy. It doesn't. Encryption is a separate layer and you need to enable it explicitly.", timestamp: '1d', likes: 1240, comments: 88, reposts: 312 },
    { id: 'p4', author: { name: 'Felix Bergström', handle: 'felixb', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', server: 'chaos.social' }, content: 'Running a self-hosted XMPP server with full OMEMO support. All messages encrypted in transit and at rest. No third party can read them, including me as the server admin. That\'s the whole point.', timestamp: '2d', likes: 567, comments: 29, reposts: 134, bookmarked: true, media: { url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=280&fit=crop&auto=format', alt: 'Server rack in a data center' } },
    { id: 'p5', author: { name: 'Amara Diallo', handle: 'amara_d', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=48&h=48&fit=crop&auto=format', server: 'blacktwitter.io' }, content: 'Hot take: privacy isn\'t a feature, it\'s a right. Any messaging platform that can\'t guarantee E2EE by default is asking you to trust them. Trust is not a technical guarantee.', timestamp: '3d', likes: 3421, comments: 204, reposts: 891 },
  ],
  DecentralWeb: [
    { id: 'd1', author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', verified: true, server: 'social.coop' }, content: 'The decentralized web is finally catching up to the UX expectations users have from centralized platforms. XMPP has been quietly powering this transition for years - it just never got the credit.', timestamp: '2m', likes: 284, comments: 31, reposts: 47, liked: true },
    { id: 'd2', author: { name: 'Elif Şahin', handle: 'elif_dev', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', server: 'mastodon.social' }, content: "Hot take: the problem with federated social networks isn't tech, it's onboarding. Most people don't understand why they'd choose a server. We need to abstract that entirely.", timestamp: '38m', likes: 1420, comments: 203, reposts: 311, bookmarked: true },
    { id: 'd3', author: { name: 'Felix Bergström', handle: 'felixb', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', server: 'chaos.social' }, content: 'Moved all my personal infra to self-hosted XMPP + Matrix bridge last week. Messages from Signal, WhatsApp, and iMessage all land in one inbox. The setup took 4 hours. Worth every minute.', timestamp: '3h', likes: 788, comments: 55, reposts: 162 },
    { id: 'd4', author: { name: 'Yuki Tanaka', handle: 'yukitan', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=48&h=48&fit=crop&auto=format', server: 'infosec.exchange' }, content: "ActivityPub got Mastodon. XMPP never had a flagship product. That's the real difference in adoption rates - not the protocol quality, which is exceptional in both cases.", timestamp: '5h', likes: 944, comments: 67, reposts: 218 },
  ],
  XMPPProtocol: [
    { id: 'x1', author: { name: 'Kaspar Vold', handle: 'kvold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', verified: true, server: 'fosstodon.org' }, content: 'New RFC draft for XMPP push notifications on mobile - finally addressing the battery drain issue that has plagued mobile XMPP clients for a decade. This could be the breakthrough we needed.', timestamp: '1h', likes: 97, comments: 14, reposts: 22, media: { url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=280&fit=crop&auto=format', alt: 'Circuit board' } },
    { id: 'x2', author: { name: 'Theo Nakashima', handle: 'theo_n', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', server: 'hachyderm.io' }, content: 'Just shipped a new XMPP client library for Go with full MUC support. Zero dependencies, dead simple API. Benchmarks show 2x throughput over the previous implementation at 10k concurrent connections.', timestamp: '14m', likes: 512, comments: 88, reposts: 134, liked: true },
    { id: 'x3', author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', verified: true, server: 'social.coop' }, content: 'Reading through XEP-0384 (OMEMO) again for a client implementation. The spec is dense but the security rationale is excellent. Recommend anyone doing XMPP crypto work to read it carefully.', timestamp: '8h', likes: 203, comments: 19, reposts: 56 },
    { id: 'x4', author: { name: 'Ingrid Larsen', handle: 'ingridl', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', server: 'sigmoid.social' }, content: 'XEP-0045 (MUC) vs XEP-0369 (MIX): the MIX redesign is significantly cleaner but adoption is slow. Anyone running Prosody should try the mod_mix module - the history management alone is worth it.', timestamp: '1d', likes: 341, comments: 41, reposts: 89 },
  ],
}

const FALLBACK_POSTS: any[] = [
  { id: 'f1', author: { name: 'Theo Nakashima', handle: 'theo_n', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', server: 'hachyderm.io' }, content: 'Great discussion happening in this topic. The community is really knowledgeable and helpful.', timestamp: '2h', likes: 234, comments: 18, reposts: 45 },
  { id: 'f2', author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', verified: true, server: 'social.coop' }, content: 'Following this topic has genuinely improved how I think about these issues. Highly recommend to anyone in the space.', timestamp: '5h', likes: 567, comments: 33, reposts: 98, liked: true },
  { id: 'f3', author: { name: 'Elif Şahin', handle: 'elif_dev', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', server: 'mastodon.social' }, content: 'The quality of posts in this topic is consistently high. The federated approach really does attract more thoughtful contributors.', timestamp: '1d', likes: 891, comments: 56, reposts: 201 },
]

function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function PostCard({
  post,
  color,
  tag,
  onLike,
  onRepost,
  onBookmark,
  onOpen,
}: {
  post: FeedPost
  color: string
  tag: string
  onLike: (id: string) => void
  onRepost: (id: string) => void
  onBookmark: (id: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <article onClick={() => onOpen(post.id)} className="border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer">
      <div className="flex gap-3 px-4 py-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary ring-1 ring-border">
            <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{post.author.name}</span>
            {post.author.verified && <Shield size={12} className="text-primary flex-shrink-0" />}
            <span className="font-mono text-xs text-muted-foreground">@{post.author.handle}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono text-xs text-muted-foreground">{post.timestamp}</span>
            <button onClick={(e) => e.stopPropagation()} className="ml-auto text-muted-foreground hover:text-foreground">
              <MoreHorizontal size={14} />
            </button>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed mb-2">{post.content}</p>

          {post.media && (
            <div className="mb-2.5 rounded overflow-hidden border border-border bg-secondary">
              <img src={post.media.url} alt={post.media.alt} className="w-full h-36 object-cover" />
            </div>
          )}

          <div className="flex items-center justify-between -ml-1">
            <button onClick={(e) => { e.stopPropagation(); onOpen(post.id); }} className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all">
              <MessageCircle size={14} />
              <span className="font-mono text-[11px]">{formatNum(post.comments)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRepost(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.reposted ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10'}`}
            >
              <Repeat2 size={14} />
              <span className="font-mono text-[11px]">{formatNum(post.reposts)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onLike(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}
            >
              <Heart size={14} fill={post.liked ? 'currentColor' : 'none'} />
              <span className="font-mono text-[11px]">{formatNum(post.likes)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onBookmark(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
            >
              <Bookmark size={14} fill={post.bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function TopicFeedPage() {
  const { tag } = useParams<{ tag: string }>()
  const navigate = useNavigate()
  const {
    posts: allPosts,
    subscribeFeed,
    unsubscribeFeed,
    reactPost,
    repostPost,
    bookmarkPost
  } = useFeedBridge()

  const meta = TOPIC_META[tag ?? ''] ?? {
    tag: tag ?? 'Unknown',
    description: 'Topic feed',
    postCount: '—',
    memberCount: '—',
    color: '#3b82f6',
    following: false,
  }

  const [following, setFollowing] = useState(meta.following)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Derive posts for this topic tag from the bridge. Fall back to hardcoded mock entries if empty.
  const topicPosts = allPosts.filter((p) => p.topic?.toLowerCase() === tag?.toLowerCase())
  const posts = topicPosts.length > 0 ? topicPosts : (TOPIC_POSTS[tag ?? ''] ?? FALLBACK_POSTS)

  const handleLike = (id: string) => reactPost(id)
  const handleRepost = (id: string) => repostPost(id)
  const handleBookmark = (id: string) => bookmarkPost(id)

  const handleFollowToggle = () => {
    const nextFollowing = !following
    setFollowing(nextFollowing)

    const latestPost = posts[0]
    if (latestPost) {
      const handle = latestPost.author.handle
      const peerAddr = JID_MAP[handle] ?? `${handle}@${latestPost.author.server ?? 'p2p'}`
      if (peerAddr) {
        if (nextFollowing) {
          void subscribeFeed(peerAddr)
        } else {
          void unsubscribeFeed(peerAddr)
        }
      }
    }
  }

  const filtered = searchQuery
    ? posts.filter((p) => p.content.toLowerCase().includes(searchQuery.toLowerCase()) || p.author.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : posts

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: meta.color + '1a', border: `1px solid ${meta.color}33` }}
            >
              <Hash size={12} style={{ color: meta.color }} />
            </div>
            <span className="font-semibold text-sm truncate">{meta.tag}</span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => setSearchOpen((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
              <Search size={16} />
            </button>
            <button
              onClick={handleFollowToggle}
              className={`px-3 py-1.5 rounded text-[11px] font-mono font-medium transition-all flex-shrink-0 ${
                following
                  ? 'bg-secondary text-foreground/70 hover:bg-destructive/10 hover:text-destructive'
                  : 'bg-primary text-white hover:bg-primary/90'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search in #${meta.tag}…`}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 border-b border-border" style={{ background: `linear-gradient(135deg, ${meta.color}0d 0%, transparent 100%)` }}>
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: meta.color + '1a', border: `1px solid ${meta.color}33` }}
            >
              <Hash size={20} style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-foreground">#{meta.tag}</h1>
                {meta.hot && (
                  <span className="flex items-center gap-0.5 text-[10px] font-mono text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">
                    <Flame size={9} />hot
                  </span>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{meta.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <TrendingUp size={11} />{meta.postCount} posts
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Users size={11} />{meta.memberCount} members
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Globe size={11} />Public
            </span>
          </div>
        </div>

        {!searchQuery && (
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[10px] text-muted-foreground">{filtered.length} posts</span>
            </div>
            <button className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Filter size={10} />Latest<ChevronDown size={10} />
            </button>
          </div>
        )}

        {searchQuery && (
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{filtered.length} results for "{searchQuery}"</span>
            <button onClick={() => setSearchQuery('')} className="font-mono text-xs text-primary hover:underline">Clear</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No posts found</p>
          </div>
        ) : (
          <>
            {filtered.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                color={meta.color}
                tag={meta.tag}
                onLike={handleLike}
                onRepost={handleRepost}
                onBookmark={handleBookmark}
                onOpen={(id) => navigate(`/post/${id}`)}
              />
            ))}
            <div className="py-8 flex justify-center">
              <button className="font-mono text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-4 py-2 rounded transition-all">
                Load more posts
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
