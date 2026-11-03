import type { BridgeFeedPostRecord, XmppRuntimeBridge } from '../runtime'
import type { Article, ArticleViewState } from './types'
import { DEFAULT_ARTICLE_SETTINGS } from './types'
import { emitToast } from '../../lib/toast-events'
import { decodePublishedArticleBody, encodePublishedArticleBody, getArticleFeedPreview, isPublishedArticleBody } from './serialization'
import { getActiveAccountStorageId, getAccountScopedStorageKey } from '../../lib/account-storage'

const DRAFTS_KEY = 'nexus_article_drafts'
const BOOKMARKS_KEY = 'nexus_article_bookmarks'
const FOLLOWED_TOPICS_KEY = 'nexus_followed_topics'
const draftsStorageKey = () => getAccountScopedStorageKey(DRAFTS_KEY)
const bookmarksStorageKey = () => getAccountScopedStorageKey(BOOKMARKS_KEY)
const followedTopicsStorageKey = () => getAccountScopedStorageKey(FOLLOWED_TOPICS_KEY)
type Listener = (state: ArticleViewState) => void

function loadDrafts(): Article[] {
  try {
    const raw = localStorage.getItem(draftsStorageKey())
    return raw ? JSON.parse(raw) as Article[] : []
  } catch {
    return []
  }
}

function saveDraftsToStorage(drafts: Article[]): boolean {
  try {
    localStorage.setItem(draftsStorageKey(), JSON.stringify(drafts))
    return true
  } catch {
    return false
  }
}

function loadBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(bookmarksStorageKey())
    return raw ? JSON.parse(raw) as string[] : []
  } catch {
    return []
  }
}

