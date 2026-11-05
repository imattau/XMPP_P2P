import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import {
  Heart, MessageCircle, Repeat2, Share2, Bookmark,
  Search, Hash, Users, Rss,
  ChevronDown, MoreHorizontal, Shield, Zap, Globe,
  Lock, Filter, X, Home, Send, Plus,
} from 'lucide-react'
import { type FeedFilterType, type FeedPost, type FeedSortOrder, useFeedBridge, getBrowserXmppBridge } from '../bridge'
import type { BridgeCollectionNode } from '../bridge/runtime'
import TrendingTopics from '../components/TrendingTopics'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useRosterBridge } from '../bridge/useRosterBridge'
import ArticleCard from '../components/article/ArticleCard'
import { emitToast } from '../lib/toast-events'
import { getBootstrapAddrs } from '../bridge/runtime'
import { getAccountScopedStorageKey } from '../lib/account-storage'

const SERVER_MICROBLOGS_KEY = 'xmpp-p2p:server-microblog-subscriptions'
const SERVER_MICROBLOG_STATUSES_KEY = 'xmpp-p2p:server-microblog-statuses'
type ServerMicroblogStatus = 'subscribed' | 'pending' | 'unconfigured' | 'polling'

function serverMicroblogsStorageKey() {
  return getAccountScopedStorageKey(SERVER_MICROBLOGS_KEY)
}

function readServerMicroblogSubscriptions(): string[] {
  try {
    const raw = localStorage.getItem(serverMicroblogsStorageKey())
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((jid): jid is string => typeof jid === 'string').map((jid) => jid.split('/')[0].toLowerCase()))]
      : []
  } catch { return [] }
}

function readServerMicroblogStatuses(): Record<string, ServerMicroblogStatus> {
  try {
    const raw = localStorage.getItem(getAccountScopedStorageKey(SERVER_MICROBLOG_STATUSES_KEY))
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, ServerMicroblogStatus] =>
      entry[1] === 'subscribed' || entry[1] === 'pending' || entry[1] === 'unconfigured' || entry[1] === 'polling'
    ))
  } catch { return {} }
}

