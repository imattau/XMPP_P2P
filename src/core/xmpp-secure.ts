import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { xml, Element } from '@xmpp/xml'
import * as openpgp from 'openpgp'
import type { Multiaddr } from '@multiformats/multiaddr'
import { PUBSUB_EVENT_XMLNS } from './xmpp-discovery.js'
import { loadOmemoModule, type OmemoAddress } from './omemo-runtime.js'
import { parseXepMetadata, buildXepElements, RECEIPTS_XMLNS } from './xmpp-xep-helpers.js'
import type { XmppStream } from './xmpp-stream.js'
import type {
  XmppMessage,
  XmppOpenPgpPublicKeyResponse
} from './xmpp-records.js'
import type { XmppOmemoBundle } from './xmpp-omemo-state.js'

const OMEMO_XMLNS = 'urn:xmpp:omemo:2'
const OPENPGP_XMLNS = 'urn:xmpp:openpgp:0'
const OPENPGP_PUBSUB_XMLNS = 'urn:xmpp:openpgp:pubsub:0'
const OPENPGP_IQ_XMLNS = 'urn:xmpp:openpgp:0'

interface XmppOmemoStore {
  store: Record<string, unknown>
  put: (key: string, value: unknown) => void
  get: <T = unknown>(key: string, defaultValue?: T) => T | undefined
  remove: (key: string) => void
  isTrustedIdentity: (address: string, identityKey: ArrayBuffer, direction: any) => boolean | Promise<boolean>
  loadIdentityKey: (address: string) => ArrayBuffer | undefined
  saveIdentity: (address: string, identityKey: ArrayBuffer) => boolean
  loadPreKey: (keyId: number) => Promise<{ keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer } } | undefined>
  storePreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => void
  removePreKey: (keyId: number) => void
  loadSignedPreKey: (keyId: number) => { keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer } } | undefined
  storeSignedPreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => void
  removeSignedPreKey: (keyId: number) => void
  loadSession: (address: string) => string | undefined
  removeAllSessions: (jid: string) => void
  removeSession: (address: string) => void
  storeSession: (address: string, record: string) => void
  getIdentityKeyPair: () => Promise<{ pubKey: ArrayBuffer; privKey: ArrayBuffer } | undefined>
  getLocalRegistrationId: () => Promise<number | undefined>
}

export interface XmppSecureContext {
  jid: string
  ready: Promise<void>
  jidFromPeerId(peerId: string): string
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs?: number): Promise<Element>
  emitMessage(message: XmppMessage): void
  emitError(error: unknown): void
  getOmemoDeviceIdOrThrow(): number
  getOmemoStore(): XmppOmemoStore
  getPeerOmemoDevices(peerAddr: string | Multiaddr): Promise<number[]>
  getPeerOmemoBundle(peerAddr: string | Multiaddr, deviceId: number): Promise<XmppOmemoBundle>
  getOpenPgpPrivateKeyOrThrow(): openpgp.PrivateKey
  getPubSubService(): {
    subscribe(topic: string): Promise<void>
    publish(topic: string, data: Uint8Array): Promise<void>
  }
  ensureTopicValidator(topic: string, kind: 'secure'): void
  getEncryptedTopicSecret(topic: string): string | undefined
  getPeerOpenPgpArmoredKey(peerId: string): string | undefined
  cachePeerOpenPgpKey(peerId: string, armoredKey: string): void
  sendOrBufferStanza(peerId: string, stanza: Element, peerAddr?: string | Multiaddr): Promise<void>
}

export async function decryptOmemoKey(ctx: XmppSecureContext, remoteAddress: OmemoAddress, payload: string): Promise<ArrayBuffer> {
  const omemo = await loadOmemoModule()
  const sessionCipher = new omemo.SessionCipher(ctx.getOmemoStore(), remoteAddress)
  try {
    return await sessionCipher.decryptPreKeyWhisperMessage(payload, 'base64')
  } catch (preKeyErr) {
    try {
      return await sessionCipher.decryptWhisperMessage(payload, 'base64')
    } catch (whisperErr) {
      throw whisperErr instanceof Error ? whisperErr : preKeyErr
    }
  }
}

