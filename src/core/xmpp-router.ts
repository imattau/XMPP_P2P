import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import { parseCapsPresence, getCapsCacheKey, buildDiscoInfoQuery, buildDiscoItemsQuery } from './xmpp-discovery.js'
import { handlePubSubMessageElement as handlePubSubMessageElementFromModule } from './xmpp-pubsub.js'
import { handleSecureMessageStanza as handleSecureMessageStanzaFromModule } from './xmpp-secure.js'

const ROSTER_XMLNS = 'jabber:iq:roster'
const DISCO_INFO_XMLNS = 'http://jabber.org/protocol/disco#info'
const DISCO_ITEMS_XMLNS = 'http://jabber.org/protocol/disco#items'
const FOLLOWERS_XMLNS = 'urn:xmpp:pubsub:followers:0'
const OMEMO_DEVICES_NODE = 'urn:xmpp:omemo:2:devices'
const OMEMO_BUNDLES_NODE = 'urn:xmpp:omemo:2:bundles'
const OPENPGP_IQ_XMLNS = 'urn:xmpp:openpgp:0'
const PUBSUB_EVENT_XMLNS = 'http://jabber.org/protocol/pubsub#event'

export interface PendingIq {
  resolve: (element: Element) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface XmppRouterContext {
  jid: string
  pendingIq: Map<string, PendingIq>
  streams: Map<string, XmppStream>
  getOrCreateStream(target: string | Multiaddr): Promise<XmppStream>
  jidFromPeerId(peerId: string): string
  buildOmemoDevicesQuery(): Element
  buildOmemoBundleQuery(deviceId: number): Element
  buildRosterQuery(): Element
  buildFollowersQuery(): Element
  discoveryIdentity: any
  discoveryNode: string
  collections: any
  collectionSubscriptions: any
  openPgpState: any
  openPgpFingerprint?: string
  deleteRosterEntry(jid: string): Promise<void>
  upsertRosterEntry(entry: any): Promise<any>
  handleSubscribe(peerId: string, fromJid: string): Promise<void>
  handleSubscribed(fromJid: string): Promise<void>
  handleUnsubscribe(peerId: string, fromJid: string): Promise<void>
  handleUnsubscribed(fromJid: string): Promise<void>
  sendCurrentPresenceToPeer(peerId: string): Promise<void>
  recordPresence(peerJid: string, presence: any): Promise<void>
  discoInfoCache: Map<string, any>
  ensurePeerCapabilities(peerId: string, node: string, ver: string): Promise<void>
  entityCapabilities: Map<string, any>
  getPubSubContext(): any
  getSecureContext(): any
  emit(event: string, ...args: any[]): boolean
}

export async function sendIqRequest(
  ctx: XmppRouterContext,
  target: string | Multiaddr,
  stanza: Element,
  timeoutMs = 10000
): Promise<Element> {
  const xmppStream = await ctx.getOrCreateStream(target)
  const id = stanza.attrs.id
  if (!id) {
    throw new Error('IQ stanza missing id')
  }

  return await new Promise<Element>((resolve, reject) => {
    const timer = setTimeout(() => {
      ctx.pendingIq.delete(id)
      reject(new Error(`Timed out waiting for IQ response ${id}`))
    }, timeoutMs)

    ctx.pendingIq.set(id, {
      resolve: (element) => {
        clearTimeout(timer)
        resolve(element)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
      timer
    })

    xmppStream.send(stanza)
  })
}

export async function sendIqResult(
  ctx: XmppRouterContext,
  peerId: string,
  id: string,
  payload?: Element
) {
  const xmppStream = ctx.streams.get(peerId)
  if (!xmppStream) {
    return
  }

  const stanza = payload
    ? xml('iq', { to: ctx.jidFromPeerId(peerId), from: ctx.jid, type: 'result', id }, payload)
    : xml('iq', { to: ctx.jidFromPeerId(peerId), from: ctx.jid, type: 'result', id })

  xmppStream.send(stanza)
}

export async function handleIqStanza(ctx: XmppRouterContext, peerId: string, element: Element) {
  const id = element.attrs.id
  if (!id) {
    return
  }

  const type = element.attrs.type
  if (type === 'result') {
    const pending = ctx.pendingIq.get(id)
    if (pending) {
      ctx.pendingIq.delete(id)
      clearTimeout(pending.timer)
      pending.resolve(element)
    }
    return
  }

  if (type === 'error') {
    const pending = ctx.pendingIq.get(id)
    if (pending) {
      ctx.pendingIq.delete(id)
      clearTimeout(pending.timer)
      pending.reject(new Error(`IQ error response for ${id}`))
    }
    return
  }

  const query = element.getChild('query')
  if (!query) {
    const pubsub = element.getChild('pubsub')
    if (pubsub) {
      const items = pubsub.getChild('items')
      const node = items?.attrs.node
      if (type === 'get' && node === OMEMO_DEVICES_NODE) {
        await sendIqResult(ctx, peerId, id, ctx.buildOmemoDevicesQuery())
        return
      }

      if (type === 'get' && node === OMEMO_BUNDLES_NODE) {
        const item = items?.getChild('item')
        const deviceId = Number(item?.attrs.id ?? 0)
        if (Number.isFinite(deviceId) && deviceId > 0) {
          await sendIqResult(ctx, peerId, id, ctx.buildOmemoBundleQuery(deviceId))
          return
        }
      }
    }

    return
  }

  if (query.attrs.xmlns === ROSTER_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, ctx.buildRosterQuery())
      return
    }

    if (type === 'set') {
      const item = query.getChild('item')
      if (item) {
        const jid = item.attrs.jid
        if (jid) {
          if (item.attrs.subscription === 'remove') {
            await ctx.deleteRosterEntry(jid)
          } else {
            const groups = (item.children as any[])
              .filter(child => child?.name === 'group')
              .map((child: Element) => child.text())

            await ctx.upsertRosterEntry({
              jid,
              name: item.attrs.name,
              subscription: item.attrs.subscription,
              ask: item.attrs.ask,
              groups
            })
          }
        }
      }

      await sendIqResult(ctx, peerId, id, ctx.buildRosterQuery())
    }
    return
  }

