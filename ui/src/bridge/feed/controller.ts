import type { XmppRuntimeBridge, BridgeVisibility, BridgeAttachmentRecord } from '../runtime'
import type { FeedFilterType, FeedPost, FeedSortOrder, FeedViewState, TrendingTopic } from './types'
import {
  filterFeedPosts,
  mapRuntimePost,
  toggleBookmark
} from './transform'
import { emitToast } from '../../lib/toast-events'
import { getActiveAccountStorageId, getAccountScopedStorageKey } from '../../lib/account-storage'

type Listener = (state: FeedViewState) => void
const BOOKMARKS_KEY = 'xmpp-p2p:feed-bookmarks'
const FOLLOWED_TOPICS_KEY = 'nexus_followed_topics'
const bookmarksStorageKey = () => getAccountScopedStorageKey(BOOKMARKS_KEY)
const followedTopicsStorageKey = () => getAccountScopedStorageKey(FOLLOWED_TOPICS_KEY)

function readBookmarkedIds(): string[] {
  try {
    const raw = localStorage.getItem(bookmarksStorageKey())
    return raw ? JSON.parse(raw) as string[] : []
  } catch { return [] }
}

function readFollowedTopics(): string[] {
  try {
    const raw = localStorage.getItem(followedTopicsStorageKey())
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((topic): topic is string => typeof topic === 'string') : []
  } catch { return [] }
}

export class FeedBridgeController {
  private state: FeedViewState
  private listeners = new Set<Listener>()
  private runtime?: XmppRuntimeBridge
  private refreshRevision = 0
  private removeFeedListener?: () => void
  private removeCollectionListener?: () => void
  private removeAttachmentListener?: () => void
  private bookmarkedIds = readBookmarkedIds()
  private attachmentRecords: BridgeAttachmentRecord[] = []
  private visiblePostCount = 20
  private accountId = getActiveAccountStorageId()

  constructor(runtime?: XmppRuntimeBridge) {
    this.runtime = runtime
    this.state = {
      posts: [],
      trendingTopics: [],
      activeFilter: 'all',
      searchOpen: false,
      searchQuery: '',
      loading: false,
      sortBy: 'recent',
      hasMore: false,
    }

    if (runtime) this.attachRuntime(runtime)
  }

  private attachRuntime(runtime: XmppRuntimeBridge) {
    this.runtime = runtime
    this.removeFeedListener = runtime.onFeedPost?.((post) => {
      if (this.runtime === runtime) this.upsertPost(mapRuntimePost(post))
    })
    this.removeCollectionListener = runtime.onCollectionPost?.((post) => {
      if (this.runtime === runtime) this.upsertPost(mapRuntimePost(post))
    })
    this.removeAttachmentListener = runtime.onAttachmentSummary?.((summary) => {
      if (this.runtime !== runtime) return
      void this.refreshAttachmentMetrics(summary.topic, summary.targetId)
    })
    void this.refresh()
  }

  setRuntime(runtime?: XmppRuntimeBridge) {
    const nextAccountId = getActiveAccountStorageId()
    const accountChanged = nextAccountId !== this.accountId
    if (runtime === this.runtime && !accountChanged) return
    this.refreshRevision += 1
    this.removeFeedListener?.()
    this.removeCollectionListener?.()
    this.removeAttachmentListener?.()
    this.removeFeedListener = undefined
    this.removeCollectionListener = undefined
    this.removeAttachmentListener = undefined
    this.attachmentRecords = []
    this.runtime = undefined
    if (accountChanged) {
      this.accountId = nextAccountId
      this.bookmarkedIds = readBookmarkedIds()
    }
    this.state = {
      ...this.state,
      posts: [],
      trendingTopics: [],
      loading: false,
      loadError: undefined,
    }
    if (!runtime) {
      this.emit()
      return
    }
    this.visiblePostCount = 20
    this.attachRuntime(runtime)
  }

  private upsertPost(post: FeedPost) {
    post.bookmarked = this.bookmarkedIds.includes(post.id)
    const posts = [post, ...this.state.posts.filter((existing) => existing.id !== post.id)]
    const enriched = posts.map((entry) => this.enrichPost(entry, posts))
    this.state = { ...this.state, posts: enriched }
    this.emit()
  }

