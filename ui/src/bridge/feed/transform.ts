import type { BridgeFeedPostRecord } from '../runtime'
import type { FeedFilterType, FeedPost } from './types'
import { getArticleFeedPreview } from '../article/serialization'

export function mapRuntimePost(record: BridgeFeedPostRecord): FeedPost {
  const topics = [...new Set((record.categories ?? []).map((category) => category.trim().replace(/^#/, '')).filter(Boolean))]
  const topic = topics[0]
  const community = record.topic.startsWith('xmpp-collection:') ? record.topic.replace('xmpp-collection:', '') : undefined
  const repostLink = record.links?.find((link) => link.rel === 'related' && link.title === 'Repost of')
  const repostItem = repostLink?.href.match(/[?;&]item=([^;&]+)/)?.[1]
  const repostTopic = repostLink?.href.match(/[?;&]node=([^;&]+)/)?.[1]
  let repostOf: FeedPost['repostOf']
  if (repostItem && repostTopic) {
    try {
      repostOf = { id: decodeURIComponent(repostItem), topic: decodeURIComponent(repostTopic) }
    } catch {
      repostOf = undefined
    }
  }

  return {
    id: record.id,
    sourceProtocol: record.sourceProtocol ?? (record.topic.startsWith('xmpp-pep:') ? 'xmpp' : 'p2p'),
    externalUrl: record.links?.find((link) => link.rel === 'alternate' && /^https?:\/\//i.test(link.href))?.href,
    sourceName: record.sourceName,
    type: community ? 'community' : topic ? 'topic' : 'post',
    sourceTopic: record.topic,
    replyTo: record.replyTo,
    repostOf,
    author: {
      name: record.author ?? record.from,
      handle: record.sourceProtocol === 'rss'
        ? (() => { try { return new URL(record.sourceUrl || record.from).hostname } catch { return record.from } })()
        : record.from.includes('@') ? record.from.split('@')[0] : record.from,
      avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(record.from)}`,
      server: record.sourceProtocol === 'rss' ? 'RSS / Atom' : record.from.includes('@') ? record.from.split('@')[1] : 'p2p'
    },
    content: getArticleFeedPreview(record.body) ?? record.body,
    title: record.title,
    timestamp: formatRelativeTime(record.publishedAt),
    publishedAt: record.publishedAt,
    topic,
    topics,
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

export function filterFeedPosts(posts: FeedPost[], activeFilter: FeedFilterType, searchQuery: string, followedTopics: string[] = []) {
  const normalized = searchQuery.trim().toLowerCase()
  const followed = new Set(followedTopics.map((topic) => topic.toLowerCase()))
  return posts.filter((post) => {
    const typeMatch = activeFilter === 'all'
      || (activeFilter === 'posts' && post.type === 'post')
      || (activeFilter === 'topics' && post.type === 'topic')
      || (activeFilter === 'communities' && post.type === 'community')
      || (activeFilter === 'following' && (post.topics ?? (post.topic ? [post.topic] : [])).some((topic) => followed.has(topic.toLowerCase())))
    const searchMatch = !normalized
      || post.content.toLowerCase().includes(normalized)
      || post.author.name.toLowerCase().includes(normalized)
      || post.author.handle.toLowerCase().includes(normalized)
      || (post.topics ?? (post.topic ? [post.topic] : [])).some((topic) => topic.toLowerCase().includes(normalized))
      || (post.community ?? '').toLowerCase().includes(normalized)
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