  if (query.attrs.xmlns === FOLLOWERS_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, ctx.buildFollowersQuery())
    }
    return
  }

  if (query.attrs.xmlns === DISCO_INFO_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, buildDiscoInfoQuery(ctx.discoveryIdentity, ctx.collections, query.attrs.node))
    }
    return
  }

  if (query.attrs.xmlns === DISCO_ITEMS_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, buildDiscoItemsQuery(ctx.discoveryNode, ctx.collections, ctx.collectionSubscriptions, ctx.jid, query.attrs.node))
    }
    return
  }

  if (query.attrs.xmlns === OPENPGP_IQ_XMLNS) {
    if (type === 'get') {
      const publicKey = ctx.openPgpState?.publicKey
      const fingerprint = ctx.openPgpFingerprint ?? ctx.openPgpState?.fingerprint
      if (!publicKey || !fingerprint) {
        await sendIqResult(ctx, peerId, id, xml('query', { xmlns: OPENPGP_IQ_XMLNS }))
        return
      }

      await sendIqResult(
        ctx,
        peerId,
        id,
        xml(
          'query',
          { xmlns: OPENPGP_IQ_XMLNS },
          xml('pubkey', { fingerprint }, publicKey)
        )
      )
    }
    return
  }
}

export async function handlePresenceStanza(ctx: XmppRouterContext, peerId: string, element: Element) {
  const fromJid = element.attrs.from || `${peerId}@p2p`
  const toJid = element.attrs.to || ctx.jid
  const type = element.attrs.type
  const statusEl = element.getChild('status')
  const showEl = element.getChild('show')
  const presence = {
    from: fromJid,
    to: toJid,
    type,
    status: statusEl ? statusEl.text() : undefined,
    show: showEl ? showEl.text() : undefined
  }

  ctx.emit('presence', presence)

  const caps = parseCapsPresence(element)
  if (caps) {
    const cacheKey = getCapsCacheKey(caps.node, caps.ver)
    if (!ctx.discoInfoCache.has(cacheKey) && caps.hash === 'sha-1') {
      void ctx.ensurePeerCapabilities(peerId, caps.node, caps.ver)
    } else {
      const cached = ctx.discoInfoCache.get(cacheKey)
      if (cached) {
        ctx.entityCapabilities.set(peerId, {
          peerId,
          jid: fromJid,
          node: caps.node,
          ver: caps.ver,
          hash: 'sha-1',
          info: cached,
          discoveredAt: new Date().toISOString()
        })
      }
    }
  }

  switch (type) {
    case 'subscribe':
      await ctx.handleSubscribe(peerId, fromJid)
      return
    case 'subscribed':
      await ctx.handleSubscribed(fromJid)
      return
    case 'unsubscribe':
      await ctx.handleUnsubscribe(peerId, fromJid)
      return
    case 'unsubscribed':
      await ctx.handleUnsubscribed(fromJid)
      return
    case 'probe':
      await ctx.sendCurrentPresenceToPeer(peerId)
      return
    case 'unavailable':
    default:
      await ctx.recordPresence(fromJid, {
        ...presence,
        type: type === 'unavailable' ? 'unavailable' : 'available'
      })
  }
}

export async function handleStanza(ctx: XmppRouterContext, peerId: string, element: Element) {
  const fromJid = element.attrs.from || `${peerId}@p2p`
  const toJid = element.attrs.to || ctx.jid

  if (element.name === 'message') {
    const eventEl = element.getChild('event')
    if (eventEl && eventEl.attrs.xmlns === PUBSUB_EVENT_XMLNS) {
      await handlePubSubMessageElementFromModule(peerId, element, ctx.getPubSubContext())
      return
    }

    if (await handleSecureMessageStanzaFromModule(element, fromJid, toJid, ctx.getSecureContext())) {
      return
    }
    return
  }

  if (element.name === 'presence') {
    await handlePresenceStanza(ctx, peerId, element)
    return
  }

  if (element.name === 'iq') {
    await handleIqStanza(ctx, peerId, element)
    return
  }

  ctx.emit('stanza', { from: fromJid, to: toJid, element })
}
