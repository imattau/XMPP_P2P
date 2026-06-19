import type { XmppRuntimeBridge } from '../runtime'
import type { FeedFilterType, FeedPost, FeedViewState, TrendingTopic } from './types'
import {
  cloneSeedPosts,
  cloneSeedTrendingTopics,
  filterFeedPosts,
  mapRuntimePost,
  toggleBookmark,
  toggleLike
} from './transform'

type Listener = (state: FeedViewState) => void

export class FeedBridgeController {
  private state: FeedViewState
  private listeners = new Set<Listener>()
  private runtime?: XmppRuntimeBridge
  private loading = false

  constructor(runtime?: XmppRuntimeBridge) {
    this.runtime = runtime
    this.state = {
      posts: cloneSeedPosts(),
      trendingTopics: cloneSeedTrendingTopics(),
      activeFilter: 'all',
      searchOpen: false,
      searchQuery: ''
    }
  }

  getState() {
    return this.state
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
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

  async refresh() {
    if (this.loading) {
      return
    }

    this.loading = true
    try {
      if (!this.runtime) {
        this.state = {
          ...this.state,
          posts: cloneSeedPosts(),
          trendingTopics: cloneSeedTrendingTopics()
        }
        this.emit()
        return
      }

      const [feedPosts, subscriptions, collections] = await Promise.all([
        this.runtime.getFeedPosts(),
        this.runtime.getPublicFeedSubscriptions().catch(() => []),
        this.runtime.getCollections().catch(() => [])
      ])

      const mappedPosts = feedPosts.map(mapRuntimePost)
      const topicCounts = buildTrendingTopics(mappedPosts, subscriptions.length, collections.length)

      this.state = {
        ...this.state,
        posts: mappedPosts,
        trendingTopics: topicCounts
      }
      this.emit()
    } finally {
      this.loading = false
    }
  }

  getFilteredPosts() {
    return filterFeedPosts(this.state.posts, this.state.activeFilter, this.state.searchQuery)
  }

  async likePost(id: string) {
    this.state = { ...this.state, posts: toggleLike(this.state.posts, id) }
    this.emit()
  }

  async reactPost(id: string, emoji = '❤️') {
    const post = this.state.posts.find((entry) => entry.id === id)
    const topic = post?.sourceTopic

    if (this.runtime && post && topic) {
      try {
        await this.runtime.react(topic, id, emoji)
      } catch {
        // Keep the optimistic UI update even if the runtime bridge is unavailable.
      }
    }

    this.state = { ...this.state, posts: toggleLike(this.state.posts, id) }
    this.emit()
  }

  async bookmarkPost(id: string) {
    this.state = { ...this.state, posts: toggleBookmark(this.state.posts, id) }
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

function buildTrendingTopics(posts: FeedPost[], publicSubscriptions: number, collectionCount: number): TrendingTopic[] {
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

  topics.push(
    { tag: 'PublicSubs', count: formatCount(publicSubscriptions) },
    { tag: 'Collections', count: formatCount(collectionCount) }
  )

  return topics.slice(0, 5)
}

function formatCount(n: number) {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(n)
}
