import { createHash } from 'crypto'
import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'

export const ROSTER_XMLNS = 'jabber:iq:roster'
export const DISCO_INFO_XMLNS = 'http://jabber.org/protocol/disco#info'
export const DISCO_ITEMS_XMLNS = 'http://jabber.org/protocol/disco#items'
export const CAPS_XMLNS = 'http://jabber.org/protocol/caps'
export const PUBSUB_EVENT_XMLNS = 'http://jabber.org/protocol/pubsub#event'
export const ATOM_XMLNS = 'http://www.w3.org/2005/Atom'
export const MICROBLOG_XMLNS = 'urn:xmpp:microblog:0'
export const COLLECTION_XMLNS = 'urn:xmpp:collection:0'
export const ATTACHMENT_XMLNS = 'urn:xmpp:pubsub:attachments:0'
export const HTTP_UPLOAD_XMLNS = 'urn:xmpp:http:upload:0'
export const PAM_XMLNS = 'urn:xmpp:pubsub:account-management:0'
export const FOLLOWERS_XMLNS = 'urn:xmpp:pubsub:followers:0'
export const DISCOVERY_NODE = 'urn:xmpp:p2p:discovery'
import {
  RECEIPTS_XMLNS,
  CHATSTATES_XMLNS,
  DELAY_XMLNS,
  CORRECT_XMLNS,
  PING_XMLNS,
  SID_XMLNS,
  REPLY_XMLNS
} from './xmpp-xep-helpers.js'

export {
  RECEIPTS_XMLNS,
  CHATSTATES_XMLNS,
  DELAY_XMLNS,
  CORRECT_XMLNS,
  PING_XMLNS,
  SID_XMLNS,
  REPLY_XMLNS
}

export interface XmppDiscoIdentity {
  category: string
  type?: string
  name?: string
  lang?: string
}

export interface XmppDiscoInfo {
  node?: string
  identities: XmppDiscoIdentity[]
  features: string[]
  ver: string
  hash: string
  cachedAt: string
}

export interface XmppDiscoItem {
  jid: string
  node?: string
  name?: string
}

export interface XmppEntityCapabilities {
  peerId: string
  jid: string
  node: string
  ver: string
  hash: string
  info: XmppDiscoInfo
  discoveredAt: string
}

export interface XmppCapsPresence {
  node: string
  ver: string
  hash: 'sha-1' | string
}

export interface XmppDiscoveryCollectionMember {
  jid: string
  feedTopic: string
}

export interface XmppDiscoveryCollection {
  id: string
  name?: string
  topic: string
  members?: XmppDiscoveryCollectionMember[]
}

export interface XmppDiscoveryCollectionSubscription {
  id: string
  topic: string
}

function findCollection(
  collections: ReadonlyMap<string, XmppDiscoveryCollection>,
  node?: string
): XmppDiscoveryCollection | undefined {
  if (!node) {
    return undefined
  }

  return collections.get(node) ?? Array.from(collections.values()).find(entry => entry.topic === node)
}

export function getDiscoveryIdentities(
  discoveryIdentity: XmppDiscoIdentity,
  collections: ReadonlyMap<string, XmppDiscoveryCollection>,
  node?: string
): XmppDiscoIdentity[] {
  const collection = findCollection(collections, node)
  if (!collection) {
    return [discoveryIdentity]
  }

  return [{
    category: 'conference',
    type: 'text',
    name: collection.name ?? collection.id
  }]
}

export function getDiscoveryFeatures(
  collections: ReadonlyMap<string, XmppDiscoveryCollection>,
  node?: string
): string[] {
  const features = new Set<string>([
    DISCO_INFO_XMLNS,
    DISCO_ITEMS_XMLNS,
    CAPS_XMLNS,
    ROSTER_XMLNS,
    PUBSUB_EVENT_XMLNS,
    MICROBLOG_XMLNS,
    COLLECTION_XMLNS,
    ATTACHMENT_XMLNS,
    HTTP_UPLOAD_XMLNS,
    OMEMO_FEATURE,
    OMEMO_PTE_FEATURE,
    OPENPGP_FEATURE,
    OPENPGP_PUBSUB_FEATURE,
    PAM_XMLNS,
    FOLLOWERS_XMLNS,
    RECEIPTS_XMLNS,
    CHATSTATES_XMLNS,
    DELAY_XMLNS,
    CORRECT_XMLNS,
    PING_XMLNS,
    SID_XMLNS,
    REPLY_XMLNS
  ])

  if (findCollection(collections, node)) {
    features.add(COLLECTION_XMLNS)
  }

  return Array.from(features).sort()
}

