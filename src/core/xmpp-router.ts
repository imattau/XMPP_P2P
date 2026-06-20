/**
 * @packageDocumentation Central stanza router for inbound XMPP IQ and presence
 * handling, including discovery, roster, pubsub, secure messaging, and MAM.
 */

import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import { parseCapsPresence, getCapsCacheKey, buildDiscoInfoQuery, buildDiscoItemsQuery, HTTP_UPLOAD_XMLNS } from './xmpp-discovery.js'
import { handlePubSubMessageElement as handlePubSubMessageElementFromModule } from './xmpp-pubsub.js'
import { handleSecureMessageStanza as handleSecureMessageStanzaFromModule } from './xmpp-secure.js'
import { buildVCard, parseVCard, VCARD_XMLNS } from './xmpp-vcard.js'
import { parseXepMetadata } from './xmpp-xep-helpers.js'

const ROSTER_XMLNS = 'jabber:iq:roster'
const NICK_XMLNS = 'http://jabber.org/protocol/nick'
const DISCO_INFO_XMLNS = 'http://jabber.org/protocol/disco#info'
const DISCO_ITEMS_XMLNS = 'http://jabber.org/protocol/disco#items'
const FOLLOWERS_XMLNS = 'urn:xmpp:pubsub:followers:0'
const OMEMO_DEVICES_NODE = 'urn:xmpp:omemo:2:devices'
const OMEMO_BUNDLES_NODE = 'urn:xmpp:omemo:2:bundles'
const OPENPGP_IQ_XMLNS = 'urn:xmpp:openpgp:0'
const PUBSUB_EVENT_XMLNS = 'http://jabber.org/protocol/pubsub#event'
const XMPP_STANZAS_XMLNS = 'urn:ietf:params:xml:ns:xmpp-stanzas'
const VALID_PRESENCE_TYPES = new Set([
  'available',
  'unavailable',
  'subscribe',
  'subscribed',
  'unsubscribe',
  'unsubscribed',
  'probe',
  'error'
])
const VALID_PRESENCE_SHOW_VALUES = new Set(['away', 'chat', 'dnd', 'xa'])

/**
 * Tracks an outstanding IQ request and its completion handlers.
 */
export interface PendingIq {
  resolve: (element: Element) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Execution context required by the stanza router.
 */
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
  buildVCardQuery(): Element
  updateVCard(profile: any): Promise<any>
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
  setPeerClientState(peerId: string, state: 'active' | 'inactive'): void
  createUploadSlot(slotId: string, filename: string, contentType: string, size: number): Promise<Element>
  discoInfoCache: Map<string, any>
  ensurePeerCapabilities(peerId: string, node: string, ver: string, hash?: string): Promise<void>
  entityCapabilities: Map<string, any>
  getPubSubContext(): any
  getSecureContext(): any
  emit(event: string, ...args: any[]): boolean
  handleIncomingMamQuery(element: Element, peerId: string): Promise<void>
  handleIncomingMamResult(element: Element, peerId: string): Promise<void>
  muc?: any
}

/**
 * Builds an XMPP IQ error stanza from the incoming payload.
 *
 * @param element - The offending incoming IQ stanza.
 * @param peerId - Remote peer identifier.
 * @param ctx - Router context with local identity and helpers.
 * @param condition - XMPP stanza error condition.
 * @param type - Error type to emit.
 * @param text - Optional human-readable error detail.
 * @returns A serialized IQ error stanza.
 */
function buildIqError(
  element: Element,
  peerId: string,
  ctx: XmppRouterContext,
  condition: string,
  type: 'cancel' | 'modify' | 'auth' | 'wait' = 'cancel',
  text?: string
): Element {
  const attrs: Record<string, string> = {
    from: ctx.jid,
    to: element.attrs.from || ctx.jidFromPeerId(peerId),
    type: 'error',
    id: element.attrs.id
  }

  const errorChildren: Element[] = [xml(condition, { xmlns: XMPP_STANZAS_XMLNS })]
  if (text) {
    errorChildren.push(xml('text', { xmlns: XMPP_STANZAS_XMLNS }, text))
  }

  const payload = (element.children as any[]).find(child => child?.name) as Element | undefined
  return payload
    ? xml('iq', attrs, payload, xml('error', { type }, ...errorChildren))
    : xml('iq', attrs, xml('error', { type }, ...errorChildren))
}