function saveBookmarksToStorage(ids: string[]): boolean {
  try {
    localStorage.setItem(bookmarksStorageKey(), JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

function loadFollowedTopics(): string[] {
  try {
    const raw = localStorage.getItem(followedTopicsStorageKey())
    return raw ? JSON.parse(raw) as string[] : []
  } catch {
    return []
  }
}

let nextBlockId = 1
export function generateBlockId() {
  return `block_${Date.now()}_${nextBlockId++}`
}

let nextArticleId = 1
function generateArticleId() {
  return `article_${Date.now()}_${nextArticleId++}`
}

export function getReadTime(blocks: { content: string; meta?: Record<string, unknown> }[]): string {
  let wordCount = 0
  for (const block of blocks) {
    wordCount += block.content.split(/\s+/).filter(Boolean).length
    if (block.meta?.items && Array.isArray(block.meta.items)) {
      wordCount += (block.meta.items as string[]).reduce((count, item) => count + item.split(/\s+/).filter(Boolean).length, 0)
    }
  }
  const minutes = Math.max(1, Math.ceil(wordCount / 200))
  return `${minutes} min read`
}

export function createNewArticle(overrides?: Partial<Article>): Article {
  return {
    id: generateArticleId(),
    topic: '',
    title: '',
    subtitle: '',
    summary: '',
    blocks: [
      { id: generateBlockId(), type: 'paragraph', content: '' },
    ],
    author: {
      name: 'You',
      handle: 'you',
      avatar: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readTime: '1 min read',
    status: 'draft',
    visibility: 'public',
    settings: { ...DEFAULT_ARTICLE_SETTINGS },
    ...overrides,
  }
}

export class ArticleBridgeController {
  private state: ArticleViewState
  private listeners = new Set<Listener>()
  private runtime?: XmppRuntimeBridge
  private unsubscribeFeed?: () => void
  private refreshRevision = 0
  private accountId = getActiveAccountStorageId()

  constructor(runtime?: XmppRuntimeBridge) {
    this.runtime = runtime
    const bookmarkedIds = loadBookmarks()
    const drafts = loadDrafts()

    this.state = {
      articles: [],
      drafts,
      bookmarkedIds,
      followedTopics: loadFollowedTopics(),
      loading: false,
      loadError: runtime ? undefined : 'Connect to the peer network to load articles.',
      activeTopic: null,
    }

    if (runtime) this.attachRuntime(runtime)
  }

  private attachRuntime(runtime: XmppRuntimeBridge) {
    this.runtime = runtime
    this.unsubscribeFeed?.()
    this.unsubscribeFeed = runtime.onFeedPost?.((record) => {
      const article = articleFromFeed(record, this.state.bookmarkedIds)
      if (!article) return
      this.upsertArticle(article)
    })
    void this.refresh()
  }

  setRuntime(runtime?: XmppRuntimeBridge) {
    const nextAccountId = getActiveAccountStorageId()
    const accountChanged = nextAccountId !== this.accountId
    if (runtime === this.runtime && !accountChanged) return
    this.refreshRevision += 1
    this.unsubscribeFeed?.()
    this.unsubscribeFeed = undefined
    this.runtime = undefined
    if (accountChanged) {
      this.accountId = nextAccountId
      this.state = {
        ...this.state,
        articles: [],
        drafts: loadDrafts(),
        bookmarkedIds: loadBookmarks(),
        followedTopics: loadFollowedTopics(),
        activeTopic: null,
      }
    }
    if (!runtime) {
      this.state = {
        ...this.state,
        loading: false,
        loadError: 'Connect to the peer network to load articles.',
      }
      this.emit()
      return
    }
    this.attachRuntime(runtime)
  }

  async refresh() {
    const requestRevision = ++this.refreshRevision
    const runtime = this.runtime
    if (!runtime) {
      this.state = {
        ...this.state,
        loading: false,
        loadError: 'Connect to the peer network to load articles.',
      }
      this.emit()
      return
    }
    this.state = { ...this.state, loading: true, loadError: undefined }
    this.emit()
    try {
      const posts = await runtime.getFeedPosts()
      if (requestRevision !== this.refreshRevision || runtime !== this.runtime) return
      const fetchedArticles = posts
        .map((post) => articleFromFeed(post, this.state.bookmarkedIds))
        .filter((article): article is Article => article !== undefined)
      const articlesById = new Map(fetchedArticles.map((article) => [article.id, article]))
      for (const current of this.state.articles) {
        const fetched = articlesById.get(current.id)
        const currentUpdatedAt = new Date(current.updatedAt).getTime()
        const fetchedUpdatedAt = fetched ? new Date(fetched.updatedAt).getTime() : Number.NEGATIVE_INFINITY
        if (!fetched || currentUpdatedAt > fetchedUpdatedAt) articlesById.set(current.id, current)
      }
      const articles = [...articlesById.values()]
        .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
      this.state = { ...this.state, articles, loading: false }
      this.emit()
    } catch (error) {
      if (requestRevision !== this.refreshRevision || runtime !== this.runtime) return
      this.state = {
        ...this.state,
        loading: false,
        loadError: error instanceof Error ? error.message : 'Could not load articles',
      }
      this.emit()
    }
  }

  private upsertArticle(article: Article) {
    const articles = [article, ...this.state.articles.filter((existing) => existing.id !== article.id)]
      .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
    this.state = { ...this.state, articles }
    this.emit()
  }

  getFollowedTopics(): string[] {
    return this.state.followedTopics
  }

  toggleFollowedTopic(topic: string): string[] {
    const current = this.state.followedTopics
    const normalized = topic.trim()
    const next = current.some((item) => item.toLowerCase() === normalized.toLowerCase())
      ? current.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
      : [...current, normalized]
    try {
      localStorage.setItem(followedTopicsStorageKey(), JSON.stringify(next))
    } catch {
      emitToast('Could not save followed topics on this device. Check browser storage and try again.', 'error')
      return current
    }
    this.state = { ...this.state, followedTopics: next }
    this.emit()
    return next
  }

  getState() {
    return this.state
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  private emit() {
    const state = this.state
    for (const listener of this.listeners) {
      listener(state)
    }
  }

  getArticles(): Article[] {
    return this.state.articles
  }

  getArticle(id: string): Article | undefined {
    return (
      this.state.articles.find((a) => a.id === id)
      ?? this.state.drafts.find((a) => a.id === id)
    )
  }

  getDrafts(): Article[] {
    return this.state.drafts
  }

  getTopicArticles(tag: string): Article[] {
    const lower = tag.toLowerCase()
    return this.state.articles.filter(
      (a) => a.topic.toLowerCase() === lower && a.status === 'published'
    )
  }

  getFeaturedArticles(): Article[] {
    return this.state.articles.filter((a) => a.status === 'published').slice(0, 2)
  }

  getLatestArticles(): Article[] {
    return [...this.state.articles]
      .filter((a) => a.status === 'published')
      .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
      .slice(0, 5)
  }

  setActiveTopic(tag: string | null) {
    this.state = { ...this.state, activeTopic: tag }
    this.emit()
  }

  saveDraft(article: Article) {
    const now = new Date().toISOString()
    const updated: Article = {
      ...article,
      updatedAt: now,
      readTime: getReadTime(article.blocks),
      status: 'draft',
    }

    const existing = this.state.drafts.findIndex((d) => d.id === article.id)
    let drafts: Article[]
    if (existing >= 0) {
      drafts = [...this.state.drafts]
      drafts[existing] = updated
    } else {
      drafts = [...this.state.drafts, updated]
    }

    if (!saveDraftsToStorage(drafts)) {
      throw new Error('Could not save this draft. Browser storage may be full or unavailable.')
    }
    this.state = { ...this.state, drafts }
    this.emit()
  }

  deleteDraft(id: string) {
    const drafts = this.state.drafts.filter((d) => d.id !== id)
    if (!saveDraftsToStorage(drafts)) {
      throw new Error('Could not delete this draft. Browser storage may be unavailable.')
    }
    this.state = { ...this.state, drafts }
    this.emit()
  }

  async publishArticle(article: Article, destination: 'p2p' | 'xmpp' = 'p2p'): Promise<string> {
    const now = new Date().toISOString()
    const published: Article = {
      ...article,
      updatedAt: now,
      publishedAt: now,
      readTime: getReadTime(article.blocks),
      summary: article.summary?.trim() || article.subtitle?.trim() || undefined,
      status: 'published',
    }

    const bodyText = encodePublishedArticleBody(published)

    if (!this.runtime) throw new Error('Connect to the peer network before publishing')
    const metadata = {
      title: published.title,
      summary: published.summary,
      categories: published.topic ? [published.topic] : undefined,
      author: published.author.name,
      itemId: published.id,
    }
    if (destination === 'xmpp') {
      if (!this.runtime.publishServerMicroblog) {
        throw new Error('Connect your XMPP account before publishing to its microblog.')
      }
      await this.runtime.publishServerMicroblog(bodyText, {
        ...metadata,
        displayContent: getArticleFeedPreview(bodyText),
        articlePayload: bodyText,
      })
    } else {
      await this.runtime.publishFeed(bodyText, metadata)
    }

    const drafts = this.state.drafts.filter((d) => d.id !== article.id)
    const draftsSaved = saveDraftsToStorage(drafts)

    this.state = { ...this.state, drafts }
    this.upsertArticle({ ...published, bookmarked: this.state.bookmarkedIds.includes(published.id) })
    this.emit()
    emitToast('Article published', 'success')
    if (!draftsSaved) {
      emitToast('Published successfully, but the local draft could not be removed. Delete it from Drafts when storage is available.', 'error')
    }
    return published.id
  }

  toggleBookmark(id: string): boolean {
    const bookmarkedIds = this.state.bookmarkedIds.includes(id)
      ? this.state.bookmarkedIds.filter((bid) => bid !== id)
      : [...this.state.bookmarkedIds, id]

    if (!saveBookmarksToStorage(bookmarkedIds)) {
      emitToast('Could not save this bookmark on this device. Check browser storage and try again.', 'error')
      return false
    }

    const articles = this.state.articles.map((a) =>
      a.id === id ? { ...a, bookmarked: !a.bookmarked } : a
    )

    this.state = { ...this.state, articles, bookmarkedIds }
    this.emit()
    return true
  }
}

function articleFromFeed(
  record: BridgeFeedPostRecord,
  bookmarkedIds: string[]
): Article | undefined {
  const payload = decodePublishedArticleBody(record.body)
  if (!payload && isPublishedArticleBody(record.body)) return undefined
  const title = record.title?.trim() || payload?.title || record.body.split('\n').find((line) => line.trim())?.trim() || 'Untitled post'
  const plainBody = isPublishedArticleBody(record.body)
    ? ''
    : record.body
  const body = plainBody
    .split('\n')
    .filter((line) => line.trim() && line.trim() !== title && line.trim() !== record.summary)
  const blocks = payload?.blocks ?? body.map((content, index) => ({ id: `${record.id}-${index}`, type: 'paragraph' as const, content }))
  return {
    id: payload?.id || record.id,
    topic: record.categories?.[0] ?? payload?.topic ?? '',
    title,
    subtitle: payload?.subtitle ?? record.summary,
    summary: payload?.summary ?? record.summary,
    coverImage: payload?.coverImage,
    blocks,
    author: {
      name: record.author ?? record.from,
      handle: record.from.includes('@') ? record.from.split('@')[0] : record.from,
      avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(record.from)}`,
    },
    createdAt: record.publishedAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
    readTime: payload?.readTime ?? getReadTime(blocks),
    status: 'published',
    visibility: 'public',
    settings: {
      ...DEFAULT_ARTICLE_SETTINGS,
      showReadingTime: payload?.settings.showReadingTime ?? true,
    },
    bookmarked: bookmarkedIds.includes(record.id),
  }
}