export const OMEMO_FEATURE = 'urn:xmpp:omemo:2'
export const OMEMO_PTE_FEATURE = 'urn:xmpp:pte:0'
export const OPENPGP_FEATURE = 'urn:xmpp:openpgp:0'
export const OPENPGP_PUBSUB_FEATURE = 'urn:xmpp:openpgp:pubsub:0'

export function computeDiscoveryVer(identities: XmppDiscoIdentity[], features: string[]): string {
  const identityBits = identities
    .map(identity => [identity.category, identity.type ?? '', identity.lang ?? '', identity.name ?? ''].join('<'))
    .sort()
  const payload = [...identityBits, ...features.slice().sort()].join('<')
  return createHash('sha1').update(payload).digest('base64')
}

export function buildCapsElement(
  discoveryNode: string,
  discoveryIdentity: XmppDiscoIdentity,
  collections: ReadonlyMap<string, XmppDiscoveryCollection>
): Element {
  const identities = getDiscoveryIdentities(discoveryIdentity, collections)
  const features = getDiscoveryFeatures(collections)
  const ver = computeDiscoveryVer(identities, features)
  return xml('c', {
    xmlns: CAPS_XMLNS,
    hash: 'sha-1',
    node: discoveryNode,
    ver
  })
}

export function buildDiscoInfoQuery(
  discoveryIdentity: XmppDiscoIdentity,
  collections: ReadonlyMap<string, XmppDiscoveryCollection>,
  node?: string
): Element {
  const identities = getDiscoveryIdentities(discoveryIdentity, collections, node)
  const features = getDiscoveryFeatures(collections, node)
  const queryAttrs: Record<string, string> = { xmlns: DISCO_INFO_XMLNS }
  if (node) {
    queryAttrs.node = node
  }

  return xml(
    'query',
    queryAttrs,
    ...identities.map(identity => xml('identity', identity as unknown as Record<string, string>)),
    ...features.map(feature => xml('feature', { var: feature }))
  )
}

export function buildDiscoItemsQuery(
  discoveryNode: string,
  collections: ReadonlyMap<string, XmppDiscoveryCollection>,
  collectionSubscriptions: ReadonlyMap<string, XmppDiscoveryCollectionSubscription>,
  jid: string,
  node?: string
): Element {
  const isRootNode = !node || node === discoveryNode || node.startsWith(`${discoveryNode}#`)
  const items = isRootNode
    ? Array.from(collectionSubscriptions.values()).map(subscription => {
        const collection = collections.get(subscription.id)
        return {
          jid,
          node: subscription.id,
          name: collection?.name ?? subscription.id
        }
      })
    : (() => {
        const collection = findCollection(collections, node)
        if (!collection) {
          return [] as XmppDiscoItem[]
        }

        return (collection.members ?? []).map(member => ({
          jid: member.jid,
          node: member.feedTopic,
          name: member.jid
        }))
      })()

  const queryAttrs: Record<string, string> = { xmlns: DISCO_ITEMS_XMLNS }
  if (node) {
    queryAttrs.node = node
  }

  return xml(
    'query',
    queryAttrs,
    ...items.map(item => xml('item', item as unknown as Record<string, string>))
  )
}

export function parseDiscoInfoQuery(query: Element): XmppDiscoInfo {
  const identities = (query.children as any[])
    .filter(child => child?.name === 'identity')
    .map((identity: Element) => ({
      category: identity.attrs.category,
      type: identity.attrs.type,
      name: identity.attrs.name,
      lang: identity.attrs.lang
    }))

  const features = (query.children as any[])
    .filter(child => child?.name === 'feature')
    .map((feature: Element) => feature.attrs.var)
    .filter((feature): feature is string => typeof feature === 'string' && feature.length > 0)

  const ver = computeDiscoveryVer(identities, features)
  return {
    node: query.attrs.node,
    identities,
    features: Array.from(new Set(features)).sort(),
    ver,
    hash: 'sha-1',
    cachedAt: new Date().toISOString()
  }
}

export function parseDiscoItemsQuery(query: Element): XmppDiscoItem[] {
  return (query.children as any[])
    .filter(child => child?.name === 'item')
    .map((item: Element) => ({
      jid: item.attrs.jid,
      node: item.attrs.node,
      name: item.attrs.name
    }))
    .filter(item => typeof item.jid === 'string' && item.jid.length > 0) as XmppDiscoItem[]
}