/**
 * Sends an IQ error response to the peer if a stream is still available.
 *
 * @param ctx - Router context.
 * @param peerId - Remote peer identifier.
 * @param element - Original incoming IQ stanza.
 * @param condition - XMPP stanza error condition.
 * @param type - Error type to emit.
 * @param text - Optional human-readable error detail.
 * @returns Nothing.
 */
export async function sendIqError(
  ctx: XmppRouterContext,
  peerId: string,
  element: Element,
  condition: string,
  type: 'cancel' | 'modify' | 'auth' | 'wait' = 'cancel',
  text?: string
) {
  const xmppStream = ctx.streams.get(peerId)
  if (!xmppStream) {
    return
  }

  xmppStream.send(buildIqError(element, peerId, ctx, condition, type, text))
}

function sendPresenceError(
  ctx: XmppRouterContext,
  peerId: string,
  element: Element,
  condition: string,
  type: 'cancel' | 'modify' | 'auth' | 'wait' = 'modify',
  text?: string
) {
  const xmppStream = ctx.streams.get(peerId)
  if (!xmppStream) {
    return
  }

  const attrs: Record<string, string> = {
    from: ctx.jid,
    to: element.attrs.from || ctx.jidFromPeerId(peerId),
    type: 'error'
  }
  const errorChildren: Element[] = [xml(condition, { xmlns: XMPP_STANZAS_XMLNS })]
  if (text) {
    errorChildren.push(xml('text', { xmlns: XMPP_STANZAS_XMLNS }, text))
  }

  const payload = (element.children as any[]).find(child => child?.name) as Element | undefined
  xmppStream.send(
    payload
      ? xml('presence', attrs, payload, xml('error', { type }, ...errorChildren))
      : xml('presence', attrs, xml('error', { type }, ...errorChildren))
  )
}

/**
 * Sends an IQ request and awaits the response or timeout.
 *
 * @param ctx - Router context.
 * @param target - Target peer address or JID.
 * @param stanza - IQ stanza to transmit.
 * @param timeoutMs - Response timeout in milliseconds.
 * @returns The matching IQ response stanza.
 */
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

/**
 * Sends an IQ result response back to the requester.
 *
 * @param ctx - Router context.
 * @param peerId - Remote peer identifier.
 * @param id - IQ stanza id to echo.
 * @param payload - Optional payload element to include in the response.
 * @returns Nothing.
 */
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

/**
 * Handles an inbound IQ stanza and dispatches it to the relevant subsystem.
 *
 * @param ctx - Router context.
 * @param peerId - Remote peer identifier.
 * @param element - Incoming IQ stanza.
 * @returns Nothing.
 */
