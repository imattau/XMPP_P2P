import type { XmppRuntimeBridge } from '../runtime'
import type { Article, ArticleSettings, ArticleViewState } from './types'
import { DEFAULT_ARTICLE_SETTINGS } from './types'
import { SEED_ARTICLES } from './seed'
import { emitToast } from '../../lib/toast-events'

const DRAFTS_KEY = 'nexus_article_drafts'
const BOOKMARKS_KEY = 'nexus_article_bookmarks'

type Listener = (state: ArticleViewState) => void

function loadDrafts(): Article[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    return raw ? JSON.parse(raw) as Article[] : []
  } catch {
    return []
  }
}

function saveDraftsToStorage(drafts: Article[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  } catch { /* storage full */ }
}

function loadBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    return raw ? JSON.parse(raw) as string[] : []
  } catch {
    return []
  }
}

function saveBookmarksToStorage(ids: string[]) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids))
  } catch { /* storage full */ }
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
      wordCount += (block.meta.items as string[]).length
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
      { id: generateBlockId(), type: 'heading', content: '' },
      { id: generateBlockId(), type: 'paragraph', content: '' },
    ],
    author: {
      name: 'You',
      handle: 'you',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&h=64&fit=crop&auto=format',
      verified: true,
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

  constructor(runtime?: XmppRuntimeBridge) {
    this.runtime = runtime
    const bookmarkedIds = loadBookmarks()
    const drafts = loadDrafts()

    const articles = SEED_ARTICLES.map((a) => ({
      ...a,
      bookmarked: bookmarkedIds.includes(a.id),
    }))

    this.state = {
      articles,
      drafts,
      bookmarkedIds,
      loading: false,
      activeTopic: null,
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

    saveDraftsToStorage(drafts)
    this.state = { ...this.state, drafts }
    this.emit()
  }

  deleteDraft(id: string) {
    const drafts = this.state.drafts.filter((d) => d.id !== id)
    saveDraftsToStorage(drafts)
    this.state = { ...this.state, drafts }
    this.emit()
  }

  async publishArticle(article: Article): Promise<string> {
    const now = new Date().toISOString()
    const published: Article = {
      ...article,
      updatedAt: now,
      publishedAt: now,
      readTime: getReadTime(article.blocks),
      status: 'published',
    }

    const bodyText = [
      published.title,
      published.subtitle,
      '',
      ...published.blocks.map((b) => b.content),
      '',
      `— ${published.author.name}`,
    ].join('\n')

    if (this.runtime) {
      try {
        await this.runtime.publishFeed(bodyText, {
          title: published.title,
          summary: published.summary ?? published.subtitle,
          categories: published.topic ? [published.topic] : undefined,
          itemId: published.id,
        })
      } catch {
        emitToast('Published locally (bridge unavailable)', 'info')
      }
    }

    const drafts = this.state.drafts.filter((d) => d.id !== article.id)
    saveDraftsToStorage(drafts)

    const articles = [
      { ...published, bookmarked: this.state.bookmarkedIds.includes(published.id) },
      ...this.state.articles,
    ]

    this.state = { ...this.state, drafts, articles }
    this.emit()
    emitToast('Article published', 'success')
    return published.id
  }

  toggleBookmark(id: string) {
    const bookmarkedIds = this.state.bookmarkedIds.includes(id)
      ? this.state.bookmarkedIds.filter((bid) => bid !== id)
      : [...this.state.bookmarkedIds, id]

    saveBookmarksToStorage(bookmarkedIds)

    const articles = this.state.articles.map((a) =>
      a.id === id ? { ...a, bookmarked: !a.bookmarked } : a
    )

    this.state = { ...this.state, articles, bookmarkedIds }
    this.emit()
  }
}
