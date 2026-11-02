import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import {
  Heart, MessageCircle, Repeat2, Share2, Bookmark,
  Search, Bell, Settings, Hash, Users, Rss,
  ChevronDown, Shield, Zap, Globe,
  Lock, Filter, X, Home, Send, Plus,
} from 'lucide-react'
import { type FeedFilterType, type FeedPost, type FeedSortOrder, useFeedBridge, getBrowserXmppBridge } from '../bridge'
import type { BridgeCollectionNode } from '../bridge/runtime'
import TrendingTopics from '../components/TrendingTopics'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { useChatListBridge } from '../bridge/useChatListBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useRosterBridge } from '../bridge/useRosterBridge'
import ArticleCard from '../components/article/ArticleCard'
import { emitToast } from '../lib/toast-events'
import { getBootstrapAddrs } from '../bridge/runtime'
import { getAccountScopedStorageKey } from '../lib/account-storage'

const SERVER_MICROBLOGS_KEY = 'xmpp-p2p:server-microblog-subscriptions'
const SERVER_MICROBLOG_STATUSES_KEY = 'xmpp-p2p:server-microblog-statuses'
type ServerMicroblogStatus = 'subscribed' | 'pending' | 'unconfigured'

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
      entry[1] === 'subscribed' || entry[1] === 'pending' || entry[1] === 'unconfigured'
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
        onClick={() => setOpen(!open)} className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        <Filter size={10} />Sort: {SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? 'Recent'}<ChevronDown size={10} />
      </button>
      {open && (
        <div id="feed-sort-options" role="group" aria-label="Sort posts by" className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-border bg-card shadow-lg z-50">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === sortBy}
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
      <div className="flex gap-3 px-4 py-3">
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
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground leading-tight">{post.author.name}</span>
            {post.author.verified && <Shield size={12} className="text-primary flex-shrink-0" />}
            <span className="font-mono text-[11px] text-muted-foreground">@{post.author.handle} · {post.author.server} · {post.timestamp}</span>
            {isXmppMicroblog && <span className="rounded border border-primary/20 px-1 py-0.5 font-mono text-[9px] text-primary">XMPP</span>}
            <PrivacyIcon privacy={post.privacy} />
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
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-warn/10 text-warn">
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
        </NavLink>

          <div className="flex items-center justify-between -ml-1">
            <button aria-label={isXmppMicroblog ? 'Comments unavailable for XMPP microblogs' : 'Comments'} title={isXmppMicroblog ? 'Comments are not available for XMPP microblogs' : undefined} disabled={isXmppMicroblog} onClick={(event) => { event.stopPropagation(); onOpen(post.id) }} className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-interaction hover:bg-interaction/10 transition-all group disabled:cursor-not-allowed disabled:opacity-40">
              <MessageCircle size={15} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.comments)}</span>
            </button>
            <button
              aria-label={isXmppMicroblog ? 'Reposting unavailable for XMPP microblogs' : post.reposted ? 'Reposted' : 'Repost'}
              disabled={post.reposted || isXmppMicroblog}
              title={isXmppMicroblog ? 'Reposting is not available for XMPP microblogs' : undefined}
              onClick={(e) => {
                e.stopPropagation()
                onRepost(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all disabled:cursor-default ${post.reposted ? 'text-success' : 'text-muted-foreground hover:text-success hover:bg-success/10'}`}
            >
              <Repeat2 size={15} />
              <span className="font-mono text-[11px] tabular-nums">{formatCount(post.reposts)}</span>
            </button>
            <div ref={reactionRef} className="relative">
              <button
                aria-label={isXmppMicroblog ? 'Reactions unavailable for XMPP microblogs' : post.liked ? 'React to post; already liked' : 'React to post'}
                aria-expanded={showReactions}
                disabled={isXmppMicroblog}
                title={isXmppMicroblog ? 'Reactions are not available for XMPP microblogs' : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowReactions(!showReactions)
                }}
                className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all disabled:cursor-not-allowed disabled:opacity-40 ${post.liked ? 'text-liked' : 'text-muted-foreground hover:text-liked hover:bg-liked/10'}`}
              >
                <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} />
                <span className="font-mono text-[11px] tabular-nums">{formatCount(post.likes)}</span>
              </button>
              {showReactions && (
                <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 p-1.5 rounded-xl border border-border bg-background shadow-lg z-50">
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
                      className="text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              aria-label={post.bookmarked ? 'Remove bookmark' : 'Bookmark post'}
              aria-pressed={post.bookmarked}
              onClick={(e) => {
                e.stopPropagation()
                onBookmark(post.id)
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
            >
              <Bookmark size={15} fill={post.bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button aria-label="Share post" onClick={async (event) => {
              event.stopPropagation()
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
            }} className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={14} />
            </button>
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
  const { chats } = useChatListBridge()
  const { identity } = useIdentityBridge()
  const { contacts, serverConnected } = useRosterBridge()
  const unreadMessages = chats.reduce((total, chat) => total + chat.unread, 0)
  const userInitial = identity?.displayName?.trim().charAt(0).toUpperCase() || 'Y'
  const serverMicroblogBridge = getBrowserXmppBridge()
  const supportsServerMicroblogs = Boolean(serverMicroblogBridge?.subscribeServerMicroblog
    && serverMicroblogBridge.unsubscribeServerMicroblog
    && serverMicroblogBridge.refreshServerMicroblog
    && serverMicroblogBridge.publishServerMicroblog)
  const [serverMicroblogSubscriptions, setServerMicroblogSubscriptions] = useState<string[]>(readServerMicroblogSubscriptions)
  const [serverMicroblogStatuses, setServerMicroblogStatuses] = useState<Record<string, ServerMicroblogStatus>>(readServerMicroblogStatuses)
  const [showServerMicroblogs, setShowServerMicroblogs] = useState(false)
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
        emitToast(imported ? `Following ${bareJid}; loaded ${imported} recent post${imported === 1 ? '' : 's'}` : `Following ${bareJid}; no recent posts were available`, 'success')
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
      await bridge.unsubscribeServerMicroblog(bareJid)
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
      if (serverMicroblogStatuses[bareJid] !== 'subscribed') {
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
  }, [routeSearch])

  useEffect(() => {
    const collectionId = new URLSearchParams(routeSearch).get('collection')
    if (!collectionId) return
    setSelectedCommunity(collectionId)
    setQuickPostType('community')
    setShowCommunityPicker(false)
  }, [routeSearch])

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <h1 className="sr-only">Feed</h1>
            <div className="text-[18px] font-semibold tracking-tight text-foreground leading-tight">Nexus</div>
            <div className="text-[11px] font-mono text-muted-foreground leading-tight">XMPP P2P</div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
            >
              <Search size={17} />
            </button>
            <button onClick={() => navigate('/chats')} aria-label="Messages" className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Bell size={17} />
              {unreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-primary-foreground text-[9px] font-mono flex items-center justify-center">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </button>
            <button onClick={() => navigate('/settings')} aria-label="Settings" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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
                aria-label="Search posts, topics, and communities"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search posts, topics, communities…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && (
                <button type="button" onClick={() => {
                  setSearchQuery('')
                  navigate('/')
                }} aria-label="Clear feed search" className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

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
              <div className="flex items-center gap-2 mt-1">
                <div role="group" aria-label="Post destination" className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-pressed={quickPostType === 'post'}
                    onClick={() => setQuickPostType('post')}
                    className={`min-h-11 px-3 text-[10px] font-mono rounded transition-colors ${
                      quickPostType === 'post'
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Post
                  </button>
                  {serverConnected && supportsServerMicroblogs && (
                    <button
                      type="button"
                      aria-pressed={quickPostType === 'server'}
                      onClick={() => setQuickPostType('server')}
                      className={`min-h-11 px-3 text-[10px] font-mono rounded transition-colors ${
                        quickPostType === 'server'
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      XMPP
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={quickPostType === 'community'}
                    onClick={() => setQuickPostType('community')}
                    className={`min-h-11 px-3 text-[10px] font-mono rounded transition-colors ${
                      quickPostType === 'community'
                        ? 'text-warn bg-warn/10'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Community
                  </button>
                </div>
                {quickPostType === 'community' && (
                  <div ref={communityRef} className="relative">
                    <button
                      type="button"
                      aria-expanded={showCommunityPicker}
                      aria-controls={showCommunityPicker ? 'feed-community-options' : undefined}
                      onClick={() => setShowCommunityPicker(!showCommunityPicker)}
                      className="flex min-h-11 items-center gap-1 rounded bg-secondary px-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {collections.find((collection) => collection.id === selectedCommunity)?.name || 'Select community'}
                      <ChevronDown size={10} />
                    </button>
                    {showCommunityPicker && (
                      <div id="feed-community-options" role="group" aria-label="Choose a community" className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden">
                        {collections.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={selectedCommunity === c.id}
                            onClick={() => { setSelectedCommunity(c.id); setShowCommunityPicker(false) }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-secondary ${
                              selectedCommunity === c.id ? 'text-warn' : 'text-foreground/80'
                            }`}
                          >
                            <Users size={12} />
                            {c.name || c.id}
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
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-secondary transition-colors border-t border-border"
                        >
                          <Hash size={12} />
                          Join by community ID
                        </button>
                        <button
                          type="button"
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

        <section className="border-b border-border bg-card/50">
            <button
              type="button"
              aria-expanded={showServerMicroblogs}
              aria-controls="server-microblogs-panel"
              onClick={() => setShowServerMicroblogs((open) => !open)}
              className="flex min-h-11 w-full items-center gap-2 px-4 text-left hover:bg-secondary/50"
            >
              <Globe size={14} className="text-primary" />
              <span className="text-xs font-medium text-foreground">XMPP microblogs</span>
              <span className="font-mono text-[10px] text-muted-foreground">{serverMicroblogSubscriptions.length} followed</span>
              {!serverConnected && <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[9px] text-muted-foreground">Connect account</span>}
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
                            <p className="truncate font-mono text-[10px] text-muted-foreground">{jid}</p>
                            {followed && serverMicroblogStatuses[jid] === 'pending' && <p role="status" className="text-[10px] text-warn">Awaiting approval from this contact</p>}
                            {!followed && serverMicroblogStatuses[jid] === 'unconfigured' && <p role="status" className="text-[10px] text-warn">The server requires subscription options; the follow request was not accepted</p>}
                          </div>
                          {followed ? (
                            <>
                              <button type="button" disabled={!supportsServerMicroblogs || !contact || Boolean(busy) || serverMicroblogStatuses[jid] === 'unconfigured'} onClick={() => void handleServerMicroblogRefresh(jid)}
                                className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">
                                {busy === 'refresh' ? 'Loading…' : serverMicroblogStatuses[jid] === 'pending' ? 'Check posts' : 'Refresh'}
                              </button>
                              <button type="button" disabled={!supportsServerMicroblogs || !serverConnected || Boolean(busy)} onClick={() => void handleServerMicroblogUnfollow(jid)}
                                className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-destructive disabled:opacity-40">
                                {busy === 'unfollow' ? 'Removing…' : 'Unfollow'}
                              </button>
                            </>
                          ) : (
                            <button type="button" disabled={!supportsServerMicroblogs || !contact || Boolean(busy) || !serverConnected} onClick={() => void handleServerMicroblogFollow(jid)}
                              className="rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
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
        </section>

        <div role="group" aria-label="Feed filters" className="flex border-t border-border">
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
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{filteredPosts.length} results for "{searchQuery}"</span>
            <button onClick={() => setSearchQuery('')} className="font-mono text-xs text-primary hover:underline">Clear</button>
          </div>
        )}
        {!searchQuery && connected && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent animate-pulse' : nodeAvailable ? 'bg-warn' : 'bg-destructive'}`} />
              <span className="font-mono text-[10px] text-muted-foreground">
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
          <div className="flex flex-col items-center justify-center px-5 py-20 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              {searchQuery || activeFilter !== 'all'
                ? <Search size={20} className="text-muted-foreground" />
                : <Rss size={20} className="text-muted-foreground" />}
            </div>
            {loadError ? <>
              <p role="alert" className="text-sm text-destructive max-w-sm">Could not load the feed: {loadError}</p>
              <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg bg-secondary px-3 text-sm hover:bg-secondary/80">Try again</button>
            </> : searchQuery || activeFilter !== 'all' ? <>
              <p className="text-sm font-medium text-foreground">No posts match these filters</p>
              <p className="text-xs text-muted-foreground max-w-sm">Try another search or show all posts.</p>
              <button type="button" onClick={() => { setSearchQuery(''); setActiveFilter('all') }} className="min-h-11 rounded-lg bg-secondary px-3 text-sm hover:bg-secondary/80">Clear search and filters</button>
            </> : getBrowserXmppBridge() ? <>
              <p className="text-sm font-medium text-foreground">Your feed is quiet</p>
              <p className="text-xs text-muted-foreground max-w-sm">Posts from feeds you follow will appear here. Start a conversation to find people and rooms, or write the first post.</p>
              <p className="text-xs text-muted-foreground max-w-sm">Feed posts and topics sync with P2P peers. Connecting an XMPP server account alone does not load its posts.</p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button type="button" onClick={() => navigate('/chats/new')} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/80">Find people and rooms</button>
                <button type="button" onClick={() => navigate('/settings')} className="min-h-11 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Open peer settings</button>
                <button type="button" onClick={() => navigate('/compose')} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">Write a post</button>
                <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Refresh</button>
              </div>
            </> : <>
              <p className="text-sm font-medium text-foreground">The peer network is unavailable</p>
              <p className="text-xs text-muted-foreground max-w-sm">Restore the connection to load your feed. You can check the network status in Settings.</p>
              <button type="button" onClick={() => navigate('/settings')} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/80">Open Settings</button>
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
                <div role="alert" className="flex max-w-lg items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <p className="text-xs text-destructive">Could not refresh the feed. {loadError}</p>
                  <button
                    onClick={() => void refresh()}
                    className="shrink-0 rounded-md border border-current/20 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    Retry
                  </button>
                </div>
              ) : hasMore ? (
                <button onClick={loadMore}
                  className="font-mono text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-4 py-2 rounded transition-all"
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
