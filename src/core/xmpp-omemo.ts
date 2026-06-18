import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import { XmppOmemoBundle } from './xmpp-omemo-state.js'

const OMEMO_XMLNS = 'urn:xmpp:omemo:2'
const OMEMO_DEVICES_XMLNS = 'urn:xmpp:omemo:2:devices'
const OMEMO_DEVICES_NODE = 'urn:xmpp:omemo:2:devices'
const OMEMO_BUNDLES_NODE = 'urn:xmpp:omemo:2:bundles'

export interface XmppOmemoContext {
  ready: Promise<void>
  jid: string
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  jidFromPeerId(peerId: string): string
  sendIqRequest(peerAddr: string | Multiaddr, stanza: Element, timeoutMs?: number): Promise<Element>
  peerOmemoDeviceLists: Map<string, number[]>
  peerOmemoBundles: Map<string, Map<number, XmppOmemoBundle>>
}

export function parseOmemoDeviceListQuery(items: Element): number[] {
  const list = items.getChild('item')?.getChild('list')
  if (!list || list.attrs.xmlns !== OMEMO_DEVICES_XMLNS) {
    return []
  }

  return (list.children as any[])
    .filter(child => child?.name === 'device')
    .map((child: Element) => Number(child.attrs.id))
    .filter(deviceId => Number.isFinite(deviceId) && deviceId > 0)
}

export function parseOmemoBundleQuery(items: Element): XmppOmemoBundle | undefined {
  const item = items.getChild('item')
  if (!item) {
    return undefined
  }

  const bundle = item.getChild('bundle')
  if (!bundle || bundle.attrs.xmlns !== OMEMO_XMLNS) {
    return undefined
  }

  const identityKey = bundle.getChild('ik')?.text().trim()
  const signedPreKeyEl = bundle.getChild('spk')
  const signedPreKeySignature = bundle.getChild('spks')?.text().trim()
  if (!identityKey || !signedPreKeyEl || !signedPreKeySignature) {
    return undefined
  }

  const preKeys = (bundle.children as any[])
    .filter(child => child?.name === 'pk')
    .map((child: Element) => ({
      keyId: Number(child.attrs.id ?? child.attrs.keyId ?? child.attrs.signedPreKeyId ?? 0),
      publicKey: child.text().trim()
    }))
    .filter(preKey => Number.isFinite(preKey.keyId) && preKey.keyId > 0 && preKey.publicKey)

  return {
    deviceId: Number(item.attrs.id),
    registrationId: Number(item.attrs.registrationId ?? 0),
    identityKey,
    signedPreKeyId: Number(signedPreKeyEl.attrs.id ?? signedPreKeyEl.attrs.signedPreKeyId ?? 0),
    signedPreKey: signedPreKeyEl.text().trim(),
    signedPreKeySignature,
    preKeys
  }
}

export async function fetchOmemoDeviceList(ctx: XmppOmemoContext, peerAddr: string | Multiaddr): Promise<number[]> {
  await ctx.ready
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const iq = xml(
    'iq',
    {
      to: ctx.jidFromPeerId(peerId),
      from: ctx.jid,
      type: 'get',
      id: Math.random().toString(36).substring(2, 11)
    },
    xml(
      'pubsub',
      { xmlns: 'http://jabber.org/protocol/pubsub' },
      xml('items', { node: OMEMO_DEVICES_NODE })
    )
  )
  const result = await ctx.sendIqRequest(peerAddr, iq)
  const pubsub = result.getChild('pubsub')
  const items = pubsub?.getChild('items')
  const devices = items ? parseOmemoDeviceListQuery(items) : []
  if (devices.length > 0) {
    ctx.peerOmemoDeviceLists.set(peerId, devices)
  }
  return devices
}

export async function fetchOmemoBundle(ctx: XmppOmemoContext, peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle> {
  await ctx.ready
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const iq = xml(
    'iq',
    {
      to: ctx.jidFromPeerId(peerId),
      from: ctx.jid,
      type: 'get',
      id: Math.random().toString(36).substring(2, 11)
    },
    xml(
      'pubsub',
      { xmlns: 'http://jabber.org/protocol/pubsub' },
      xml(
        'items',
        { node: OMEMO_BUNDLES_NODE },
        xml('item', { id: String(deviceId) })
      )
    )
  )
  const result = await ctx.sendIqRequest(peerAddr, iq)
  const pubsub = result.getChild('pubsub')
  const items = pubsub?.getChild('items')
  const bundle = items ? parseOmemoBundleQuery(items) : undefined
  if (!bundle) {
    throw new Error(`No OMEMO bundle returned for device ${deviceId}`)
  }

  let bundles = ctx.peerOmemoBundles.get(peerId)
  if (!bundles) {
    bundles = new Map()
    ctx.peerOmemoBundles.set(peerId, bundles)
  }
  bundles.set(deviceId, bundle)
  return bundle
}

export async function getPeerOmemoDevices(ctx: XmppOmemoContext, peerAddr: string | Multiaddr): Promise<number[]> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const cached = ctx.peerOmemoDeviceLists.get(peerId)
  if (cached && cached.length > 0) {
    return cached
  }

  return await fetchOmemoDeviceList(ctx, peerAddr)
}

export async function getPeerOmemoBundle(ctx: XmppOmemoContext, peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const cached = ctx.peerOmemoBundles.get(peerId)?.get(deviceId)
  if (cached) {
    return cached
  }

  return await fetchOmemoBundle(ctx, peerAddr, deviceId)
}
