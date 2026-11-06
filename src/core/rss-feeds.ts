import { Parser } from '@xmpp/xml'
import type { XmppStorage } from './storage/types.js'

export type RssFeedStatus = 'active' | 'paused' | 'error'
export type RssFeedFormat = 'rss' | 'atom'

export type RssFeedPreview = {
  url: string
  title: string
  siteUrl?: string
  format: RssFeedFormat
  entries: Array<{ title: string; summary: string; publishedAt?: string; url?: string }>
}

export type RssFeedSource = {
  id: string
  url: string
  title: string
  siteUrl?: string
  format: RssFeedFormat
  status: RssFeedStatus
  lastFetchedAt?: string
  lastError?: string
  retryAt?: string
  failureCount?: number
  etag?: string
  lastModified?: string
  /** Whether newly fetched items are republished to this account's P2P feed. */
  shareToP2P?: boolean
  /** Item ids already published, retained to make retries idempotent. */
  sharedEntryIds?: string[]
  shareError?: string
  updatedAt: string
}

export type RssFeedPost = {
  id: string
  topic: string
  from: string
  body: string
  publishedAt: string
  updatedAt: string
  receivedAt: string
  atomId: string
  title?: string
  summary?: string
  author?: string
  categories?: string[]
  links?: Array<{ rel: string; href: string; type?: string; title?: string }>
  image?: string
  sourceProtocol: 'rss'
  sourceName: string
  sourceUrl: string
}

type ParsedEntry = {
  id: string
  title: string
  summary: string
  publishedAt?: string
  url?: string
  author?: string
  image?: string
  categories: string[]
}
type ParsedFeed = { title: string; siteUrl?: string; format: RssFeedFormat; entries: ParsedEntry[] }
type FeedResponse = { status: number; headers: Headers; text: string; url: string }
export type RssFeedFetcher = (url: string, init: RequestInit) => Promise<Response>
export type RssFeedPublisher = (post: RssFeedPost, itemId: string) => Promise<void>

const SOURCE_NS = 'rss-feed-sources'
const ITEM_NS = 'rss-feed-items'
const MAX_RESPONSE_BYTES = 1_000_000
const MAX_ENTRIES_PER_FEED = 30
const MAX_SOURCES_PER_ACCOUNT = 100
const MAX_STORED_ITEMS_PER_ACCOUNT = 1_000
const FETCH_TIMEOUT_MS = 12_000

function safeUrl(value: string, base?: string): string {
  let url: URL
  let input = value.trim()
  // Allow "itsfoss.com/feed" without a scheme.
  if (!base && !/^[a-z][a-z\d+.-]*:/i.test(input) && /^[^\s/]+\.[^\s/]+/.test(input)) input = `https://${input}`
  try { url = new URL(input, base) } catch { throw new Error('Enter a valid website or feed URL.') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Feeds must use an http or https URL.')
  if (url.username || url.password) throw new Error('Feed URLs cannot include a username or password.')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
    || /^0\./.test(host) || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /^198\.(18|19)\./.test(host)
    || host === '::' || host === '::1' || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host) || /^ff/i.test(host)) {
    throw new Error('Local network URLs cannot be used as feeds.')
  }
  if (!host.includes('.') && !host.includes(':')) throw new Error(`"${host}" is not a full website address. Include the domain, e.g. https://${host}.com/feed.`)
  url.hash = ''
  return url.toString()
}

function elementChildren(el: any): any[] {
  return (el?.children ?? []).filter((item: any) => typeof item === 'object' && item?.getName)
}

function localName(el: any): string {
  const name = String(el?.getName?.() ?? '').toLowerCase()
  return name.slice(name.lastIndexOf(':') + 1)
}

function child(el: any, name: string): any | undefined {
  return elementChildren(el).find((item: any) => localName(item) === name.toLowerCase())
}