function saveServerMicroblogSubscriptions(jids: string[], statuses: Record<string, ServerMicroblogStatus>) {
  try { localStorage.setItem(serverMicroblogsStorageKey(), JSON.stringify(jids)) } catch { /* optional local preference */ }
  try { localStorage.setItem(getAccountScopedStorageKey(SERVER_MICROBLOG_STATUSES_KEY), JSON.stringify(statuses)) } catch { /* optional local preference */ }
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
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      document.addEventListener('keydown', handleKey)
    }
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="feed-sort-options"
        aria-label={`Sort posts, currently ${SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? 'Recent'}`}
        onClick={() => setOpen(!open)} className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Filter size={12} />Sort: {SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? 'Recent'}<ChevronDown size={12} />
      </button>
      {open && (
        <div id="feed-sort-options" role="group" aria-label="Sort posts by" className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-border bg-card shadow-lg z-50">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === sortBy}
              onClick={() => { setSortBy(option.id); setOpen(false) }}
              className={`min-h-11 w-full text-left px-3 py-2 text-[12px] font-mono transition-colors hover:bg-secondary ${option.id === sortBy ? 'text-primary' : 'text-muted-foreground'}`}
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
  const isXmppMicroblog = post.sourceProtocol === 'xmpp'

  return (
    <article className="border-b border-border hover:bg-white/[0.02] transition-colors duration-150">
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
      <div className="px-4 py-3">
        <div className="flex gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary ring-1 ring-border">
            <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
          </div>
        </div>
        <NavLink
          to={`/post/${encodeURIComponent(post.id)}`}
          aria-label={`Open post by ${post.author.name}`}
          className="flex-1 min-w-0"
        >
          <div className="mb-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold text-sm leading-tight text-foreground">{post.author.name}</span>
              {post.author.verified && <Shield size={12} className="flex-shrink-0 text-primary" />}
              {isXmppMicroblog && <span className="flex-shrink-0 rounded border border-primary/20 px-1 py-0.5 font-mono text-[9px] text-primary">XMPP</span>}
              <PrivacyIcon privacy={post.privacy} />
            </div>
            <div className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <span className="min-w-0 truncate">@{post.author.handle}</span>
              <span aria-hidden="true">·</span>
              <span className="hidden truncate sm:inline">{post.author.server}</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span className="flex-shrink-0">{post.timestamp}</span>
            </div>
          </div>

          {config.label ? (
            <div className="mb-1.5 flex min-w-0 items-center gap-1">
              {post.type === 'topic' ? (
                <span
                  className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
                  style={{ color: config.color!, backgroundColor: config.color + '1a' }}
                >
                  <Hash size={9} className="shrink-0" /><span className="min-w-0 truncate">{config.label}</span>
                </span>
              ) : (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-warn/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-warn">
                  <span className="shrink-0">{post.communityIcon}</span><span className="min-w-0 truncate">{config.label}</span>
                </span>
              )}
            </div>
          ) : null}

          <p className="mb-2 break-words text-sm leading-relaxed text-foreground/90">{post.content}</p>

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
        </NavLink>
        </div>

          <div className="mt-1 flex items-center justify-between ml-[52px]">
            {!isXmppMicroblog && <span className="inline-flex min-h-11 items-center gap-1 px-1.5 text-muted-foreground" title={`${formatCount(post.comments)} comments`}>
              <MessageCircle size={15} aria-hidden="true" />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.comments)}</span>
              <span className="sr-only">comments</span>
            </span>}
            {!isXmppMicroblog && <div ref={reactionRef} className="relative">
              <button
                aria-label={post.liked ? 'React to post; already liked' : 'React to post'}
                aria-expanded={showReactions}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowReactions(!showReactions)
                }}
                className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-1.5 transition-all ${post.liked ? 'text-liked' : 'text-muted-foreground hover:text-liked hover:bg-liked/10'}`}
              >
                <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} />
                <span className="hidden font-mono text-[11px] tabular-nums sm:inline">{formatCount(post.likes)}</span>
              </button>
              {showReactions && (
                <div className="absolute bottom-full left-0 z-50 mb-1 grid max-w-[188px] grid-cols-4 gap-1 rounded-xl border border-border bg-background p-1.5 shadow-lg sm:flex sm:max-w-none sm:gap-0.5">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      aria-label={`React with ${emoji}`}
                      title={`React with ${emoji}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReact(post.id, emoji)
                        setShowReactions(false)
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-lg transition-colors hover:bg-secondary"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>}
            <details className="relative">
              <summary aria-label="More post actions" onClick={(event) => event.stopPropagation()} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                <MoreHorizontal size={17} />
              </summary>
              <div className="absolute bottom-full right-0 z-20 mb-1 min-w-44 rounded-xl border border-border bg-card p-1 shadow-xl">
                {!isXmppMicroblog && <button
                  aria-label={post.reposted ? `Reposted, ${formatCount(post.reposts)} reposts` : `Repost, ${formatCount(post.reposts)} reposts`}
                  disabled={post.reposted}
                  onClick={(event) => {
                    event.stopPropagation()
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    onRepost(post.id)
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary disabled:cursor-default disabled:text-success"
                >
                  <Repeat2 size={15} />{post.reposted ? `Reposted · ${formatCount(post.reposts)}` : `Repost · ${formatCount(post.reposts)}`}
                </button>}
                <button
                  aria-pressed={post.bookmarked}
                  onClick={(event) => {
                    event.stopPropagation()
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    onBookmark(post.id)
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary"
                >
                  <Bookmark size={15} fill={post.bookmarked ? 'currentColor' : 'none'} />
                  {post.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                </button>
                <button aria-label="Share post" onClick={async (event) => {
                  event.stopPropagation()
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  const url = new URL(`/post/${encodeURIComponent(post.id)}`, window.location.origin).toString()
                  try {
                    if (navigator.share) await navigator.share({ title: `Post by ${post.author.name}`, url })
                    else {
                      await navigator.clipboard.writeText(url)
                      emitToast('Post link copied', 'success')
                    }
                  } catch (error) {
                    if (error instanceof Error && error.name === 'AbortError') return
                    emitToast('Could not share this post', 'error')
                  }
                }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                  <Share2 size={15} /> Share
                </button>
              </div>
            </details>
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
  const { search: routeSearch } = useLocation()
  const { connected, nodeAvailable } = useConnectionBridge()
  const [bootstrapPeersConfigured, setBootstrapPeersConfigured] = useState<boolean | null>(null)
  const { identity } = useIdentityBridge()
  const { contacts, serverConnected } = useRosterBridge()
  const userInitial = identity?.displayName?.trim().charAt(0).toUpperCase() || 'Y'
  const serverMicroblogBridge = getBrowserXmppBridge()
  const supportsServerMicroblogs = Boolean(serverMicroblogBridge?.subscribeServerMicroblog
    && serverMicroblogBridge.unsubscribeServerMicroblog
    && serverMicroblogBridge.refreshServerMicroblog
    && serverMicroblogBridge.publishServerMicroblog)
  const [serverMicroblogSubscriptions, setServerMicroblogSubscriptions] = useState<string[]>(readServerMicroblogSubscriptions)
  const [serverMicroblogStatuses, setServerMicroblogStatuses] = useState<Record<string, ServerMicroblogStatus>>(readServerMicroblogStatuses)
  const [showServerMicroblogs, setShowServerMicroblogs] = useState(false)
  const [showQuickComposer, setShowQuickComposer] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches === true)
  const [serverMicroblogBusy, setServerMicroblogBusy] = useState<Record<string, 'follow' | 'unfollow' | 'refresh'>>({})
  const refreshedServerMicroblogs = useRef(new Set<string>())
  const [quickPostText, setQuickPostText] = useState('')
  const [quickPosting, setQuickPosting] = useState(false)
  const [quickPostType, setQuickPostType] = useState<'post' | 'community' | 'server'>('post')
  const [selectedCommunity, setSelectedCommunity] = useState('')
  const [collections, setCollections] = useState<BridgeCollectionNode[]>([])
  const [showCommunityPicker, setShowCommunityPicker] = useState(false)
  const communityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const desktopLayout = window.matchMedia('(min-width: 768px)')
    const syncComposerToLayout = (event: MediaQueryListEvent) => setShowQuickComposer(event.matches)
    desktopLayout.addEventListener('change', syncComposerToLayout)
    return () => desktopLayout.removeEventListener('change', syncComposerToLayout)
  }, [])

  useEffect(() => {
    if (quickPostType === 'server' && (!serverConnected || !supportsServerMicroblogs)) {
      setQuickPostType('post')
    }
  }, [quickPostType, serverConnected, supportsServerMicroblogs])

  useEffect(() => {
    setServerMicroblogSubscriptions(readServerMicroblogSubscriptions())
    setServerMicroblogStatuses(readServerMicroblogStatuses())
  }, [identity?.jid])

  useEffect(() => {
    if (!serverConnected) {
      refreshedServerMicroblogs.current.clear()
      return
    }
    const refresh = serverMicroblogBridge?.refreshServerMicroblog
    if (!identity?.jid || !refresh) return

    for (const jid of serverMicroblogSubscriptions) {
      if (serverMicroblogStatuses[jid] === 'pending' || serverMicroblogStatuses[jid] === 'unconfigured') continue
      const key = `${identity.jid.toLowerCase()}::${jid}`
      if (refreshedServerMicroblogs.current.has(key)) continue
      refreshedServerMicroblogs.current.add(key)
      void refresh(jid).catch((error) => {
        console.warn(`[XMPP] Could not refresh followed microblog ${jid}:`, error)
      })
    }
  }, [identity?.jid, serverConnected, serverMicroblogBridge, serverMicroblogStatuses, serverMicroblogSubscriptions])

  useEffect(() => {
    if (!serverConnected || !serverMicroblogBridge?.refreshServerMicroblog) return
    const pollingJids = serverMicroblogSubscriptions.filter((jid) => serverMicroblogStatuses[jid] === 'polling')
    if (pollingJids.length === 0) return
    const refreshPollingFeeds = () => {
      for (const jid of pollingJids) {
        void serverMicroblogBridge.refreshServerMicroblog!(jid).catch((error) => {
          console.warn(`[XMPP] Could not refresh followed microblog ${jid}:`, error)
        })
      }
    }
    const interval = window.setInterval(refreshPollingFeeds, 60_000)
    return () => window.clearInterval(interval)
  }, [serverConnected, serverMicroblogBridge, serverMicroblogStatuses, serverMicroblogSubscriptions])

  const serverMicroblogContacts = contacts.filter((contact) => {
    const jid = contact.jid.split('/')[0].toLowerCase()
    return jid.includes('@') && !jid.endsWith('@p2p')
  })

  const handleServerMicroblogFollow = async (jid: string) => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.subscribeServerMicroblog || !bridge.refreshServerMicroblog) {
      emitToast('XMPP microblog subscriptions are unavailable in this runtime', 'error')
      return
    }
    const bareJid = jid.split('/')[0].toLowerCase()
    setServerMicroblogBusy((current) => ({ ...current, [bareJid]: 'follow' }))
    try {
      const subscriptionStatus = await bridge.subscribeServerMicroblog(bareJid)
      if (subscriptionStatus === 'unconfigured') {
        const next = serverMicroblogSubscriptions.filter((item) => item !== bareJid)
        const nextStatuses = { ...serverMicroblogStatuses, [bareJid]: subscriptionStatus }
        setServerMicroblogSubscriptions(next)
        setServerMicroblogStatuses(nextStatuses)
        saveServerMicroblogSubscriptions(next, nextStatuses)
        emitToast(`The XMPP server requires subscription options for ${bareJid}; it was not followed.`, 'error')
        return
      }
      const next = [...new Set([...serverMicroblogSubscriptions, bareJid])]
      const nextStatuses = { ...serverMicroblogStatuses, [bareJid]: subscriptionStatus }
      setServerMicroblogSubscriptions(next)
      setServerMicroblogStatuses(nextStatuses)
      saveServerMicroblogSubscriptions(next, nextStatuses)
      if (subscriptionStatus === 'pending') {
        emitToast(`Subscription request sent to ${bareJid}; waiting for approval`, 'success')
        return
      }
      try {
        if (identity?.jid) refreshedServerMicroblogs.current.add(`${identity.jid.toLowerCase()}::${bareJid}`)
        const imported = await bridge.refreshServerMicroblog(bareJid)
        if (subscriptionStatus === 'polling') {
          emitToast(imported
            ? `Following ${bareJid} with periodic refresh; loaded ${imported} recent post${imported === 1 ? '' : 's'}`
            : `Following ${bareJid} with periodic refresh; no recent posts were available`, 'success')
        } else {
          emitToast(imported ? `Following ${bareJid}; loaded ${imported} recent post${imported === 1 ? '' : 's'}` : `Following ${bareJid}; no recent posts were available`, 'success')
        }
      } catch (error) {
        emitToast(`Following ${bareJid}, but recent posts could not be loaded: ${error instanceof Error ? error.message : 'request failed'}`, 'error')
      }
    } catch (error) {
      emitToast(error instanceof Error ? error.message : `Could not follow ${bareJid}`, 'error')
    } finally {
      setServerMicroblogBusy((current) => { const next = { ...current }; delete next[bareJid]; return next })
    }
  }

  const handleServerMicroblogUnfollow = async (jid: string) => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.unsubscribeServerMicroblog) return
    const bareJid = jid.split('/')[0].toLowerCase()
    setServerMicroblogBusy((current) => ({ ...current, [bareJid]: 'unfollow' }))
    try {
      if (serverMicroblogStatuses[bareJid] !== 'polling') {
        await bridge.unsubscribeServerMicroblog(bareJid)
      }
      const next = serverMicroblogSubscriptions.filter((item) => item !== bareJid)
      const nextStatuses = { ...serverMicroblogStatuses }
      delete nextStatuses[bareJid]
      setServerMicroblogSubscriptions(next)
      setServerMicroblogStatuses(nextStatuses)
      saveServerMicroblogSubscriptions(next, nextStatuses)
      emitToast(`Unfollowed ${bareJid}`, 'success')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : `Could not unfollow ${bareJid}`, 'error')
    } finally {
      setServerMicroblogBusy((current) => { const next = { ...current }; delete next[bareJid]; return next })
    }
  }

  const handleServerMicroblogRefresh = async (jid: string) => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.refreshServerMicroblog) return
    const bareJid = jid.split('/')[0].toLowerCase()
    setServerMicroblogBusy((current) => ({ ...current, [bareJid]: 'refresh' }))
    try {
      if (identity?.jid) refreshedServerMicroblogs.current.add(`${identity.jid.toLowerCase()}::${bareJid}`)
      const imported = await bridge.refreshServerMicroblog(bareJid)
      if (serverMicroblogStatuses[bareJid] !== 'subscribed' && serverMicroblogStatuses[bareJid] !== 'polling') {
        const nextStatuses = { ...serverMicroblogStatuses, [bareJid]: 'subscribed' as const }
        setServerMicroblogStatuses(nextStatuses)
        saveServerMicroblogSubscriptions(serverMicroblogSubscriptions, nextStatuses)
      }
      emitToast(imported ? `Loaded ${imported} new post${imported === 1 ? '' : 's'} from ${bareJid}` : `No new posts from ${bareJid}`, 'success')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : `Could not refresh ${bareJid}`, 'error')
    } finally {
      setServerMicroblogBusy((current) => { const next = { ...current }; delete next[bareJid]; return next })
    }
  }

  const serverMicroblogContactsByJid = new Map(serverMicroblogContacts.map((contact) => [contact.jid.split('/')[0].toLowerCase(), contact]))
  const serverMicroblogRows = [...new Set([
    ...serverMicroblogContacts.map((contact) => contact.jid.split('/')[0].toLowerCase()),
    ...serverMicroblogSubscriptions,
  ])].map((jid) => ({ jid, contact: serverMicroblogContactsByJid.get(jid) }))

  useEffect(() => {
    let active = true
    const refreshBootstrapStatus = () => {
      void getBootstrapAddrs().then((addresses) => {
        if (active) setBootstrapPeersConfigured(addresses.length > 0)
      })
    }
    refreshBootstrapStatus()
    window.addEventListener('xmpp-p2p:bootstrap-config-changed', refreshBootstrapStatus)
    return () => {
      active = false
      window.removeEventListener('xmpp-p2p:bootstrap-config-changed', refreshBootstrapStatus)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadCollections = () => {
      const bridge = getBrowserXmppBridge()
      if (!bridge) {
        setCollections([])
        return
      }
      void bridge.getCollections().then((next) => {
        if (active) setCollections(next)
      }).catch(() => {
        if (active) setCollections([])
      })
    }
    loadCollections()
    window.addEventListener('xmpp-p2p:bridge-ready', loadCollections)
    return () => {
      active = false
      window.removeEventListener('xmpp-p2p:bridge-ready', loadCollections)
    }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (communityRef.current && !communityRef.current.contains(e.target as Node)) {
        setShowCommunityPicker(false)
      }
    }
    if (showCommunityPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCommunityPicker])

  const handleQuickPost = async () => {
    const body = quickPostText.trim()
    if (!body || quickPosting) return
    if (quickPostType === 'community' && !selectedCommunity) {
      setShowCommunityPicker(true)
      emitToast('Choose a community before publishing this post', 'error')
      return
    }
    if (quickPostType === 'server' && (!serverConnected || !serverMicroblogBridge?.publishServerMicroblog)) {
      emitToast('Connect an XMPP account before publishing to its microblog', 'error')
      return
    }
    const bridge = getBrowserXmppBridge()
    if (!bridge) {
      emitToast('Peer network is unavailable. Your post is still here; try again when it reconnects.', 'error')
      return
    }

    setQuickPosting(true)
    try {
      if (quickPostType === 'community' && selectedCommunity) {
        await bridge.publishCollection(selectedCommunity, body)
      } else if (quickPostType === 'server') {
        await bridge.publishServerMicroblog!(body)
      } else {
        await bridge.publishFeed(body)
      }
      setQuickPostText('')
      emitToast(quickPostType === 'server' ? 'Published to your XMPP microblog' : 'Post published', 'success')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not publish your post. Your text is still here.', 'error')
    } finally {
      setQuickPosting(false)
    }
  }
  const {
    loading,
    loadError,
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
    refresh,
    reactPost,
    repostPost,
    bookmarkPost,
    trendingTopics,
  } = useFeedBridge()
  const { articles, toggleBookmark } = useArticleBridge()

  useEffect(() => {
    const query = new URLSearchParams(routeSearch).get('q')
    if (!query) return
    setSearchQuery(query)
    setSearchOpen(true)
    setShowQuickComposer(false)
  }, [routeSearch])

  useEffect(() => {
    const collectionId = new URLSearchParams(routeSearch).get('collection')
    if (!collectionId) return
    setSelectedCommunity(collectionId)
    setQuickPostType('community')
    setShowCommunityPicker(false)
  }, [routeSearch])

  const clearFeedSearch = () => {
    setSearchQuery('')
    const params = new URLSearchParams(routeSearch)
    if (!params.has('q')) return
    params.delete('q')
    const nextSearch = params.toString()
    navigate(nextSearch ? `/?${nextSearch}` : '/', { replace: true })
  }

  const toggleFeedSearch = () => {
    const nextOpen = !searchOpen
    setSearchOpen(nextOpen)
    if (nextOpen) setShowQuickComposer(false)
    if (!nextOpen) clearFeedSearch()
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <h1 className="sr-only">Feed</h1>
            <div className="text-[18px] font-semibold tracking-tight text-foreground leading-tight">Feed</div>
          </div>
          <div className="flex items-center gap-0.5">
            {!searchOpen && <button
              type="button"
              onClick={() => setShowQuickComposer((open) => !open)}
              aria-label={showQuickComposer ? 'Close post composer' : 'Write a post'}
              aria-expanded={showQuickComposer}
              className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors md:hidden ${showQuickComposer ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              {showQuickComposer ? <X size={17} /> : <><Plus size={17} /><span>Post</span></>}
            </button>}
            {!searchOpen && <button
              onClick={toggleFeedSearch}
              aria-label="Open search"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Search size={17} />
            </button>}
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                aria-label="Search posts, topics, and communities"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search posts, topics, communities…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button type="button" onClick={() => {
                if (searchQuery) clearFeedSearch()
                else toggleFeedSearch()
              }} aria-label={searchQuery ? 'Clear feed search' : 'Close feed search'} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {showQuickComposer && (
          <div className="border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <input
                aria-label={quickPostType === 'server' ? 'Post to XMPP microblog' : quickPostType === 'community' && selectedCommunity ? `Post to ${selectedCommunity}` : 'Write a post'}
                value={quickPostText}
                onChange={(e) => setQuickPostText(e.target.value)}
                placeholder={quickPostType === 'server' ? 'Post to your XMPP microblog…' : quickPostType === 'community' && selectedCommunity ? `Post to ${selectedCommunity}…` : "What's on your mind?"}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickPostText.trim()) {
                    handleQuickPost()
                  }
                }}
              />
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <label className="relative">
                  <span className="sr-only">Post destination</span>
                  <select
                    aria-label="Post destination"
                    value={quickPostType}
                    onChange={(event) => setQuickPostType(event.target.value as 'post' | 'community' | 'server')}
                    className="min-h-11 w-[116px] appearance-none rounded-lg bg-secondary pl-3 pr-8 text-[11px] font-mono text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="post">Feed</option>
                    <option value="community">Community</option>
                    {serverConnected && supportsServerMicroblogs && <option value="server">XMPP microblog</option>}
                  </select>
                  <ChevronDown size={13} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </label>
                {quickPostType === 'community' && (
                  <div ref={communityRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={showCommunityPicker}
                      aria-controls={showCommunityPicker ? 'feed-community-options' : undefined}
                      onClick={() => setShowCommunityPicker(!showCommunityPicker)}
                      className="flex min-h-11 max-w-[45vw] items-center gap-1 rounded bg-secondary px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="truncate">{collections.find((collection) => collection.id === selectedCommunity)?.name || 'Select community'}</span>
                      <ChevronDown size={10} />
                    </button>
                    {showCommunityPicker && (
                      <div id="feed-community-options" role="group" aria-label="Choose a community" className="absolute top-full left-0 z-10 mt-1 max-h-[min(60vh,24rem)] w-56 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                        {collections.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={selectedCommunity === c.id}
                            onClick={() => { setSelectedCommunity(c.id); setShowCommunityPicker(false) }}
                            className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary ${
                              selectedCommunity === c.id ? 'text-warn' : 'text-foreground/80'
                            }`}
                          >
                            <Users size={12} className="shrink-0" />
                            <span className="min-w-0 truncate">{c.name || c.id}</span>
                          </button>
                        ))}
                        {collections.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">No communities available yet</p>}
                        {selectedCommunity && (
                          <button
                            type="button"
                            onClick={() => {
                              const inviteUrl = new URL(`/communities/join?id=${encodeURIComponent(selectedCommunity)}`, window.location.origin).toString()
                              void navigator.clipboard.writeText(inviteUrl).then(() => {
                                setShowCommunityPicker(false)
                                emitToast('Community invite link copied', 'success')
                              }).catch(() => emitToast('Could not copy the invite link. Check clipboard access and try again.', 'error'))
                            }}
                            className="w-full flex min-h-11 items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-secondary transition-colors border-t border-border"
                          >
                            Copy invite link
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowCommunityPicker(false); navigate('/communities/join') }}
                          className="min-h-11 w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-secondary transition-colors border-t border-border"
                        >
                          <Hash size={12} />
                          Join by community ID
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowCommunityPicker(false); navigate('/communities/new') }}
                          className="min-h-11 w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-secondary transition-colors border-t border-border"
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
              type="button"
              onClick={handleQuickPost}
              disabled={!quickPostText.trim() || quickPosting || (quickPostType === 'community' && !selectedCommunity) || (quickPostType === 'server' && !serverConnected)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send size={12} />
              {quickPosting ? 'Posting…' : 'Post'}
            </button>
          </div>
          </div>
        )}

        {(serverConnected || serverMicroblogSubscriptions.length > 0) && <section className="border-b border-border bg-card/50">
            <button
              type="button"
              aria-expanded={showServerMicroblogs}
              aria-controls="server-microblogs-panel"
              onClick={() => setShowServerMicroblogs((open) => !open)}
              className="flex min-h-11 w-full items-center gap-2 px-4 text-left hover:bg-secondary/50"
            >
              <Globe size={14} className="text-primary" />
              <span className="text-xs font-medium text-foreground">XMPP microblogs</span>
              <ChevronDown size={13} className={`ml-auto text-muted-foreground transition-transform ${showServerMicroblogs ? 'rotate-180' : ''}`} />
            </button>
            {showServerMicroblogs && (
              <div id="server-microblogs-panel" className="space-y-2 border-t border-border px-4 py-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Follow a server contact to load its 20 latest XMPP microblog posts and receive updates. Availability depends on the contact's server. Posts stay in your local feed and are not re-published to P2P.
                </p>
                {!serverConnected ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p role="status" className="text-xs text-muted-foreground">Connect an XMPP account to follow contacts’ server microblogs. These posts are separate from the P2P feed.</p>
                    <button type="button" onClick={() => navigate('/settings')} className="min-h-11 rounded-md bg-secondary px-3 text-[11px] font-medium text-foreground hover:bg-secondary/80">Connect XMPP account</button>
                  </div>
                ) : !supportsServerMicroblogs ? (
                  <p role="status" className="text-xs text-muted-foreground">XMPP microblog subscriptions are unavailable in this client.</p>
                ) : serverMicroblogRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No XMPP server contacts yet. Add a contact in Contacts to browse its microblog.</p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {serverMicroblogRows.map(({ jid, contact }) => {
                      const busy = serverMicroblogBusy[jid]
                      const followed = serverMicroblogSubscriptions.includes(jid)
                      return (
                        <div key={jid} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">{contact?.name || contact?.nickname || jid}</p>
                            <p className="hidden truncate font-mono text-[10px] text-muted-foreground sm:block">{jid}</p>
                            {followed && serverMicroblogStatuses[jid] === 'pending' && <p role="status" className="text-[10px] text-warn">Awaiting approval from this contact</p>}
                            {followed && serverMicroblogStatuses[jid] === 'polling' && <p role="status" className="text-[10px] text-muted-foreground">Push subscriptions unavailable; refreshing every minute while Feed is open</p>}
                            {!followed && serverMicroblogStatuses[jid] === 'unconfigured' && <p role="status" className="text-[10px] text-warn">The server requires subscription options; the follow request was not accepted</p>}
                          </div>
                          {followed ? (
                            <>
                              <button type="button" aria-label={`Refresh ${contact?.name || contact?.nickname || jid}`} disabled={!supportsServerMicroblogs || !contact || Boolean(busy) || serverMicroblogStatuses[jid] === 'unconfigured'} onClick={() => void handleServerMicroblogRefresh(jid)}
                                className="min-h-11 shrink-0 whitespace-nowrap rounded-md border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">
                                {busy === 'refresh' ? 'Loading…' : serverMicroblogStatuses[jid] === 'pending' ? 'Check posts' : 'Refresh'}
                              </button>
                              <details className="relative flex-shrink-0">
                                <summary aria-label={`More actions for ${jid}`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                                  <MoreHorizontal size={17} />
                                </summary>
                                <div className="absolute right-0 top-full z-20 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl">
                                  <button type="button" disabled={!supportsServerMicroblogs || !serverConnected || Boolean(busy)} onClick={() => void handleServerMicroblogUnfollow(jid)}
                                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40">
                                    {busy === 'unfollow' ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />}
                                    {busy === 'unfollow' ? 'Removing…' : 'Unfollow'}
                                  </button>
                                </div>
                              </details>
                            </>
                          ) : (
                            <button type="button" aria-label={`Follow ${contact?.name || contact?.nickname || jid}`} disabled={!supportsServerMicroblogs || !contact || Boolean(busy) || !serverConnected} onClick={() => void handleServerMicroblogFollow(jid)}
                              className="min-h-11 shrink-0 whitespace-nowrap rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                              {busy === 'follow' ? 'Following…' : serverMicroblogStatuses[jid] === 'unconfigured' ? 'Try again' : 'Follow'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
        </section>}

        <div className="border-t border-border px-4 py-1.5 md:hidden">
          <details className="relative">
            <summary className="flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground">
              {(() => {
                const ActiveIcon = FEED_FILTERS.find((filter) => filter.id === activeFilter)?.icon ?? Rss
                return <ActiveIcon size={15} className="text-primary" />
              })()}
              <span className="flex-1">{FEED_FILTERS.find((filter) => filter.id === activeFilter)?.label ?? 'All'}</span>
              <ChevronDown size={15} className="text-muted-foreground" />
            </summary>
            <div role="group" aria-label="Feed filters" className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-border bg-card p-1.5 shadow-xl">
              {FEED_FILTERS.map((filter) => {
                const Icon = filter.icon
                const active = activeFilter === filter.id
                return (
                  <button key={filter.id} type="button" aria-pressed={active}
                    onClick={(event) => { setActiveFilter(filter.id); event.currentTarget.closest('details')?.removeAttribute('open') }}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${active ? 'bg-blue2 font-semibold text-primary' : 'text-foreground hover:bg-secondary'}`}>
                    <Icon size={15} />
                    <span className="flex-1">{filter.label}</span>
                  </button>
                )
              })}
            </div>
          </details>
        </div>

        <div role="group" aria-label="Feed filters" className="hidden border-t border-border md:flex">
          {FEED_FILTERS.map((f) => {
            const Icon = f.icon
            const active = activeFilter === f.id
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
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
          <div className="border-b border-border px-4 py-2">
            <span className="block truncate font-mono text-xs text-muted-foreground">{filteredPosts.length} results for "{searchQuery}"</span>
          </div>
        )}
        {!searchQuery && connected && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent animate-pulse' : nodeAvailable ? 'bg-warn' : 'bg-destructive'}`} />
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                {connected
                  ? `Live · ${filteredPosts.length} posts`
                  : !nodeAvailable
                    ? 'Network unavailable'
                    : bootstrapPeersConfigured === false
                      ? 'Discovery unavailable'
                      : 'Searching for peers'}
              </span>
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
          <div className="flex flex-col items-center justify-center px-5 py-12 gap-3 text-center sm:py-20">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              {searchQuery || activeFilter !== 'all'
                ? <Search size={20} className="text-muted-foreground" />
                : <Rss size={20} className="text-muted-foreground" />}
            </div>
            {loadError ? <>
              <p role="alert" className="text-sm text-destructive max-w-sm">Could not load the feed: {loadError}</p>
              <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg bg-secondary px-3 text-sm hover:bg-secondary/80">Try again</button>
            </> : searchQuery || activeFilter !== 'all' ? <>
              <p className="text-sm font-medium text-foreground">{activeFilter === 'all' ? 'No posts match your search' : 'No posts match these filters'}</p>
              <p className="text-xs text-muted-foreground max-w-sm">{activeFilter === 'all' ? 'Clear the search to return to your feed.' : 'Try another search or show all posts.'}</p>
              {activeFilter !== 'all' && <button type="button" onClick={() => { clearFeedSearch(); setActiveFilter('all') }} className="min-h-11 rounded-lg bg-secondary px-3 text-sm hover:bg-secondary/80">Clear search and filters</button>}
            </> : getBrowserXmppBridge() ? <>
              <p className="text-sm font-medium text-foreground">Your feed is quiet</p>
              <p className="text-xs text-muted-foreground max-w-sm">Posts from feeds you follow will appear here. Find people and rooms to get started.</p>
              <div className="pt-1">
                <button type="button" onClick={() => navigate('/chats/new')} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">Find people and rooms</button>
              </div>
            </> : <>
              <p className="text-sm font-medium text-foreground">The peer network is unavailable</p>
              <p className="text-xs text-muted-foreground max-w-sm">Restore the connection to load your feed. You can check the network status in Settings.</p>
            </>}
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
                  onOpen={(id) => navigate(`/post/${encodeURIComponent(id)}`)}
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
                      onClick={(id) => navigate(`/article/${encodeURIComponent(id)}`)}
                    />
                  )
                }
              }

              return acc
            }, [])}
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              {loadError && filteredPosts.length > 0 ? (
                <div role="alert" className="flex max-w-lg items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <p className="min-w-0 flex-1 break-words text-xs text-destructive">Could not refresh the feed. {loadError}</p>
                  <button
                    onClick={() => void refresh()}
                    className="min-h-11 shrink-0 rounded-md border border-current/20 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    Retry
                  </button>
                </div>
              ) : hasMore ? (
                <button onClick={loadMore}
                  className="min-h-11 font-mono text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-4 rounded transition-all"
                >
                  Show more posts
                </button>
              ) : null}
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
