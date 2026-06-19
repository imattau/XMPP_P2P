import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  Heart, MessageCircle, Repeat2, Share2, Bookmark,
  Search, Bell, Settings, Hash, Users, Rss,
  ChevronDown, MoreHorizontal, Shield, Zap, Globe,
  Lock, Filter, X, Home,
} from 'lucide-react'
import { type FeedFilterType, type FeedPost, useFeedBridge } from '../bridge'

function formatCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function PrivacyIcon({ privacy }: { privacy?: string }) {
  if (privacy === 'followers') return <Lock size={10} className="text-muted-foreground" />
  if (privacy === 'community') return <Users size={10} className="text-muted-foreground" />
  return <Globe size={10} className="text-muted-foreground" />
}

function PostCard({
  post,
  onLike,
  onBookmark,
  onOpen,
}: {
  post: FeedPost
  onLike: (id: string) => void
  onBookmark: (id: string) => void
  onOpen: (id: string) => void
}) {
  const config = post.type === 'topic'
    ? { label: post.topic, color: post.topicColor || '#3b82f6' }
    : post.type === 'community'
      ? { label: post.community, color: '#f59e0b' }
      : { label: null, color: null }

  return (
    <article onClick={() => onOpen(post.id)} className="border-b border-border hover:bg-white/[0.02] transition-colors duration-150 cursor-pointer">
      {post.pinned && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
          <Zap size={11} className="text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wide">Pinned</span>
        </div>
      )}
      {post.replyTo && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
          <Repeat2 size={11} className="text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground">Replying to @{post.replyTo}</span>
        </div>
      )}
      <div className="flex gap-3 px-4 py-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary ring-1 ring-border">
            <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground leading-tight">{post.author.name}</span>
            {post.author.verified && <Shield size={12} className="text-primary flex-shrink-0" />}
            <span className="font-mono text-xs text-muted-foreground">@{post.author.handle}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <PrivacyIcon privacy={post.privacy} />
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="font-mono text-xs text-muted-foreground">{post.timestamp}</span>
            <button className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal size={14} />
            </button>
          </div>

          {config.label ? (
            <div className="flex items-center gap-1 mb-1.5">
              {post.type === 'topic' ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded"
                  style={{ color: config.color!, backgroundColor: config.color + '1a' }}
                >
                  <Hash size={9} />{config.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  {post.communityIcon} {config.label}
                </span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground/60">via {post.author.server}</span>
            </div>
          ) : (
            <div className="mb-1.5">
              <span className="font-mono text-[10px] text-muted-foreground/50">{post.author.server}</span>
            </div>
          )}

          <p className="text-sm text-foreground/90 leading-relaxed mb-2">{post.content}</p>

          {post.media && (
            <div className="mb-2.5 rounded overflow-hidden border border-border bg-secondary">
              <img src={post.media.url} alt={post.media.alt} className="w-full h-36 object-cover" />
            </div>
          )}

          <div className="flex items-center justify-between -ml-1">
            <button className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all group">
              <MessageCircle size={15} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.comments)}</span>
            </button>
            <button className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition-all">
              <Repeat2 size={15} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.reposts)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onLike(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}
            >
              <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.likes)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onBookmark(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
            >
              <Bookmark size={15} fill={post.bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

const FEED_FILTERS: { id: FeedFilterType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'all', label: 'All', icon: Rss },
  { id: 'posts', label: 'Posts', icon: Home },
  { id: 'topics', label: 'Topics', icon: Hash },
  { id: 'communities', label: 'Communities', icon: Users },
]

export default function FeedPage() {
  const navigate = useNavigate()
  const {
    filteredPosts,
    activeFilter,
    searchOpen,
    searchQuery,
    setActiveFilter,
    setSearchOpen,
    setSearchQuery,
    reactPost,
    bookmarkPost,
  } = useFeedBridge()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Nexus</span>
            <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">XMPP</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
            >
              <Search size={17} />
            </button>
            <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors relative">
              <Bell size={17} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-accent rounded-full" />
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
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search posts, topics, communities…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex border-t border-border">
          {FEED_FILTERS.map((f) => {
            const Icon = f.icon
            const active = activeFilter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors relative ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon size={15} />
                {f.label}
                {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {searchQuery && (
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{filteredPosts.length} results for "{searchQuery}"</span>
            <button onClick={() => setSearchQuery('')} className="font-mono text-xs text-primary hover:underline">Clear</button>
          </div>
        )}
        {!searchQuery && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[10px] text-muted-foreground">Live · {filteredPosts.length} posts</span>
            </div>
            <button className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Filter size={10} />Sort: Recent<ChevronDown size={10} />
            </button>
          </div>
        )}

        {filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No posts found</p>
          </div>
        ) : (
          <>
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={(id) => reactPost(id, '❤️')}
                onBookmark={bookmarkPost}
                onOpen={(id) => navigate(`/post/${id}`)}
              />
            ))}
            <div className="py-8 flex items-center justify-center">
              <button className="font-mono text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-4 py-2 rounded transition-all">
                Load earlier posts
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