export function decryptOmemoPayload(payload: string, payloadKey: ArrayBuffer, ivB64: string): string {
  const bytes = Buffer.from(payload, 'base64')
  if (bytes.byteLength < 16) {
    throw new Error('OMEMO payload is too short')
  }

  const tag = bytes.subarray(bytes.byteLength - 16)
  const ciphertext = bytes.subarray(0, bytes.byteLength - 16)
  const iv = Buffer.from(ivB64, 'base64')
  const decipher = createDecipheriv('aes-128-gcm', Buffer.from(payloadKey), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export async function ensureOmemoSession(ctx: XmppSecureContext, peerAddr: string | Multiaddr, deviceId: number): Promise<void> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerJid = ctx.jidFromPeerId(xmppStream.remotePeer.toString())
  const omemo = await loadOmemoModule()
  const remoteAddress = new omemo.OMEMOAddress(peerJid, deviceId)
  const store = ctx.getOmemoStore()
  const sessionCipher = new omemo.SessionCipher(store, remoteAddress)
  const hasOpenSession = await sessionCipher.hasOpenSession()
  if (hasOpenSession) {
    return
  }

  const bundle = await ctx.getPeerOmemoBundle(peerAddr, deviceId)
  const sessionBuilder = new omemo.SessionBuilder(store, remoteAddress)
  await sessionBuilder.processPreKey({
    registrationId: bundle.registrationId,
    identityKey: ctxToArrayBuffer(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKeyId,
      publicKey: ctxToArrayBuffer(bundle.signedPreKey),
      signature: ctxToArrayBuffer(bundle.signedPreKeySignature)
    },
    preKey: bundle.preKeys[0]
      ? {
          keyId: bundle.preKeys[0].keyId,
          publicKey: ctxToArrayBuffer(bundle.preKeys[0].publicKey)
        }
      : undefined
  })
}

function ctxToArrayBuffer(value: string): ArrayBuffer {
  const bytes = Buffer.from(value, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

export async function getPeerOpenPgpKey(peerAddr: string | Multiaddr, ctx: XmppSecureContext): Promise<openpgp.PublicKey> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  let armoredKey = ctx.getPeerOpenPgpArmoredKey(peerId)
  if (!armoredKey) {
    const response = await fetchOpenPgpPublicKey(peerAddr, ctx)
    armoredKey = response.publicKey
    ctx.cachePeerOpenPgpKey(peerId, armoredKey)
  }
  return await openpgp.readKey({ armoredKey })
}

async function decryptOpenPgpMessage(ctx: XmppSecureContext, payload: string): Promise<string> {
  const bytes = Buffer.from(payload.trim(), 'base64')
  const message = await openpgp.readMessage({ binaryMessage: bytes })
  const decrypted = await openpgp.decrypt({
    message,
    decryptionKeys: ctx.getOpenPgpPrivateKeyOrThrow(),
    format: 'utf8'
  })
  return typeof decrypted.data === 'string' ? decrypted.data : new TextDecoder().decode(decrypted.data as Uint8Array)
}

export async function handleSecureMessageStanza(
  element: Element,
  fromJid: string,
  toJid: string,
  ctx: XmppSecureContext
): Promise<boolean> {
  const metadata = parseXepMetadata(element)

  // Handle Receipt auto-reply if requested
  if (metadata.receipt?.type === 'request' && element.attrs.id) {
    void ctx.getOrCreateStream(fromJid).then(stream => {
      stream.send(
        xml('message', { to: fromJid, from: ctx.jid, id: Math.random().toString(36).substring(2, 11) },
          xml('received', { xmlns: RECEIPTS_XMLNS, id: element.attrs.id })
        )
      )
    }).catch(err => ctx.emitError(err))
  }

  // Handle Received receipt notification
  if (metadata.receipt?.type === 'received') {
    ctx.emitMessage({
      from: fromJid,
      to: toJid,
      body: '',
      id: element.attrs.id,
      type: element.attrs.type || 'chat',
      receipt: metadata.receipt,
      nickname: metadata.nick,
      originId: metadata.originId,
      stanzaId: metadata.stanzaId
    })
    return true
  }

  const omemoEl = element.getChild('encrypted')
  const openPgpEl = element.getChild('openpgp')
  const bodyEl = element.getChild('body')

  // If only a chatstate notification is present (no message content)
  if (metadata.chatState && !bodyEl && !omemoEl && !openPgpEl) {
    ctx.emitMessage({
      from: fromJid,
      to: toJid,
      body: '',
      id: element.attrs.id,
      type: element.attrs.type || 'chat',
      chatState: metadata.chatState,
      delay: metadata.delay,
      replace: metadata.replace,
      nickname: metadata.nick,
      originId: metadata.originId,
      stanzaId: metadata.stanzaId
    })
    return true
  }

  if (omemoEl && omemoEl.attrs.xmlns === OMEMO_XMLNS) {
    const headerEl = omemoEl.getChild('header')
    const payloadEl = omemoEl.getChild('payload')
    const sid = Number(headerEl?.attrs.sid ?? 0)
    const ivEl = headerEl?.getChild('iv')
    const keysEl = (headerEl?.children as any[] ?? []).filter(child => child?.name === 'keys') as Element[]
    const payload = payloadEl?.text().trim()
    const iv = ivEl?.text().trim()
    const rid = ctx.getOmemoDeviceIdOrThrow()
    const keyEl = keysEl
      .flatMap(keys => (keys.children as any[]).filter(child => child?.name === 'key'))
      .find((child: Element) => Number(child.attrs.rid ?? 0) === rid)

    if (headerEl && payload && iv && keyEl && Number.isFinite(sid) && sid > 0) {
      const omemo = await loadOmemoModule()
      const remoteAddress = new omemo.OMEMOAddress(fromJid, sid)
      const encryptedKey = keyEl.text().trim()
      const payloadKey = await decryptOmemoKey(ctx, remoteAddress, encryptedKey)
      const body = decryptOmemoPayload(payload, payloadKey, iv)
      ctx.emitMessage({
        from: fromJid,
        to: toJid,
        body,
        id: element.attrs.id,
        type: element.attrs.type || 'chat',
        encrypted: true,
        encryption: 'omemo',
        receipt: metadata.receipt,
        chatState: metadata.chatState,
        delay: metadata.delay,
        replace: metadata.replace,
        nickname: metadata.nick,
        originId: metadata.originId,
        stanzaId: metadata.stanzaId
      })
      return true
    }
  }

  if (openPgpEl && openPgpEl.attrs.xmlns === OPENPGP_XMLNS) {
    const payload = openPgpEl.text().trim()
    if (payload) {
      const body = await decryptOpenPgpMessage(ctx, payload)
      ctx.emitMessage({
        from: fromJid,
        to: toJid,
        body,
        id: element.attrs.id,
        type: element.attrs.type || 'chat',
        encrypted: true,
        encryption: 'openpgp',
        receipt: metadata.receipt,
        chatState: metadata.chatState,
        delay: metadata.delay,
        replace: metadata.replace,
        nickname: metadata.nick,
        originId: metadata.originId,
        stanzaId: metadata.stanzaId
      })
      return true
    }
  }

  if (bodyEl) {
    ctx.emitMessage({
      from: fromJid,
      to: toJid,
      body: bodyEl.text(),
      id: element.attrs.id,
      type: element.attrs.type || 'chat',
      receipt: metadata.receipt,
      chatState: metadata.chatState,
      delay: metadata.delay,
      replace: metadata.replace,
      nickname: metadata.nick,
      originId: metadata.originId,
      stanzaId: metadata.stanzaId
    })
    return true
  }

  return false
}

export async function sendEncryptedMessage(
  peerAddr: string | Multiaddr,
  body: string,
  ctx: XmppSecureContext,
  options: {
    replace?: string
    requestReceipt?: boolean
    chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
    delay?: { stamp: string; from?: string }
    nick?: string
  } = {}
): Promise<string> {
  await ctx.ready
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const toJid = ctx.jidFromPeerId(peerId)
  const itemId = Math.random().toString(36).substring(2, 15)
  const devices = await ctx.getPeerOmemoDevices(peerAddr)
  if (devices.length === 0) {
    throw new Error(`No OMEMO devices available for ${toJid}`)
  }

  const payloadKeyBytes = randomBytes(16)
  const iv = randomBytes(12)

  const cipher = createCipheriv('aes-128-gcm', payloadKeyBytes, iv)
  const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const payload = Buffer.concat([ciphertext, authTag]).toString('base64')

  const keys: Element[] = []
  for (const deviceId of devices) {
    await ensureOmemoSession(ctx, peerAddr, deviceId)
    const omemo = await loadOmemoModule()
    const remoteAddress = new omemo.OMEMOAddress(toJid, deviceId)
    const sessionCipher = new omemo.SessionCipher(ctx.getOmemoStore(), remoteAddress)
    const encryptedKey = await sessionCipher.encrypt(payloadKeyBytes)
    keys.push(xml('key', { rid: String(deviceId) }, Buffer.from(encryptedKey.body, 'binary').toString('base64')))
  }

  const children: Element[] = [
    xml(
      'encrypted',
      { xmlns: OMEMO_XMLNS },
      xml(
        'header',
        { sid: String(ctx.getOmemoDeviceIdOrThrow()) },
        xml('keys', { jid: toJid }, ...keys),
        xml('iv', {}, iv.toString('base64'))
      ),
      xml('payload', {}, payload)
    )
  ]

  children.push(...buildXepElements({
    ...options,
    delay: options.delay ? {
      stamp: options.delay.stamp,
      from: options.delay.from ?? ctx.jid
    } : undefined,
    originId: itemId,
    stanzaId: { id: itemId, by: ctx.jid }
  }))

  const stanza = xml(
    'message',
    {
      to: toJid,
      from: ctx.jid,
      type: 'chat',
      id: itemId
    },
    ...children
  )

  await ctx.sendOrBufferStanza(peerId, stanza, peerAddr)
  return itemId
}

export async function fetchOpenPgpPublicKey(
  peerAddr: string | Multiaddr,
  ctx: XmppSecureContext
): Promise<XmppOpenPgpPublicKeyResponse> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const id = Math.random().toString(36).substring(2, 11)
  const toJid = ctx.jidFromPeerId(xmppStream.remotePeer.toString())

  const iq = xml(
    'iq',
    {
      to: toJid,
      from: ctx.jid,
      type: 'get',
      id
    },
    xml('query', { xmlns: OPENPGP_IQ_XMLNS })
  )

  const result = await ctx.sendIqRequest(peerAddr, iq)
  const query = result.getChild('query')
  if (!query) {
    throw new Error('OpenPGP key response missing query payload')
  }

  const pubkeyEl = query.getChild('pubkey')
  const publicKey = pubkeyEl?.text().trim()
  const fingerprint = pubkeyEl?.attrs.fingerprint || ''
  if (!publicKey || !fingerprint) {
    throw new Error('OpenPGP key response missing public key material')
  }

  return { fingerprint, publicKey }
}

export async function registerPeerOpenPgpPublicKey(
  peerAddr: string | Multiaddr,
  armoredKey: string,
  ctx: XmppSecureContext
): Promise<string> {
  const xmppStream = await ctx.getOrCreateStream(peerAddr)
  const peerId = xmppStream.remotePeer.toString()
  const key = await openpgp.readKey({ armoredKey })
  ctx.cachePeerOpenPgpKey(peerId, armoredKey)
  return key.getFingerprint()
}

export async function publishEncrypted(
  topic: string,
  body: string,
  ctx: XmppSecureContext,
  options: { keyId?: string; secret?: string; itemId?: string } = {}
): Promise<string> {
  const pubsub = ctx.getPubSubService()
  const secret = options.secret ?? ctx.getEncryptedTopicSecret(topic)
  const keyId = options.keyId ?? 'default'
  if (!secret) {
    throw new Error(`No OpenPGP shared secret configured for topic ${topic}`)
  }

  ctx.ensureTopicValidator(topic, 'secure')
  await pubsub.subscribe(topic)

  const message = await openpgp.createMessage({ text: body })
  const encrypted = await openpgp.encrypt({
    message,
    passwords: secret,
    format: 'binary'
  })
  const payload = Buffer.from(encrypted as Uint8Array).toString('base64')
  const itemId = options.itemId ?? Math.random().toString(36).substring(2, 11)
  const stanza = xml(
    'message',
    {
      from: ctx.jid,
      to: 'pubsub.p2p',
      type: 'headline'
    },
    xml(
      'event',
      { xmlns: PUBSUB_EVENT_XMLNS },
      xml(
        'items',
        { node: topic },
        xml(
          'item',
          { id: itemId, key: keyId },
          xml('encrypted', { xmlns: OPENPGP_PUBSUB_XMLNS, key: keyId }, payload)
        )
      )
    )
  )

  await pubsub.publish(topic, new TextEncoder().encode(stanza.toString()))
  return itemId
}
