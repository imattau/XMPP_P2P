/**
 * @packageDocumentation Atom entry building and parsing helpers for feed posts and
 * microblog content.
 */

import { xml, Element } from '@xmpp/xml'
import { ATOM_XMLNS } from './xmpp-discovery.js'
import {
  type XmppAtomGeoloc,
  type XmppAtomLink,
  type XmppFeedPost,
  normalizeFeedPost
} from './xmpp-records.js'

/**
 * Options used when building an Atom entry for a microblog post.
 */
export interface XmppMicroblogPostOptions {
  title?: string
  summary?: string
  categories?: string[]
  author?: string
  authorUri?: string
  publishedAt?: string
  updatedAt?: string
  atomId?: string
  contentType?: 'text' | 'xhtml'
  links?: XmppAtomLink[]
  geoloc?: XmppAtomGeoloc
  alternateHref?: string
}

const XHTML_XMLNS = 'http://www.w3.org/1999/xhtml'

const trimText = (value?: string) => value?.trim() ?? ''

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * Derives a short display title from a body of text.
 *
 * @param body - The post body text.
 * @returns A concise title suitable for Atom entry headers.
 */
export const deriveMicroblogTitle = (body: string) => {
  const text = collapseWhitespace(body)
  if (!text) {
    return 'Feed update'
  }

  const firstLine = text.split(/\r?\n/).find(line => line.trim()) ?? text
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

const deriveSummary = (body: string) => {
  const text = collapseWhitespace(body)
  if (!text) {
    return ''
  }

  return text.length > 280 ? `${text.slice(0, 277)}...` : text
}

/**
 * Builds a tag URI that uniquely identifies a published feed post.
 *
 * @param sourceJid - Sender JID for the post.
 * @param publishedAt - Publication timestamp.
 * @param itemId - Feed item identifier.
 * @returns A tag URI string.
 */
export const buildTagUri = (sourceJid: string, publishedAt: string, itemId: string) => {
  const jidParts = sourceJid.split('@')
  const authority = (jidParts[1] ?? jidParts[0] ?? 'p2p').split('/')[0] || 'p2p'
  const datePart = publishedAt.slice(0, 10) || new Date().toISOString().slice(0, 10)
  return `tag:${authority},${datePart}:posts-${itemId}`
}

const buildXmppUri = (sourceJid: string, topic: string, itemId: string) =>
  `xmpp:${sourceJid}?;node=${encodeURIComponent(topic)};item=${encodeURIComponent(itemId)}`

const parseLinks = (entryEl: Element): XmppAtomLink[] => {
  return (entryEl.children as any[])
    .filter(child => child?.name === 'link')
    .map((child: Element) => ({
      rel: child.attrs.rel,
      href: child.attrs.href,
      type: child.attrs.type,
      title: child.attrs.title,
      ref: child.attrs.ref
    }))
    .filter(link => Boolean(link.rel || link.href || link.type || link.title || link.ref)) as XmppAtomLink[]
}

const parseGeoloc = (entryEl: Element): XmppAtomGeoloc | undefined => {
  const geolocEl = entryEl.getChild('geoloc')
  if (!geolocEl) {
    return undefined
  }

  const lat = geolocEl.getChild('lat')?.text()
  const lon = geolocEl.getChild('lon')?.text()
  const country = geolocEl.getChild('country')?.text()
  const countryCode = geolocEl.getChild('countrycode')?.text()
  const region = geolocEl.getChild('region')?.text()
  if (!lat && !lon && !country && !countryCode && !region) {
    return undefined
  }

  return { lat, lon, country, countryCode, region }
}

/**
 * Returns whether an element is an Atom microblog entry.
 *
 * @param entryEl - Candidate Atom entry element.
 * @returns `true` when the element is Atom namespaced.
 */
export function isMicroblogEntryElement(entryEl?: Element): boolean {
  return Boolean(entryEl && entryEl.attrs.xmlns === ATOM_XMLNS)
}

/**
 * Builds an Atom entry for a feed post.
 *
 * @param post - Normalized feed post content.
 * @param options - Optional overrides for Atom metadata.
 * @returns A serialized Atom `<entry/>`.
 */
export function buildMicroblogEntry(post: XmppFeedPost, options: XmppMicroblogPostOptions = {}): Element {
  const publishedAt = options.publishedAt ?? post.publishedAt ?? new Date().toISOString()
  const updatedAt = options.updatedAt ?? post.updatedAt ?? publishedAt
  const title = trimText(options.title) || trimText(post.title) || deriveMicroblogTitle(post.body)
  const summary = trimText(options.summary) || trimText(post.summary) || deriveSummary(post.body)
  const categories = options.categories ?? post.categories ?? []
  const authorUri = trimText(options.authorUri) || `xmpp:${post.from}`
  const authorName = trimText(options.author) || trimText(post.author) || post.from
  const atomId = trimText(options.atomId) || trimText(post.atomId) || buildTagUri(post.from, publishedAt, post.id)
  const links = [...(post.links ?? []), ...(options.links ?? [])]
  if (options.alternateHref) {
    links.unshift({
      rel: 'alternate',
      href: options.alternateHref
    })
  }
  if (!links.some(link => link.rel === 'alternate')) {
    links.unshift({
      rel: 'alternate',
      href: buildXmppUri(post.from, post.topic, post.id)
    })
  }

  const entryChildren = [
    xml('title', { type: 'text' }, title),
    xml('id', {}, atomId),
    xml('published', {}, publishedAt),
    xml('updated', {}, updatedAt),
    authorName || authorUri ? xml('author', {}, authorName ? xml('name', {}, authorName) : null, authorUri ? xml('uri', {}, authorUri) : null) : null,
    summary ? xml('summary', { type: 'text' }, summary) : null,
    options.contentType === 'xhtml'
      ? xml('content', { type: 'xhtml' }, xml('div', { xmlns: XHTML_XMLNS }, post.body))
      : xml('content', { type: 'text' }, post.body),
    ...categories.filter(Boolean).map(category => xml('category', { term: category })),
    ...links.filter(link => link.href).map(link => {
      const attrs: Record<string, string> = { href: link.href as string }
      if (link.rel) attrs.rel = link.rel
      if (link.type) attrs.type = link.type
      if (link.title) attrs.title = link.title
      if (link.ref) attrs.ref = link.ref
      return xml('link', attrs)
    }),
    options.geoloc
      ? xml(
          'geoloc',
          { xmlns: 'http://jabber.org/protocol/geoloc' },
          options.geoloc.lat ? xml('lat', {}, options.geoloc.lat) : null,
          options.geoloc.lon ? xml('lon', {}, options.geoloc.lon) : null,
          options.geoloc.country ? xml('country', {}, options.geoloc.country) : null,
          options.geoloc.countryCode ? xml('countrycode', {}, options.geoloc.countryCode) : null,
          options.geoloc.region ? xml('region', {}, options.geoloc.region) : null
        )
      : null
  ].filter(Boolean)

  return xml('entry', { xmlns: ATOM_XMLNS }, ...entryChildren)
}

/**
 * Parses an Atom entry or plain post body into a normalized feed post.
 *
 * @param topic - PubSub topic for the feed.
 * @param itemEl - PubSub item element containing the entry.
 * @param from - Sender JID or peer reference.
 * @param node - Optional PubSub node name.
 * @returns A normalized feed post or `undefined` when the payload is not usable.
 */
export function parseMicroblogEntry(topic: string, itemEl: Element, from: string, node?: string): XmppFeedPost | undefined {
  const id = itemEl.attrs.id
  if (!id) {
    return undefined
  }

  const entryEl = (itemEl.children as any[]).find(child => child?.name === 'entry' && isMicroblogEntryElement(child)) as Element | undefined
  const bodyEl = itemEl.getChild('body')
  const contentEl = entryEl?.getChild('content')
  const summaryEl = entryEl?.getChild('summary')
  const titleEl = entryEl?.getChild('title')
  const authorEl = entryEl?.getChild('author')
  const publishedEl = entryEl?.getChild('published')
  const updatedEl = entryEl?.getChild('updated')

  const body = trimText(contentEl?.text() || bodyEl?.text() || summaryEl?.text() || titleEl?.text())
  if (!body && !titleEl?.text()) {
    return undefined
  }

  const author = trimText(authorEl?.getChild('name')?.text())
    || trimText(authorEl?.getChild('uri')?.text()?.replace(/^xmpp:/, ''))
    || trimText(authorEl?.text())
    || undefined

  return normalizeFeedPost({
    id,
    topic,
    from,
    body: body || trimText(titleEl?.text()) || 'Feed update',
    node,
    publishedAt: publishedEl?.text() || updatedEl?.text(),
    updatedAt: updatedEl?.text(),
    atomId: trimText(entryEl?.getChild('id')?.text()) || undefined,
    title: trimText(titleEl?.text()) || undefined,
    summary: trimText(summaryEl?.text()) || undefined,
    author,
    contentType: contentEl?.attrs.type === 'xhtml' ? 'xhtml' : 'text',
    categories: entryEl ? (entryEl.children as any[])
      .filter(child => child?.name === 'category')
      .map((category: Element) => category.attrs.term || category.attrs.label)
      .filter((category): category is string => Boolean(category && category.trim())) : undefined,
    links: entryEl ? parseLinks(entryEl) : undefined,
    geoloc: entryEl ? parseGeoloc(entryEl) : undefined
  })
}
