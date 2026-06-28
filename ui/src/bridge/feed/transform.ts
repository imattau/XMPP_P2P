import type { BridgeFeedPostRecord } from '../runtime'
import type { FeedFilterType, FeedPost, TrendingTopic } from './types'
import { SEED_POSTS, TRENDING_TOPICS } from './seed'

export function cloneSeedPosts(): FeedPost[] {
  return SEED_POSTS.map((post) => ({ ...post }))
}

export function cloneSeedTrendingTopics(): TrendingTopic[] {
  return TRENDING_TOPICS.map((topic) => ({ ...topic }))
}

export function mapRuntimePost(record: BridgeFeedPostRecord): FeedPost {
  const topic = record.categories?.[0]
  const community = record.topic.startsWith('xmpp-collection:') ? record.topic.replace('xmpp-collection:', '') : undefined

  return {
    id: record.id,
    type: community ? 'community' : topic ? 'topic' : 'post',
    sourceTopic: record.topic,
    author: {
      name: record.author ?? record.from,
      handle: record.from.includes('@') ? record.from.split('@')[0] : record.from,
      avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(record.from)}`,
      server: record.from.includes('@') ? record.from.split('@')[1] : 'p2p'
    },
    content: record.body,
    timestamp: formatRelativeTime(record.publishedAt),
    topic,
    topicColor: topic ? pickTopicColor(topic) : undefined,
    community,
    communityIcon: community ? '⚙️' : undefined,
    likes: 0,
    comments: 0,
    reposts: 0,
    reposted: false,
    privacy: 'public',
    geoloc: record.geoloc
  }
}

export function filterFeedPosts(posts: FeedPost[], activeFilter: FeedFilterType, searchQuery: string) {
  const normalized = searchQuery.trim().toLowerCase()
  return posts.filter((post) => {
    const typeMatch = activeFilter === 'all'
      || (activeFilter === 'posts' && post.type === 'post')
      || (activeFilter === 'topics' && post.type === 'topic')
      || (activeFilter === 'communities' && post.type === 'community')
    const searchMatch = !normalized
      || post.content.toLowerCase().includes(normalized)
      || post.author.name.toLowerCase().includes(normalized)
      || post.author.handle.toLowerCase().includes(normalized)
    return typeMatch && searchMatch
  })
}

export function toggleLike(posts: FeedPost[], id: string): FeedPost[] {
  return posts.map((post) => (
    post.id === id
      ? { ...post, liked: !post.liked, likes: post.liked ? post.likes - 1 : post.likes + 1 }
      : post
  ))
}

export function toggleBookmark(posts: FeedPost[], id: string): FeedPost[] {
  return posts.map((post) => (
    post.id === id
      ? { ...post, bookmarked: !post.bookmarked }
      : post
  ))
}

export function markRepost(posts: FeedPost[], id: string): FeedPost[] {
  return posts.map((post) => (
    post.id === id && !post.reposted
      ? { ...post, reposted: true, reposts: post.reposts + 1 }
      : post
  ))
}

export function pickTopicColor(tag: string) {
  const colors: Record<string, string> = {
    DecentralWeb: '#3b82f6',
    XMPPProtocol: '#00d4aa',
    Privacy: '#a855f7',
    FediDev: '#ef4444',
    OpenSource: '#f59e0b'
  }

  return colors[tag] ?? '#3b82f6'
}

function formatRelativeTime(iso: string) {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.round(diffMs / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.max(1, Math.round(minutes / 60))
  if (hours < 24) return `${hours}h`
  const days = Math.max(1, Math.round(hours / 24))
  return `${days}d`
}