  private enrichPost(post: FeedPost, allPosts: FeedPost[] = this.state.posts): FeedPost {
    const reactions = this.attachmentRecords.filter((attachment) =>
      attachment.topic === post.sourceTopic && attachment.targetId === post.id && attachment.kind === 'reaction'
    )
    const localJid = this.runtime?.getLocalJid?.()
    const repostedAuthors = new Set(allPosts
      .filter((entry) => entry.repostOf?.topic === post.sourceTopic && entry.repostOf?.id === post.id)
      .map((entry) => `${entry.author.handle}@${entry.author.server || 'p2p'}`))
    return {
      ...post,
      likes: reactions.filter((attachment) => attachment.value === '❤️').length,
      liked: reactions.some((attachment) => attachment.from === localJid && attachment.value === '❤️'),
      comments: allPosts.filter((entry) => entry.replyTo === post.id).length,
      reposts: repostedAuthors.size,
      reposted: Boolean(localJid && repostedAuthors.has(localJid)),
    }
  }

  private async refreshAttachmentMetrics(topic: string, targetId: string) {
    const runtime = this.runtime
    if (!runtime?.getAttachments) return
    try {
      const latest = await runtime.getAttachments(topic, targetId)
      if (runtime !== this.runtime) return
      this.attachmentRecords = [
        ...this.attachmentRecords.filter((attachment) => attachment.topic !== topic || attachment.targetId !== targetId),
        ...latest,
      ]
      this.state = { ...this.state, posts: this.state.posts.map((post) => this.enrichPost(post)) }
      this.emit()
    } catch {
      // Keep the last known counts if attachment refresh temporarily fails.
    }
  }