function children(el: any, name: string): any[] {
  return elementChildren(el).filter((item: any) => localName(item) === name.toLowerCase())
}

function value(el: any, name: string): string | undefined {
  const text = child(el, name)?.getText?.()
  return typeof text === 'string' && text.trim() ? text.trim() : undefined
}

function plainText(input: string | undefined): string {
  if (!input) return ''
  return input.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 20_000)
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', copy: '©', amp: '&',
}

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : match } catch { return match }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/** Convert feed HTML to plain text while keeping paragraph, line-break and list structure. */
function htmlToText(input: string | undefined): string {
  if (!input) return ''
  const text = decodeEntities(input
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, d: string | undefined, sq: string | undefined, label: string) => {
      const href = decodeEntities((d ?? sq ?? '').trim())
      const text = label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      if (!/^https?:\/\//i.test(href) || !text || text === href) return text || href
      return `[${text.replace(/[\[\]]/g, '')}](${href.replace(/[()\s]/g, encodeURIComponent)})`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table|figure|section|article)>/gi, '\n\n')
    .replace(/<[^>]*>/g, ''))
  return text.replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000)
}

function entryImage(entry: any, rawHtml: string): string | undefined {
  const candidates: string[] = []
  for (const el of elementChildren(entry)) {
    const name = String(el.getName?.() ?? '').toLowerCase()
    const attrs = el.attrs ?? {}
    const type = String(attrs.type ?? '').toLowerCase()
    const medium = String(attrs.medium ?? '').toLowerCase()
    if ((name === 'thumbnail' || name === 'content' || name === 'enclosure') && attrs.url
      && (name === 'thumbnail' || medium === 'image' || type.startsWith('image/') || (name === 'content' && !type && !medium && /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(attrs.url)))) {
      candidates.push(String(attrs.url))
    } else if (name === 'link' && String(attrs.rel ?? '').toLowerCase() === 'enclosure' && type.startsWith('image/') && attrs.href) {
      candidates.push(String(attrs.href))
    }
  }
  const imgTag = rawHtml.match(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  if (imgTag) candidates.push(decodeEntities(imgTag[1] ?? imgTag[2] ?? ''))
  return candidates.find((url) => /^https?:\/\//i.test(url.trim()) || url.trim().startsWith('/'))?.trim()
}

function parseFeed(xmlText: string): ParsedFeed | undefined {
  if (/^\s*(<\?xml[^>]*>\s*)?<!DOCTYPE\s+html/i.test(xmlText) || /^\s*<html[\s>]/i.test(xmlText)) return undefined
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) throw new Error('This feed uses unsupported XML declarations.')
  let root: any
  let parseError: Error | undefined
  let closed = false
  const parser = new Parser()
  parser.on('start', (el: any) => { root = el })
  // The stream-style parser emits depth-1 elements separately instead of attaching them to the root.
  parser.on('element', (el: any) => { root?.children?.push(el) })
  parser.on('end', () => { closed = true })
  parser.on('error', (error: Error) => { parseError = error })
  parser.write(xmlText)
  if (parseError || !closed) return undefined
  const rootName = root?.getName?.().toLowerCase()
  const isAtom = rootName === 'feed'
  const rssChannel = rootName === 'rss' ? child(root, 'channel') : rootName === 'rdf' ? child(root, 'channel') : undefined
  if (!isAtom && !rssChannel) return undefined
  const container = isAtom ? root : rssChannel
  const title = plainText(value(container, 'title')) || (isAtom ? 'Atom feed' : 'RSS feed')
  const siteLink = isAtom
    ? children(container, 'link').find((link) => !link.attrs?.rel || link.attrs.rel === 'alternate')?.attrs?.href
    : value(container, 'link')
  const rawEntries = children(rootName === 'rdf' ? root : container, isAtom ? 'entry' : 'item').slice(0, MAX_ENTRIES_PER_FEED)
  const entries = rawEntries.map((entry: any) => {
    const links = children(entry, 'link')
    const href = isAtom
      ? links.find((link) => !link.attrs?.rel || link.attrs.rel === 'alternate')?.attrs?.href
      : value(entry, 'link')
    const date = value(entry, isAtom ? 'published' : 'pubDate') || value(entry, 'updated') || value(entry, 'date')
    const content = value(entry, 'encoded') || value(entry, 'content') || value(entry, 'description') || value(entry, 'summary') || ''
    const categories = children(entry, 'category').map((category: any) =>
      String(category.attrs?.term ?? category.attrs?.label ?? category.getText?.() ?? '').trim().replace(/^#/, '')
    ).filter(Boolean).slice(0, 20)
    const authorEl = child(entry, 'author')
    const author = value(authorEl, 'name') || value(entry, 'creator') || (typeof authorEl?.getText?.() === 'string' ? authorEl.getText().trim() : undefined)
    const id = value(entry, isAtom ? 'id' : 'guid') || href || `${title}:${date ?? ''}:${value(entry, 'title') ?? ''}`
    const entryTitle = plainText(value(entry, 'title')) || 'Untitled entry'
    const summary = htmlToText(content)
    const hashtags = `${entryTitle} ${summary}`.match(/#([\p{L}\p{N}_-]{2,64})/gu)?.map((tag) => tag.slice(1)) ?? []
    return {
      id,
      title: entryTitle,
      summary,
      publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : undefined,
      url: href,
      image: entryImage(entry, content),
      author: plainText(author),
      categories: [...new Map([...categories, ...hashtags].map((tag) => [tag.toLowerCase(), tag])).values()].slice(0, 20),
    }
  })
  return { title, siteUrl: siteLink, format: isAtom ? 'atom' : 'rss', entries }
}

function htmlFeedLinks(html: string, pageUrl: string): string[] {
  const found = new Set<string>()
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {}
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? ''
    }
    const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/)
    const type = (attrs.type ?? '').toLowerCase()
    if (rels.includes('alternate') && (type.includes('rss+xml') || type.includes('atom+xml')) && attrs.href) {
      try { found.add(safeUrl(attrs.href, pageUrl)) } catch { /* ignore unsafe advertised feeds */ }
    }
  }
  return [...found].slice(0, 10)
}