export async function handleIqStanza(ctx: XmppRouterContext, peerId: string, element: Element) {
  const id = element.attrs.id
  if (!id) {
    return
  }

  const type = element.attrs.type
  if (type !== 'get' && type !== 'set' && type !== 'result' && type !== 'error') {
    await sendIqError(ctx, peerId, element, 'bad-request', 'modify', 'Invalid IQ type')
    return
  }

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

  const ping = element.getChild('ping')
  if (ping && ping.attrs.xmlns === 'urn:xmpp:ping') {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id)
      return
    }
  }

  const stanzaChildren = (element.children as any[]).filter(child => child?.name) as Element[]
  if (type === 'get' || type === 'set') {
    if (stanzaChildren.length !== 1) {
      await sendIqError(ctx, peerId, element, 'bad-request', 'modify', 'IQ get/set stanzas must contain exactly one child element')
      return
    }
  }

  const query = element.getChild('query')
  const vCard = element.getChild('vCard')
  if (vCard && vCard.attrs.xmlns === VCARD_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, ctx.buildVCardQuery())
      return
    }

    if (type === 'set') {
      await ctx.updateVCard(parseVCard(vCard))
      await sendIqResult(ctx, peerId, id, ctx.buildVCardQuery())
      return
    }
  }

  const uploadRequest = element.getChild('request')
  if (uploadRequest && uploadRequest.attrs.xmlns === HTTP_UPLOAD_XMLNS) {
    if (type !== 'get') {
      await sendIqError(ctx, peerId, element, 'service-unavailable')
      return
    }

    const filename = uploadRequest.attrs.filename
    const size = Number(uploadRequest.attrs.size)
    const contentType = uploadRequest.attrs['content-type'] || uploadRequest.attrs.contentType || 'application/octet-stream'

    if (!filename || !Number.isFinite(size) || size < 0) {
      await sendIqError(ctx, peerId, element, 'bad-request', 'modify', 'Upload request must include filename and size')
      return
    }

    const slot = await ctx.createUploadSlot(id, filename, contentType, size)
    await sendIqResult(ctx, peerId, id, slot)
    return
  }

  const enableEl = element.getChild('enable')
  if (enableEl && enableEl.attrs.xmlns === 'urn:xmpp:carbons:2') {
    if (type === 'set') {
      const xmppStream = ctx.streams.get(peerId)
      if (xmppStream) {
        (xmppStream as any).carbonsEnabled = true
      }
      await sendIqResult(ctx, peerId, id)
      return
    }
  }

  const disableEl = element.getChild('disable')
  if (disableEl && disableEl.attrs.xmlns === 'urn:xmpp:carbons:2') {
    if (type === 'set') {
      const xmppStream = ctx.streams.get(peerId)
      if (xmppStream) {
        (xmppStream as any).carbonsEnabled = false
      }
      await sendIqResult(ctx, peerId, id)
      return
    }
  }

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
        await sendIqError(ctx, peerId, element, 'bad-request')
        return
      }
    }

    if (type === 'get' || type === 'set') {
      await sendIqError(ctx, peerId, element, 'service-unavailable')
    }
    return
  }

  if (query.attrs.xmlns === 'urn:xmpp:mam:2') {
    if (type === 'get') {
      const node = query.attrs.node
      if (node) {
        void (ctx as any).muc.handleIncomingMamQuery(element, peerId).catch(() => {})
      } else {
        void ctx.handleIncomingMamQuery(element, peerId).catch(() => {})
      }
      return
    }
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
        } else {
          await sendIqError(ctx, peerId, element, 'bad-request', 'modify', 'Roster item is missing a JID')
          return
        }
      } else {
        await sendIqError(ctx, peerId, element, 'bad-request', 'modify', 'Roster set request is missing an item')
        return
      }

      await sendIqResult(ctx, peerId, id, ctx.buildRosterQuery())
      return
    }
  }

  if (query.attrs.xmlns === FOLLOWERS_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, ctx.buildFollowersQuery())
      return
    }
  }

  if (query.attrs.xmlns === DISCO_INFO_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, buildDiscoInfoQuery(ctx.discoveryIdentity, ctx.collections, query.attrs.node))
      return
    }
  }

  if (query.attrs.xmlns === DISCO_ITEMS_XMLNS) {
    if (type === 'get') {
      await sendIqResult(ctx, peerId, id, buildDiscoItemsQuery(ctx.discoveryNode, ctx.collections, ctx.collectionSubscriptions, ctx.jid, query.attrs.node))
      return
    }
  }

  if (query.attrs.xmlns === OPENPGP_IQ_XMLNS) {
    if (type === 'get') {
      const publicKey = ctx.openPgpState?.publicKey
      const fingerprint = ctx.openPgpFingerprint ?? ctx.openPgpState?.fingerprint
      if (!publicKey || !fingerprint) {
        await sendIqError(ctx, peerId, element, 'service-unavailable')
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
      return
    }
  }

  if (type === 'get' || type === 'set') {
    await sendIqError(ctx, peerId, element, 'service-unavailable')
  }
}

