import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import { XmppRosterEntry, XmppRosterSubscription } from './xmpp-records.js'
import { buildCapsElement } from './xmpp-discovery.js'

export interface XmppRosterContext {
  jid: string
  ready: Promise<void>
  selfPresence: { type: 'available' | 'unavailable'; status?: string; show?: string }
  setSelfPresence(presence: { type: 'available' | 'unavailable'; status?: string; show?: string }): void
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  getStreamByJid(jid: string): XmppStream | undefined
  getStreams(): Map<string, XmppStream>
  upsertRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): Promise<XmppRosterEntry>
  deleteRosterEntry(jid: string): Promise<void>
  requestRosterFromPeer(peerAddr: string | Multiaddr): Promise<XmppRosterEntry[]>
  subscriptionToFlags(subscription: XmppRosterSubscription): { to: boolean; from: boolean }
  flagsToSubscription(to: boolean, from: boolean): XmppRosterSubscription
  jidFromPeerId(peerId: string): string
  emitPresenceSubscribe(fromJid: string): void
  emitPresenceSubscribed(fromJid: string): void
  emitPresenceUnsubscribe(fromJid: string): void
  emitPresenceUnsubscribed(fromJid: string): void
  discoveryNode: string
  discoveryIdentity: any
  collections: any
}

export async function handleSubscribe(ctx: XmppRosterContext, peerId: string, fromJid: string) {
  const entry = await ctx.upsertRosterEntry({ jid: fromJid })
  const flags = ctx.subscriptionToFlags(entry.subscription)
  await ctx.upsertRosterEntry({
    jid: fromJid,
    subscription: ctx.flagsToSubscription(flags.to, true),
    ask: undefined
  })
  await sendPresenceToPeer(ctx, peerId, 'subscribed')
  await sendCurrentPresenceToPeer(ctx, peerId)
  ctx.emitPresenceSubscribe(fromJid)
}

export async function handleSubscribed(ctx: XmppRosterContext, fromJid: string) {
  const entry = await ctx.upsertRosterEntry({ jid: fromJid })
  const flags = ctx.subscriptionToFlags(entry.subscription)
  await ctx.upsertRosterEntry({
    jid: fromJid,
    subscription: ctx.flagsToSubscription(true, flags.from),
    ask: undefined
  })
  ctx.emitPresenceSubscribed(fromJid)
}

export async function handleUnsubscribe(ctx: XmppRosterContext, peerId: string, fromJid: string) {
  const entry = await ctx.upsertRosterEntry({ jid: fromJid })
  const flags = ctx.subscriptionToFlags(entry.subscription)
  await ctx.upsertRosterEntry({
    jid: fromJid,
    subscription: ctx.flagsToSubscription(false, flags.from),
    ask: undefined
  })
  await sendPresenceToPeer(ctx, peerId, 'unsubscribed')
  ctx.emitPresenceUnsubscribe(fromJid)
}

export async function handleUnsubscribed(ctx: XmppRosterContext, fromJid: string) {
  const entry = await ctx.upsertRosterEntry({ jid: fromJid })
  const flags = ctx.subscriptionToFlags(entry.subscription)
  await ctx.upsertRosterEntry({
    jid: fromJid,
    subscription: ctx.flagsToSubscription(flags.to, false),
    ask: undefined
  })
  ctx.emitPresenceUnsubscribed(fromJid)
}

export async function sendCurrentPresenceToPeer(ctx: XmppRosterContext, peerId: string) {
  const presenceType = ctx.selfPresence.type === 'unavailable' ? 'unavailable' : undefined
  await sendPresenceToPeer(ctx, peerId, presenceType, ctx.selfPresence.status, ctx.selfPresence.show)
}

export async function sendPresenceToPeer(ctx: XmppRosterContext, peerId: string, type?: string, status?: string, show?: string) {
  const xmppStream = ctx.getStreamByJid(ctx.jidFromPeerId(peerId)) || ctx.getStreams().get(peerId)
  if (!xmppStream) {
    return
  }

  const presAttrs: Record<string, string> = {
    to: ctx.jidFromPeerId(peerId),
    from: ctx.jid
  }
  if (type) {
    presAttrs.type = type
  }

  const children: Element[] = []
  if (show) {
    children.push(xml('show', {}, show))
  }
  if (status) {
    children.push(xml('status', {}, status))
  }
  if (!type || type === 'available') {
    children.push(buildCapsElement(ctx.discoveryNode, ctx.discoveryIdentity, ctx.collections))
  }

  const pres = children.length > 0
    ? xml('presence', presAttrs, ...children)
    : xml('presence', presAttrs)

  xmppStream.send(pres)
}

export async function sendPresence(ctx: XmppRosterContext, peerAddr: string | Multiaddr, type?: string, status?: string, show?: string) {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const toJid = xmppStream.remotePeer.toString() + '@p2p'

  const presAttrs: Record<string, string> = {
    to: toJid,
    from: ctx.jid
  }
  if (type) {
    presAttrs.type = type
  }

  const children: Element[] = []
  if (show) {
    children.push(xml('show', {}, show))
  }
  if (status) {
    children.push(xml('status', {}, status))
  }

  const pres = children.length > 0
    ? xml('presence', presAttrs, ...children)
    : xml('presence', presAttrs)

  xmppStream.send(pres)
}

export async function addRosterEntry(ctx: XmppRosterContext, jid: string, name?: string): Promise<XmppRosterEntry> {
  const entry = await ctx.upsertRosterEntry({
    jid,
    name,
    subscription: 'to',
    ask: 'subscribe'
  })

  const stream = ctx.getStreamByJid(jid)
  if (stream) {
    await sendPresenceToPeer(ctx, stream.remotePeer, 'subscribe')
  }

  return entry
}

export async function removeRosterEntry(ctx: XmppRosterContext, jid: string): Promise<void> {
  const stream = ctx.getStreamByJid(jid)
  if (stream) {
    await sendPresenceToPeer(ctx, stream.remotePeer, 'unsubscribe')
  }

  await ctx.deleteRosterEntry(jid)
}

export async function subscribePresence(ctx: XmppRosterContext, peerAddr: string | Multiaddr): Promise<void> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const jid = xmppStream.remotePeer.toString() + '@p2p'
  await ctx.upsertRosterEntry({
    jid,
    subscription: 'to',
    ask: 'subscribe'
  })
  await sendPresence(ctx, peerAddr, 'subscribe')
}

export async function unsubscribePresence(ctx: XmppRosterContext, peerAddr: string | Multiaddr): Promise<void> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const jid = xmppStream.remotePeer.toString() + '@p2p'
  await ctx.upsertRosterEntry({
    jid,
    subscription: 'none',
    ask: 'unsubscribe'
  })
  await sendPresence(ctx, peerAddr, 'unsubscribe')
}

export async function broadcastPresence(ctx: XmppRosterContext, type?: string, status?: string, show?: string) {
  await ctx.ready
  const normalizedType = type === 'unavailable' ? 'unavailable' : 'available'
  ctx.setSelfPresence({
    type: normalizedType,
    status,
    show
  })

  for (const peerId of ctx.getStreams().keys()) {
    await sendCurrentPresenceToPeer(ctx, peerId)
  }
}