  getState() {
    return this.state
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  setActiveFilter(activeFilter: FeedFilterType) {
    this.state = { ...this.state, activeFilter }
    this.emit()
  }

  setSearchOpen(searchOpen: boolean) {
    this.state = { ...this.state, searchOpen }
    this.emit()
  }

  setSearchQuery(searchQuery: string) {
    this.state = { ...this.state, searchQuery }
    this.emit()
  }

  setSortBy(sortBy: FeedSortOrder) {
    this.state = { ...this.state, sortBy }
    this.emit()
  }

  async refresh() {
    const requestRevision = ++this.refreshRevision
    const runtime = this.runtime
    this.state = { ...this.state, loading: true, loadError: undefined }
    this.emit()
    try {
      if (!runtime) {
        if (requestRevision !== this.refreshRevision) return
        this.state = { ...this.state, loading: false }
        this.emit()
        return
      }
      const [feedPosts, collectionPosts, attachments] = await Promise.all([
        runtime.getFeedPosts(),
        runtime.getCollectionPosts().catch(() => []),
        runtime.getAttachments?.().catch(() => []) ?? Promise.resolve([]),
      ])
      if (requestRevision !== this.refreshRevision || runtime !== this.runtime) return
      this.attachmentRecords = attachments
      const basePosts = [...feedPosts, ...collectionPosts].map((record) => {
        const post = mapRuntimePost(record)
        post.bookmarked = this.bookmarkedIds.includes(post.id)
        return post
      })
      const mappedPosts = basePosts.map((post) => this.enrichPost(post, basePosts))
      const topicCounts = buildTrendingTopics(mappedPosts)
      const nextPosts = [...mappedPosts, ...this.state.posts.filter((post) => !mappedPosts.some((fresh) => fresh.id === post.id))]
      this.state = {
        ...this.state,
        posts: nextPosts.map((post) => this.enrichPost(post, nextPosts)),
        trendingTopics: topicCounts,
        loading: false,
        loadError: undefined,
      }
      this.emit()
    } catch (error) {
      if (requestRevision !== this.refreshRevision || runtime !== this.runtime) return
      this.state = {
        ...this.state,
        loading: false,
        loadError: error instanceof Error ? error.message : 'Could not load your feed',
      }
      this.emit()
    } finally {
      if (requestRevision === this.refreshRevision) {
        this.state = { ...this.state, loading: false }
        this.emit()
      }
    }
  }

  loadMore() {
    if (!this.hasMore()) return
    this.visiblePostCount += 20
    this.state = { ...this.state }
    this.emit()
  }

  hasMore() {
    return this.getFilteredPosts().length > this.visiblePostCount
  }

  getVisiblePosts() {
    return this.getFilteredPosts().slice(0, this.visiblePostCount)
  }

  getFilteredPosts() {
    let posts = filterFeedPosts(this.state.posts, this.state.activeFilter, this.state.searchQuery, readFollowedTopics())
    posts = posts.filter(post => !post.replyTo)
    const sortBy = this.state.sortBy
    if (sortBy === 'popular') {
      posts = [...posts].sort((a, b) => b.likes - a.likes)
    } else if (sortBy === 'trending') {
      posts = [...posts].sort((a, b) => (b.likes + b.comments + b.reposts) - (a.likes + a.comments + a.reposts))
    } else {
      posts = [...posts].sort((a, b) => {
        const tsA = parseTimestamp(a.publishedAt ?? a.timestamp)
        const tsB = parseTimestamp(b.publishedAt ?? b.timestamp)
        return tsB - tsA
      })
    }
    return posts
  }

  async likePost(id: string) {
    return this.reactPost(id, '❤️')
  }

  async reactPost(id: string, emoji = '❤️') {
    const post = this.state.posts.find((entry) => entry.id === id)
    const topic = post?.sourceTopic
    const runtime = this.runtime

    if (!runtime || !post || !topic) {
      emitToast('Connect to the peer network to react to this post', 'error')
      return false
    }
    try {
      await runtime.react(topic, id, emoji)
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not publish your reaction', 'error')
      return false
    }

    if (runtime !== this.runtime) return false
    await this.refreshAttachmentMetrics(topic, id)
    return true
  }

  async repostPost(id: string) {
    const post = this.state.posts.find((entry) => entry.id === id)
    const runtime = this.runtime
    if (!post || post.reposted) {
      return false
    }

    if (!runtime || !post.sourceTopic) {
      emitToast('Connect to the peer network to repost', 'error')
      return false
    }
    try {
      const sourceJid = `${post.author.handle}@${post.author.server || 'p2p'}`
      const sourceUri = `xmpp:${sourceJid}?;node=${encodeURIComponent(post.sourceTopic)};item=${encodeURIComponent(post.id)}`
      await runtime.publishFeed(buildRepostBody(post), {
        title: `Boosted by ${post.author.name}`,
        summary: post.content,
        categories: post.topic ? [post.topic] : undefined,
        links: [{ rel: 'related', title: 'Repost of', href: sourceUri }]
      })
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not publish your repost', 'error')
      return false
    }

    if (runtime !== this.runtime) return false
    await this.refresh()
    if (runtime !== this.runtime) return false
    return true
  }

  async bookmarkPost(id: string) {
    const nextBookmarkedIds = this.bookmarkedIds.includes(id)
      ? this.bookmarkedIds.filter((savedId) => savedId !== id)
      : [...this.bookmarkedIds, id]
    try {
      localStorage.setItem(bookmarksStorageKey(), JSON.stringify(nextBookmarkedIds))
    } catch {
      emitToast('Could not save this bookmark on this device. Check browser storage and try again.', 'error')
      return false
    }
    this.bookmarkedIds = nextBookmarkedIds
    this.state = { ...this.state, posts: toggleBookmark(this.state.posts, id) }
    this.emit()
    return true
  }

  async subscribeFeed(peerAddr: string, options?: { visibility?: BridgeVisibility }) {
    const runtime = this.runtime
    if (runtime) {
      try {
        await runtime.subscribeFeed(peerAddr, options)
        if (runtime !== this.runtime) return
        await this.refresh()
      } catch (err) {
        emitToast('Failed to subscribe to feed', 'error')
      }
    }
  }

  async unsubscribeFeed(peerAddr: string) {
    const runtime = this.runtime
    if (runtime) {
      try {
        await runtime.unsubscribeFeed(peerAddr)
        if (runtime !== this.runtime) return
        await this.refresh()
      } catch (err) {
        console.error('Failed to unsubscribe from feed:', err)
      }
    }
  }

  private emit() {
    this.state = { ...this.state, hasMore: this.hasMore() }
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

function buildTrendingTopics(posts: FeedPost[]): TrendingTopic[] {
  const counts = new Map<string, number>()

  for (const post of posts) {
    if (post.topic) {
      counts.set(post.topic, (counts.get(post.topic) ?? 0) + 1)
    }
  }

  const topics = Array.from(counts.entries())
    .map(([tag, count]) => ({
      tag,
      count: formatCount(count)
    }))
    .sort((a, b) => Number.parseFloat(b.count) - Number.parseFloat(a.count))

  return topics.slice(0, 5)
}

function parseTimestamp(ts: string): number {
  if (/^\d+[smhd]$/.test(ts)) {
    const unit = ts.slice(-1)
    const val = Number.parseInt(ts, 10)
    const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] ?? 60000
    return Date.now() - val * ms
  }
  if (ts === 'now') return Date.now()
  if (ts === 'yesterday') return Date.now() - 86400000
  const d = new Date(ts).getTime()
  return Number.isFinite(d) ? d : Date.now()
}

function formatCount(n: number) {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(n)
}

function buildRepostBody(post: FeedPost) {
  const author = `@${post.author.handle}`
  const heading = `Boosting ${author}`
  const topic = post.topic ? `#${post.topic}` : undefined
  const lines = [heading]
  if (topic) {
    lines.push(topic)
  }
  lines.push('', post.content)
  return lines.join('\n')
}