function toFeedPost(source: RssFeedSource, entry: ParsedEntry, receivedAt = new Date().toISOString()): RssFeedPost {
  const escapedId = encodeURIComponent(entry.id).slice(0, 180)
  const itemId = `rss:${source.id}:${escapedId}`
  return {
    id: itemId,
    atomId: entry.id,
    topic: `rss:${source.id}`,
    from: source.url,
    body: entry.summary || entry.title,
    title: entry.title,
    summary: entry.summary,
    author: entry.author || source.title,
    categories: entry.categories,
    image: safeOptionalUrl(entry.image, source.url),
    links: safeOptionalUrl(entry.url, source.url) ? [{ rel: 'alternate', href: safeOptionalUrl(entry.url, source.url)!, title: 'Open original entry' }] : [],
    publishedAt: entry.publishedAt ?? receivedAt,
    updatedAt: receivedAt,
    receivedAt,
    sourceProtocol: 'rss',
    sourceName: source.title,
    sourceUrl: source.url,
  }
}

export class RssFeedManager {
  private readonly sourceKey: string
  private readonly itemKey: string
  private readonly fetcher: RssFeedFetcher
  private readonly listeners = new Set<(post: RssFeedPost) => void>()
  private readonly inFlight = new Map<string, Promise<number>>()

  constructor(
    private readonly storage: XmppStorage,
    accountId: string,
    fetcher: RssFeedFetcher = (url, init) => fetch(url, init),
    private readonly publisher?: RssFeedPublisher
  ) {
    this.sourceKey = accountId.toLowerCase()
    this.itemKey = `${this.sourceKey}:`
    this.fetcher = fetcher
  }

