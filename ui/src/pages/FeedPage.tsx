import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  Heart, MessageCircle, Repeat2, Share2, Bookmark,
  Search, Bell, Settings, Hash, Users, Rss,
  ChevronDown, MoreHorizontal, Shield, Zap, Globe,
  Lock, Filter, X, Home, Send, Plus,
} from 'lucide-react'
import { type FeedFilterType, type FeedPost, type FeedSortOrder, useFeedBridge, getBrowserXmppBridge } from '../bridge'
import TrendingTopics from '../components/TrendingTopics'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import ArticleCard from '../components/article/ArticleCard'

const COMMUNITIES = [
  { name: 'OpenSourceDev', id: 'opensourcedev', icon: '⚙️' },
  { name: 'WeeklyDevChat', id: 'weeklydevchat', icon: '💬' },
  { name: 'FediDev', id: 'fedidev', icon: '🌐' },
  { name: 'Infra Team', id: 'infra-team', icon: '🔧' },
]

function communityId(name: string): string {
  const found = COMMUNITIES.find(c => c.name === name)
  return found?.id ?? name.toLowerCase().replace(/\s+/g, '-')
}

function formatCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function PrivacyIcon({ privacy }: { privacy?: string }) {
  if (privacy === 'followers') return <Lock size={10} className="text-muted-foreground" />
  if (privacy === 'community') return <Users size={10} className="text-muted-foreground" />
  return <Globe size={10} className="text-muted-foreground" />
}

const REACTIONS = ['❤️', '👍', '🔥', '🎉', '😂', '💯', '👏', '😎']

const SORT_OPTIONS: { id: FeedSortOrder; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'popular', label: 'Popular' },
  { id: 'trending', label: 'Trending' },
]

