export type ArticleBlockType =
  | 'heading' | 'paragraph' | 'quote' | 'image' | 'gallery'
  | 'list' | 'code' | 'table' | 'callout' | 'divider' | 'file' | 'link'

export interface ArticleBlock {
  id: string
  type: ArticleBlockType
  content: string
  meta?: Record<string, unknown>
}

export type ArticleVisibility = 'public' | 'followers' | 'unlisted'

export interface ArticleSettings {
  allowReplies: boolean
  showReadingTime: boolean
  notifyFollowers: boolean
  addToProfile: boolean
}

export interface Article {
  id: string
  topic: string
  title: string
  subtitle?: string
  summary?: string
  coverImage?: string
  blocks: ArticleBlock[]
  author: {
    name: string
    handle: string
    avatar: string
    verified?: boolean
  }
  createdAt: string
  updatedAt: string
  publishedAt?: string
  readTime: string
  slug?: string
  status: 'draft' | 'published'
  visibility: ArticleVisibility
  settings: ArticleSettings
  bookmarked?: boolean
}

export type ArticleSortOrder = 'recent' | 'popular'

export interface ArticleViewState {
  articles: Article[]
  drafts: Article[]
  bookmarkedIds: string[]
  loading: boolean
  activeTopic: string | null
}

export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = {
  allowReplies: true,
  showReadingTime: true,
  notifyFollowers: true,
  addToProfile: true,
}