  onPost(listener: (post: RssFeedPost) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async listSources(): Promise<RssFeedSource[]> {
    const rows = await this.storage.listRecords(SOURCE_NS)
    return rows.flatMap((row) => {
      if (!row.key.startsWith(`${this.sourceKey}:`)) return []
      try { return [JSON.parse(row.value) as RssFeedSource] } catch { return [] }
    }).sort((a, b) => a.title.localeCompare(b.title))
  }

  async listPosts(): Promise<RssFeedPost[]> {
    const rows = await this.storage.listRecords(ITEM_NS)
    return rows.flatMap((row) => {
      if (!row.key.startsWith(this.itemKey)) return []
      try { return [JSON.parse(row.value) as RssFeedPost] } catch { return [] }
    }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  async discover(inputUrl: string): Promise<RssFeedPreview[]> {
    const url = safeUrl(inputUrl)
    const response = await this.request(url)
    const direct = parseFeed(response.text)
    if (direct) return [this.preview(response.url, direct)]
    const links = htmlFeedLinks(response.text, response.url)
    const previews: RssFeedPreview[] = []
    for (const feedUrl of links) {
      try {
        const feedResponse = await this.request(feedUrl)
        const feed = parseFeed(feedResponse.text)
        if (feed) previews.push(this.preview(feedResponse.url, feed))
      } catch { /* one broken advertised feed must not hide the other choices */ }
    }
    if (previews.length) return previews
    throw new Error('No RSS or Atom feed was found at that URL. Try a direct feed URL or a website that advertises one.')
  }

  async subscribe(inputUrl: string, options: { shareToP2P?: boolean } = {}): Promise<RssFeedSource> {
    const url = safeUrl(inputUrl)
    const response = await this.request(url)
    const feed = parseFeed(response.text)
    if (!feed) throw new Error('That URL does not return a valid RSS or Atom feed.')
    const id = await this.idForUrl(response.url)
    const now = new Date().toISOString()
    const source: RssFeedSource = {
      id,
      url: response.url,
      title: feed.title,
      siteUrl: safeOptionalUrl(feed.siteUrl, response.url),
      format: feed.format,
      status: 'active',
      shareToP2P: options.shareToP2P === true,
      sharedEntryIds: [],
      lastFetchedAt: now,
      updatedAt: now,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    }
    const existing = (await this.listSources()).find((item) => item.id === id)
    if (existing) {
      if (options.shareToP2P && !existing.shareToP2P) {
        existing.shareToP2P = true
        existing.sharedEntryIds ??= []
        existing.updatedAt = new Date().toISOString()
        await this.shareNewEntries(existing)
        await this.saveSource(existing)
      }
      return existing
    }
    if ((await this.listSources()).length >= MAX_SOURCES_PER_ACCOUNT) throw new Error(`You can follow up to ${MAX_SOURCES_PER_ACCOUNT} RSS/Atom feeds.`)
    await this.saveSource(source)
    await this.saveEntries(source, feed.entries)
    return source
  }

  async refresh(id: string): Promise<number> {
    const pending = this.inFlight.get(id)
    if (pending) return pending
    const task = this.doRefresh(id).finally(() => this.inFlight.delete(id))
    this.inFlight.set(id, task)
    return task
  }

  async setPaused(id: string, paused: boolean): Promise<void> {
    const source = await this.findSource(id)
    if (!source) throw new Error('Feed source was removed.')
    source.status = paused ? 'paused' : 'active'
    source.lastError = undefined
    source.retryAt = undefined
    source.updatedAt = new Date().toISOString()
    await this.saveSource(source)
  }

  async setSharing(id: string, shareToP2P: boolean): Promise<void> {
    const source = await this.findSource(id)
    if (!source) throw new Error('Feed source was removed.')
    source.shareToP2P = shareToP2P
    source.sharedEntryIds ??= []
    source.updatedAt = new Date().toISOString()
    if (shareToP2P) await this.shareNewEntries(source)
    else source.shareError = undefined
    await this.saveSource(source)
  }

  async remove(id: string, keepEntries: boolean): Promise<void> {
    await this.storage.deleteRecord(SOURCE_NS, `${this.sourceKey}:${id}`)
    if (!keepEntries) {
      for (const row of await this.storage.listRecords(ITEM_NS)) {
        if (row.key.startsWith(`${this.itemKey}${id}:`)) await this.storage.deleteRecord(ITEM_NS, row.key)
      }
    }
  }

  private async doRefresh(id: string): Promise<number> {
    const source = await this.findSource(id)
    if (!source) throw new Error('Feed source was removed.')
    if (source.status === 'paused') throw new Error('This feed is paused. Resume it to refresh.')
    try {
      const response = await this.request(source.url, {
        ...(source.etag ? { 'If-None-Match': source.etag } : {}),
        ...(source.lastModified ? { 'If-Modified-Since': source.lastModified } : {}),
      })
      const now = new Date().toISOString()
      if (response.status === 304) {
        source.status = 'active'
        source.lastFetchedAt = now
        source.lastError = undefined
        source.retryAt = undefined
        source.failureCount = 0
        source.updatedAt = now
        await this.shareNewEntries(source)
        await this.saveSource(source)
        return 0
      }
      const feed = parseFeed(response.text)
      if (!feed) throw new Error('The source no longer returns a valid RSS or Atom feed.')
      source.title = feed.title
      source.siteUrl = safeOptionalUrl(feed.siteUrl, source.url)
      source.format = feed.format
      source.status = 'active'
      source.lastFetchedAt = now
      source.lastError = undefined
      source.retryAt = undefined
      source.failureCount = 0
      source.etag = response.headers.get('etag') ?? source.etag
      source.lastModified = response.headers.get('last-modified') ?? source.lastModified
      source.updatedAt = now
      await this.saveSource(source)
      return this.saveEntries(source, feed.entries)
    } catch (error) {
      source.status = 'error'
      source.lastError = error instanceof Error ? error.message : 'Feed refresh failed.'
      source.failureCount = (source.failureCount ?? 0) + 1
      source.retryAt = new Date(Date.now() + Math.min(6 * 60 * 60_000, 15 * 60_000 * (2 ** Math.min(source.failureCount - 1, 5)))).toISOString()
      source.updatedAt = new Date().toISOString()
      await this.saveSource(source)
      throw error
    }
  }

  private async saveEntries(source: RssFeedSource, entries: ParsedEntry[]): Promise<number> {
    const existing = new Set((await this.storage.listRecords(ITEM_NS)).map((row) => row.key))
    let added = 0
    for (const entry of entries) {
      const post = toFeedPost(source, entry)
      const key = `${this.itemKey}${source.id}:${encodeURIComponent(entry.id).slice(0, 180)}`
      const isNew = !existing.has(key)
      await this.storage.putRecord(ITEM_NS, key, JSON.stringify(post), post.updatedAt)
      if (isNew) {
        added += 1
        for (const listener of this.listeners) {
          try { listener(post) } catch { /* listeners are isolated */ }
        }
      }
    }
    const accountItems = (await this.storage.listRecords(ITEM_NS)).filter((row) => row.key.startsWith(this.itemKey))
    if (accountItems.length > MAX_STORED_ITEMS_PER_ACCOUNT) {
      const oldest = accountItems.flatMap((row) => {
        try {
          const post = JSON.parse(row.value) as RssFeedPost
          return [{ key: row.key, publishedAt: post.publishedAt }]
        } catch { return [{ key: row.key, publishedAt: '' }] }
      }).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
      for (const item of oldest.slice(0, accountItems.length - MAX_STORED_ITEMS_PER_ACCOUNT)) {
        await this.storage.deleteRecord(ITEM_NS, item.key)
      }
    }
    if (source.shareToP2P) await this.shareNewEntries(source)
    await this.saveSource(source)
    return added
  }

  private async shareNewEntries(source: RssFeedSource): Promise<void> {
    if (!source.shareToP2P || !this.publisher) return
    const shared = new Set(source.sharedEntryIds ?? [])
    const posts = (await this.listPosts()).filter((post) => post.topic === `rss:${source.id}`)
    let lastError: string | undefined
    for (const post of posts.reverse()) {
      if (shared.has(post.id)) continue
      try {
        const itemId = `rss-${await this.idForUrl(`${source.id}:${post.id}`)}`
        await this.publisher(post, itemId)
        shared.add(post.id)
        source.sharedEntryIds = [...shared].slice(-MAX_STORED_ITEMS_PER_ACCOUNT)
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Could not share a feed item over P2P.'
      }
    }
    source.shareError = lastError
  }

  private async request(url: string, headers: Record<string, string> = {}): Promise<FeedResponse> {
    const safe = safeUrl(url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      let target = safe
      let response: Response | undefined
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        response = await this.fetcher(target, { headers, signal: controller.signal, redirect: 'manual', credentials: 'omit' })
        if (response.type === 'opaqueredirect') throw new Error('This feed redirects. Enter the final feed URL directly in browser builds.')
        if (response.status < 300 || response.status >= 400) break
        const location = response.headers.get('location')
        if (!location) throw new Error('This feed redirects. Enter the final feed URL directly in browser builds.')
        if (redirects === 5) throw new Error('This feed redirected too many times.')
        target = safeUrl(location, target)
      }
      if (!response) throw new Error('Could not fetch this feed.')
      const finalUrl = safeUrl(response.url || target)
      if (!response.ok && response.status !== 304) throw new Error(`Feed server returned HTTP ${response.status}.`)
      const text = response.status === 304 ? '' : await readLimitedResponse(response, MAX_RESPONSE_BYTES)
      return { status: response.status, headers: response.headers, text, url: finalUrl }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('Feed request timed out.')
      const code = error as { code?: string; cause?: { code?: string }; message?: string } | undefined
      if ((code?.code ?? code?.cause?.code) === 'ENOTFOUND' || /ENOTFOUND/.test(String(code?.message))) {
        throw new Error(`Could not find the server for ${new URL(safe).hostname}. Check the address.`)
      }
      throw error
    } finally { clearTimeout(timer) }
  }

  private preview(url: string, feed: ParsedFeed): RssFeedPreview {
    return {
      url,
      title: feed.title,
      siteUrl: safeOptionalUrl(feed.siteUrl, url),
      format: feed.format,
      entries: feed.entries.slice(0, 3).map((entry) => ({ title: entry.title, summary: entry.summary.slice(0, 500), publishedAt: entry.publishedAt, url: safeOptionalUrl(entry.url, url) })),
    }
  }

  private async findSource(id: string): Promise<RssFeedSource | undefined> {
    const raw = await this.storage.getRecord(SOURCE_NS, `${this.sourceKey}:${id}`)
    if (!raw) return undefined
    try { return JSON.parse(raw) as RssFeedSource } catch { return undefined }
  }

  private async saveSource(source: RssFeedSource): Promise<void> {
    await this.storage.putRecord(SOURCE_NS, `${this.sourceKey}:${source.id}`, JSON.stringify(source), source.updatedAt)
  }

  private async idForUrl(url: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
    return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
}

async function readLimitedResponse(response: Response, limit: number): Promise<string> {
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > limit) throw new Error('Feed response exceeds the 1 MB size limit.')
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      total += chunk.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new Error('Feed response exceeds the 1 MB size limit.')
      }
      chunks.push(chunk)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

function safeOptionalUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined
  try { return safeUrl(value, base) } catch { return undefined }
}