export async function handlePresenceStanza(ctx: XmppRouterContext, peerId: string, element: Element) {
  const fromJid = element.attrs.from || `${peerId}@p2p`
  const toJid = element.attrs.to || ctx.jid
  const type = element.attrs.type
  const statusEl = element.getChild('status')
  const showEl = element.getChild('show')
  const nickEl = element.getChild('nick')

  if (type && !VALID_PRESENCE_TYPES.has(type)) {
    sendPresenceError(ctx, peerId, element, 'bad-request', 'modify', `Unsupported presence type: ${type}`)
    return
  }

  const showValue = showEl?.text()
  if (showValue && !VALID_PRESENCE_SHOW_VALUES.has(showValue)) {
    sendPresenceError(ctx, peerId, element, 'bad-request', 'modify', `Unsupported presence show value: ${showValue}`)
    return
  }

  const presence = {
    from: fromJid,
    to: toJid,
    type,
    status: statusEl ? statusEl.text() : undefined,
    show: showEl ? showEl.text() : undefined,
    nickname: nickEl && nickEl.attrs.xmlns === NICK_XMLNS ? nickEl.text().trim() : undefined
  }

  ctx.emit('presence', presence)

  const caps = parseCapsPresence(element)
  if (caps) {
    const cacheKey = getCapsCacheKey(caps.node, caps.ver)
    if (!ctx.discoInfoCache.has(cacheKey)) {
      void ctx.ensurePeerCapabilities(peerId, caps.node, caps.ver, caps.hash)
    } else {
      const cached = ctx.discoInfoCache.get(cacheKey)
      if (cached) {
        ctx.entityCapabilities.set(peerId, {
          peerId,
          jid: fromJid,
          node: caps.node,
          ver: caps.ver,
          hash: caps.hash,
          info: cached,
          discoveredAt: new Date().toISOString()
        })
      }
    }
  }

  switch (type) {
    case 'available':
      await ctx.recordPresence(fromJid, {
        ...presence,
        type: 'available'
      })
      return
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
    case 'error':
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

  if ((element.name === 'active' || element.name === 'inactive') && element.attrs.xmlns === 'urn:xmpp:csi:0') {
    ctx.setPeerClientState(peerId, element.name as 'active' | 'inactive')
    return
  }

  if (element.name === 'message') {
    const metadata = parseXepMetadata(element)

    let targetElement = element
    let carbonInfo: { type: 'sent' | 'received' } | undefined = undefined

    if (metadata.carbon) {
      targetElement = metadata.carbon.forwardedMessage
      carbonInfo = { type: metadata.carbon.type }
    }

    const resultEl = targetElement.getChild('result')
    if (resultEl && resultEl.attrs.xmlns === 'urn:xmpp:mam:2') {
      const forwardedEl = resultEl.getChild('forwarded')
      const innerMsg = forwardedEl?.getChild('message')
      if (innerMsg && innerMsg.attrs.type === 'groupchat') {
        void (ctx as any).muc.handleIncomingMamResult(targetElement, peerId).catch(() => {})
      } else {
        void ctx.handleIncomingMamResult(targetElement, peerId).catch(() => {})
      }
      return
    }

    const eventEl = targetElement.getChild('event')
    if (eventEl && eventEl.attrs.xmlns === PUBSUB_EVENT_XMLNS) {
      await handlePubSubMessageElementFromModule(peerId, targetElement, ctx.getPubSubContext())
      return
    }

    const innerFromJid = targetElement.attrs.from || fromJid
    const innerToJid = targetElement.attrs.to || toJid

    const secureCtx = ctx.getSecureContext()
    const wrappedSecureCtx = carbonInfo ? {
      ...secureCtx,
      emitMessage: (msg: any) => {
        secureCtx.emitMessage({
          ...msg,
          carbon: carbonInfo
        })
      }
    } : secureCtx

    if (await handleSecureMessageStanzaFromModule(targetElement, innerFromJid, innerToJid, wrappedSecureCtx)) {
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
