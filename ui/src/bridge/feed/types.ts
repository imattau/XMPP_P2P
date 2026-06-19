export type FeedType = 'post' | 'topic' | 'community'
export type FeedFilterType = 'all' | 'posts' | 'topics' | 'communities'

export interface FeedAuthor {
  name: string
  handle: string
  avatar: string
  verified?: boolean
  server?: string
}

export interface FeedMedia {
  url: string
  alt: string
}

export interface FeedPost {
  id: string
  type: FeedType
  author: FeedAuthor
  content: string
  timestamp: string
  sourceTopic?: string
  topic?: string
  topicColor?: string
  community?: string
  communityIcon?: string
  likes: number
  comments: number
  reposts: number
  liked?: boolean
  bookmarked?: boolean
  privacy?: 'public' | 'followers' | 'community'
  media?: FeedMedia
  replyTo?: string
  pinned?: boolean
}

export interface TrendingTopic {
  tag: string
  count: string
}

export interface FeedViewState {
  posts: FeedPost[]
  trendingTopics: TrendingTopic[]
  activeFilter: FeedFilterType
  searchOpen: boolean
  searchQuery: string
}