export function parseCapsPresence(element: Element): XmppCapsPresence | undefined {
  const capsEl = element.getChild('c')
  if (!capsEl || capsEl.attrs.xmlns !== CAPS_XMLNS) {
    return undefined
  }

  const node = capsEl.attrs.node
  const ver = capsEl.attrs.ver
  if (!node || !ver) {
    return undefined
  }

  return {
    node,
    ver,
    hash: capsEl.attrs.hash || 'sha-1'
  }
}

export function getCapsCacheKey(node: string, ver: string): string {
  return `${node}#${ver}`
}

export interface XmppDiscoveryContext {
  ready: Promise<void>
  jid: string
  discoveryNode: string
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs?: number): Promise<Element>
  jidFromPeerId(peerId: string): string
  discoInfoCache: Map<string, XmppDiscoInfo>
  entityCapabilities: Map<string, XmppEntityCapabilities>
  emit(event: string, ...args: any[]): boolean
}

export async function queryDiscoInfo(ctx: XmppDiscoveryContext, peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoInfo> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const id = Math.random().toString(36).substring(2, 11)
  const toJid = xmppStream.remotePeer.toString() + '@p2p'
  const queryNode = node ?? ctx.discoveryNode

  const iq = xml(
    'iq',
    {
      to: toJid,
      from: ctx.jid,
      type: 'get',
      id
    },
    xml('query', { xmlns: DISCO_INFO_XMLNS, node: queryNode })
  )

  const result = await ctx.sendIqRequest(peerAddr, iq)
  const query = result.getChild('query')
  if (!query) {
    throw new Error('Disco info response missing query payload')
  }

  const info = parseDiscoInfoQuery(query)
  ctx.discoInfoCache.set(queryNode, info)
  ctx.entityCapabilities.set(xmppStream.remotePeer.toString(), {
    peerId: xmppStream.remotePeer.toString(),
    jid: toJid,
    node: queryNode,
    ver: info.ver,
    hash: 'sha-1',
    info,
    discoveredAt: new Date().toISOString()
  })
  ctx.emit('disco:info', { peerId: xmppStream.remotePeer.toString(), info })
  return info
}

export async function queryDiscoItems(ctx: XmppDiscoveryContext, peerAddr: string | Multiaddr, node?: string): Promise<XmppDiscoItem[]> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const id = Math.random().toString(36).substring(2, 11)
  const toJid = xmppStream.remotePeer.toString() + '@p2p'
  const queryNode = node ?? ctx.discoveryNode

  const iq = xml(
    'iq',
    {
      to: toJid,
      from: ctx.jid,
      type: 'get',
      id
    },
    xml('query', { xmlns: DISCO_ITEMS_XMLNS, node: queryNode })
  )

  const result = await ctx.sendIqRequest(peerAddr, iq)
  const query = result.getChild('query')
  if (!query) {
    return []
  }

  const items = parseDiscoItemsQuery(query)
  ctx.emit('disco:items', { peerId: xmppStream.remotePeer.toString(), items })
  return items
}

export async function ensurePeerCapabilities(ctx: XmppDiscoveryContext, peerId: string, node: string, ver: string, hash: string = 'sha-1') {
  const cacheKey = getCapsCacheKey(node, ver)
  if (ctx.discoInfoCache.has(cacheKey)) {
    ctx.entityCapabilities.set(peerId, {
      peerId,
      jid: ctx.jidFromPeerId(peerId),
      node,
      ver,
      hash: hash === 'sha-1' ? 'sha-1' : hash,
      info: ctx.discoInfoCache.get(cacheKey)!,
      discoveredAt: new Date().toISOString()
    })
    return
  }

  try {
    const info = await queryDiscoInfo(ctx, peerId, cacheKey)
    if (hash !== 'sha-1') {
      ctx.discoInfoCache.delete(cacheKey)
    }
    ctx.entityCapabilities.set(peerId, {
      peerId,
      jid: ctx.jidFromPeerId(peerId),
      node: cacheKey,
      ver: info.ver,
      hash: hash === 'sha-1' ? info.hash : hash,
      info,
      discoveredAt: new Date().toISOString()
    })
    ctx.emit('caps:discovered', ctx.entityCapabilities.get(peerId))
  } catch (err) {
    ctx.emit('error', err)
  }
}