function SortButton({ sortBy, setSortBy }: { sortBy: FeedSortOrder; setSortBy: (s: FeedSortOrder) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        <Filter size={10} />Sort: {SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? 'Recent'}<ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-border bg-card shadow-lg z-50">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => { setSortBy(option.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[12px] font-mono transition-colors hover:bg-secondary ${option.id === sortBy ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({
  post,
  onReact,
  onRepost,
  onBookmark,
  onOpen,
}: {
  post: FeedPost
  onReact: (id: string, emoji?: string) => void
  onRepost: (id: string) => void
  onBookmark: (id: string) => void
  onOpen: (id: string) => void
}) {
  const [showReactions, setShowReactions] = useState(false)
  const reactionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false)
      }
    }
    if (showReactions) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReactions])
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
            <span className="font-mono text-[11px] text-muted-foreground">@{post.author.handle} · {post.author.server} · {post.timestamp}</span>
            <PrivacyIcon privacy={post.privacy} />
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
            </div>
          ) : null}

          <p className="text-sm text-foreground/90 leading-relaxed mb-2">{post.content}</p>

          {post.media && (
            <div className="mb-2.5 rounded overflow-hidden border border-border bg-secondary">
              <img src={post.media.url} alt={post.media.alt} className="w-full h-36 object-cover" />
            </div>
          )}
          {post.geoloc?.country && (
            <div className="flex items-center gap-1 mb-2">
              <Globe size={10} className="text-muted-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {[post.geoloc.region, post.geoloc.country].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between -ml-1">
            <button aria-label="Comments" className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all group">
              <MessageCircle size={15} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.comments)}</span>
            </button>
            <button
              aria-label={post.reposted ? 'Reposted' : 'Repost'}
              onClick={(e) => {
                e.stopPropagation()
                onRepost(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.reposted ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10'}`}
            >
              <Repeat2 size={15} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.reposts)}</span>
            </button>
            <div ref={reactionRef} className="relative">
              <button
                aria-label={post.liked ? 'Unlike' : 'Like or react'}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowReactions(!showReactions)
                }}
                className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}
              >
                <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} />
                <span className="font-mono text-[11px] tabular-nums">{formatCount(post.likes)}</span>
              </button>
              {showReactions && (
                <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 p-1.5 rounded-xl border border-border bg-background shadow-lg z-50">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReact(post.id, emoji)
                        setShowReactions(false)
                      }}
                      className="text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [quickPostText, setQuickPostText] = useState('')
  const [quickPostType, setQuickPostType] = useState<'post' | 'community'>('post')
  const [selectedCommunity, setSelectedCommunity] = useState('')
  const [showCommunityPicker, setShowCommunityPicker] = useState(false)
  const communityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (communityRef.current && !communityRef.current.contains(e.target as Node)) {
        setShowCommunityPicker(false)
      }
    }
    if (showCommunityPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCommunityPicker])

  const handleQuickPost = () => {
    if (!quickPostText.trim()) return
    const bridge = getBrowserXmppBridge()
    if (!bridge) return

    if (quickPostType === 'community' && selectedCommunity) {
      bridge.publishCollection(communityId(selectedCommunity), quickPostText.trim()).catch(() => {})
    } else {
      bridge.publishFeed(quickPostText.trim()).catch(() => {})
    }

    setQuickPostText('')
  }
  const {
    loading,
    filteredPosts,
    activeFilter,
    searchOpen,
    searchQuery,
    sortBy,
    hasMore,
    setActiveFilter,
    setSearchOpen,
    setSearchQuery,
    setSortBy,
    loadMore,
    reactPost,
    repostPost,
    bookmarkPost,
    trendingTopics,
  } = useFeedBridge()
  const { articles, toggleBookmark } = useArticleBridge()

  useEffect(() => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.onMessage) return
    const unsub = bridge.onMessage(() => {
      setUnreadNotifications((prev) => prev + 1)
    })
    return unsub
  }, [])

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <div className="text-[18px] font-semibold tracking-tight text-foreground leading-tight">Nexus</div>
            <div className="text-[11px] font-mono text-muted-foreground leading-tight">XMPP P2P</div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
              className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
            >
              <Search size={17} />
            </button>
            <button onClick={() => navigate('/chats')} aria-label="Messages" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors relative">
              <Bell size={17} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-white text-[9px] font-mono flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/settings')} aria-label="Settings" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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

        <div className="border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0">
              Y
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={quickPostText}
                onChange={(e) => setQuickPostText(e.target.value)}
                placeholder={quickPostType === 'community' && selectedCommunity ? `Post to ${selectedCommunity}…` : "What's on your mind?"}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickPostText.trim()) {
                    handleQuickPost()
                  }
                }}
              />
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setQuickPostType('post')}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                      quickPostType === 'post'
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Post
                  </button>
                  <button
                    onClick={() => setQuickPostType('community')}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                      quickPostType === 'community'
                        ? 'text-amber-400 bg-amber-400/10'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Community
                  </button>
                </div>
                {quickPostType === 'community' && (
                  <div ref={communityRef} className="relative">
                    <button
                      onClick={() => setShowCommunityPicker(!showCommunityPicker)}
                      className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selectedCommunity || 'Select community'}
                      <ChevronDown size={10} />
                    </button>
                    {showCommunityPicker && (
                      <div className="absolute top-full left-0 mt-1 w-40 rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden">
                        {COMMUNITIES.map((c) => (
                          <button
                            key={c.name}
                            onClick={() => { setSelectedCommunity(c.name); setShowCommunityPicker(false) }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-secondary ${
                              selectedCommunity === c.name ? 'text-amber-400' : 'text-foreground/80'
                            }`}
                          >
                            <span>{c.icon}</span>
                            {c.name}
                          </button>
                        ))}
                        <button
                          onClick={() => { setShowCommunityPicker(false); navigate('/communities/new') }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-secondary transition-colors border-t border-border"
                        >
                          <Plus size={12} />
                          New community
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleQuickPost}
              disabled={!quickPostText.trim() || (quickPostType === 'community' && !selectedCommunity)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send size={12} />
              Post
            </button>
          </div>
        </div>

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
            <SortButton sortBy={sortBy} setSortBy={setSortBy} />
          </div>
        )}

        {loading && filteredPosts.length === 0 ? (
          <div className="py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3 border-b border-border animate-pulse">
                <div className="w-10 h-10 rounded-full bg-secondary flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-3 bg-secondary rounded w-1/3" />
                  <div className="h-3 bg-secondary rounded w-3/4" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No posts found</p>
          </div>
        ) : (
          <>
            {filteredPosts.reduce<React.ReactNode[]>((acc, post, index) => {
              acc.push(
                <PostCard
                  key={post.id}
                  post={post}
                  onReact={(id, emoji) => reactPost(id, emoji ?? '❤️')}
                  onRepost={repostPost}
                  onBookmark={bookmarkPost}
                  onOpen={(id) => navigate(`/post/${id}`)}
                />
              )

              if (index > 0 && index % 5 === 0 && articles.length > 0) {
                const articleIndex = Math.floor(index / 5) - 1
                const article = articles.filter((a) => a.status === 'published')[articleIndex]
                if (article) {
                  acc.push(
                    <ArticleCard
                      key={`article-${article.id}`}
                      article={article}
                      variant="feed"
                      onBookmark={(id) => toggleBookmark(id)}
                      onClick={(id) => navigate(`/article/${id}`)}
                    />
                  )
                }
              }

              return acc
            }, [])}
            <div className="py-8 flex items-center justify-center">
              {hasMore ? (
                <button onClick={() => loadMore()} disabled={loading}
                  className="font-mono text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-4 py-2 rounded transition-all disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load earlier posts'}
                </button>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">No more posts</span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
      <div className="hidden lg:block">
        <TrendingTopics topics={trendingTopics} />
      </div>
    </div>
  )
}
