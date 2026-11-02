import type { Article, ArticleBlock, ArticleSettings } from './types'

const ARTICLE_BODY_PREFIX = 'nexus-article:v1\n'
const ARTICLE_BLOCK_TYPES = new Set<ArticleBlock['type']>([
  'heading', 'paragraph', 'quote', 'image', 'gallery', 'list', 'code',
  'table', 'callout', 'divider', 'file', 'link',
])

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function safeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const uploadMatch = value.match(/^upload:\/\/([a-f0-9]{64})$/i)
  if (uploadMatch) return `upload://${uploadMatch[1].toLowerCase()}`
  return safeHttpUrl(value)
}

export type PublishedArticlePayload = {
  version: 1
  id?: string
  title: string
  subtitle?: string
  summary?: string
  coverImage?: string
  topic: string
  blocks: ArticleBlock[]
  readTime: string
  settings: Pick<ArticleSettings, 'showReadingTime'>
}

export function encodePublishedArticleBody(article: Article): string {
  const payload: PublishedArticlePayload = {
    version: 1,
    id: article.id,
    title: article.title,
    subtitle: article.subtitle,
    summary: article.summary,
    coverImage: article.coverImage,
    topic: article.topic,
    blocks: article.blocks,
    readTime: article.readTime,
    settings: { showReadingTime: article.settings.showReadingTime },
  }
  return ARTICLE_BODY_PREFIX + JSON.stringify(payload)
}

export function decodePublishedArticleBody(body: string): PublishedArticlePayload | undefined {
  if (!body.startsWith(ARTICLE_BODY_PREFIX)) return undefined
  try {
    const payload = JSON.parse(body.slice(ARTICLE_BODY_PREFIX.length)) as Partial<PublishedArticlePayload>
    if (payload.version !== 1 || typeof payload.title !== 'string' || !Array.isArray(payload.blocks)) return undefined
    const blocks = payload.blocks.filter((block): block is ArticleBlock =>
      Boolean(block)
      && typeof block.id === 'string'
      && typeof block.content === 'string'
      && ARTICLE_BLOCK_TYPES.has(block.type)
    )
    const sanitizedBlocks = blocks.map((block) => {
      if (!block.meta || typeof block.meta !== 'object' || Array.isArray(block.meta)) return block
      const meta = { ...block.meta }
      if (block.type === 'image' || block.type === 'file') meta.url = safeMediaUrl(meta.url)
      if (block.type === 'link') meta.href = safeHttpUrl(meta.href)
      if (block.type === 'gallery') {
        meta.images = Array.isArray(meta.images)
          ? meta.images.flatMap((entry) => {
              if (!entry || typeof entry !== 'object') return []
              const url = safeMediaUrl((entry as { url?: unknown }).url)
              return url ? [{ url, alt: typeof (entry as { alt?: unknown }).alt === 'string' ? (entry as { alt: string }).alt : '' }] : []
            })
          : []
      }
      return { ...block, meta }
    })
    return {
      version: 1,
      id: typeof payload.id === 'string' ? payload.id : undefined,
      title: payload.title,
      subtitle: typeof payload.subtitle === 'string' ? payload.subtitle : undefined,
      summary: typeof payload.summary === 'string' ? payload.summary : undefined,
      coverImage: safeMediaUrl(payload.coverImage),
      topic: typeof payload.topic === 'string' ? payload.topic : '',
      blocks: sanitizedBlocks,
      readTime: typeof payload.readTime === 'string' ? payload.readTime : '1 min read',
      settings: { showReadingTime: payload.settings?.showReadingTime !== false },
    }
  } catch {
    return undefined
  }
}

export function getArticleFeedPreview(body: string): string | undefined {
  if (!isPublishedArticleBody(body)) return undefined
  const payload = decodePublishedArticleBody(body)
  if (!payload) return 'This article uses a format this client cannot read.'
  const excerpt = payload.blocks
    .filter((block) => ['paragraph', 'quote', 'callout', 'heading'].includes(block.type))
    .map((block) => block.content.trim())
    .find(Boolean)
  return [payload.title, payload.summary || payload.subtitle, excerpt]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n\n')
}

export function isPublishedArticleBody(body: string): boolean {
  return body.startsWith('nexus-article:')
}
