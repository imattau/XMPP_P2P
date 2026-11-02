import { Libp2p } from 'libp2p'
import { Element, Parser } from '@xmpp/xml'
import { XmppMucRoomSettings } from './xmpp-records.js'

const MUC_SETTINGS_INDEX_PREFIX = '/xmpp/muc/index/'
const MUC_SETTINGS_PREFIX = '/xmpp/muc/room/'
const DEFAULT_DHT_TTL_MS = 24 * 60 * 60 * 1000
const MAILBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000

const mailboxLocks = new Map<string, Promise<void>>()

interface DhtEnvelope<T> {
  data: T
  expiresAt?: string
}

function isExpired(entry: DhtEnvelope<unknown>): boolean {
  if (!entry.expiresAt) return false
  return Date.now() > new Date(entry.expiresAt).getTime()
}

function isDhtKeyNotFound(error: unknown): boolean {
  if (error instanceof AggregateError) {
    return error.errors.length > 0 && error.errors.every(isDhtKeyNotFound)
  }
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'NotFoundError'
}

export function mucSettingsIndexKey(peerId: string): Uint8Array {
  return new TextEncoder().encode(`${MUC_SETTINGS_INDEX_PREFIX}${peerId}`)
}

export function mucSettingsKey(roomName: string): Uint8Array {
  return new TextEncoder().encode(`${MUC_SETTINGS_PREFIX}${roomName}`)
}

export function mailboxKey(peerId: string): Uint8Array {
  return new TextEncoder().encode(`/xmpp/mailbox/queue/${peerId}`)
}

function getContentRouting(libp2p: Libp2p): any {
  const cr = (libp2p as any).contentRouting
  if (!cr?.get || !cr?.put) {
    console.warn('[DHT] contentRouting API not available — DHT operations will be skipped')
    return null
  }
  return cr
}

export async function readDhtJson<T>(libp2p: Libp2p, key: Uint8Array): Promise<T | undefined> {
  const contentRouting = getContentRouting(libp2p)
  if (!contentRouting) return undefined

  try {
    const keyStr = new TextDecoder().decode(key)
    const raw = await contentRouting.get(key)
    if (!raw) return undefined
    const envelope = JSON.parse(new TextDecoder().decode(raw)) as DhtEnvelope<T>
    if (isExpired(envelope as unknown as DhtEnvelope<unknown>)) {
      console.log(`[DHT] Key ${keyStr} expired, treating as not found`)
      return undefined
    }
    return envelope.data
  } catch (err: any) {
    console.debug(`[DHT] Failed to read key ${new TextDecoder().decode(key)}:`, err?.message)
    return undefined
  }
}

export async function writeDhtJson(libp2p: Libp2p, key: Uint8Array, value: unknown, ttlMs?: number): Promise<void> {
  const contentRouting = getContentRouting(libp2p)
  if (!contentRouting) return

  try {
    const keyStr = new TextDecoder().decode(key)
    trackDhtKey(key)
    const envelope: DhtEnvelope<unknown> = {
      data: value,
      ...(ttlMs ? { expiresAt: new Date(Date.now() + ttlMs).toISOString() } : {})
    }
    await contentRouting.put(key, new TextEncoder().encode(JSON.stringify(envelope)))
  } catch (err: any) {
    console.error(`[DHT] writeDhtJson failed for key ${new TextDecoder().decode(key)}:`, err?.message || err)
  }
}

export async function refreshDhtKey(libp2p: Libp2p, key: Uint8Array): Promise<void> {
  const value = await readDhtJson(libp2p, key)
  if (value !== undefined) {
    await writeDhtJson(libp2p, key, value, DEFAULT_DHT_TTL_MS)
  }
}

export async function removeDhtKey(libp2p: Libp2p, key: Uint8Array): Promise<void> {
  const contentRouting = getContentRouting(libp2p)
  if (!contentRouting) return
  try {
    await contentRouting.put(key, new TextEncoder().encode(JSON.stringify({ data: null, expiresAt: new Date(0).toISOString() })))
  } catch { }
}

export function isDhtAvailable(libp2p: Libp2p): boolean {
  return !!(libp2p as any).contentRouting?.get
}

const knownDhtKeys = new Set<string>()

export function trackDhtKey(key: Uint8Array): void {
  knownDhtKeys.add(new TextDecoder().decode(key))
}

export async function collectExpiredDhtEntries(libp2p: Libp2p): Promise<number> {
  let removed = 0
  for (const keyStr of knownDhtKeys) {
    const key = new TextEncoder().encode(keyStr)
    const value = await readDhtJson(libp2p, key)
    if (value === undefined) {
      await removeDhtKey(libp2p, key)
      removed++
    }
  }
  return removed
}

export function startDhtGarbageCollection(libp2p: Libp2p, intervalMs = 30 * 60 * 1000): () => void {
  const timer = setInterval(async () => {
    const removed = await collectExpiredDhtEntries(libp2p)
    if (removed > 0) {
      console.log(`[DHT GC] Removed ${removed} expired entries`)
    }
  }, intervalMs)
  return () => clearInterval(timer)
}

export interface XmppDhtContext {
  libp2p: Libp2p
  mucRooms: Map<string, XmppMucRoomSettings>
  ensureMucRoomSettings(roomName: string): Promise<any>
  handleStanza(peerId: string, element: Element): Promise<void>
  emit(event: string, ...args: any[]): boolean
}

export async function loadMucStateFromDht(ctx: XmppDhtContext): Promise<void> {
  const index = await readDhtJson<{ version: number; rooms: string[] }>(
    ctx.libp2p,
    mucSettingsIndexKey(ctx.libp2p.peerId.toString())
  )
  const roomNames = index?.rooms ?? []

  for (const roomName of roomNames) {
    await ctx.ensureMucRoomSettings(roomName)
  }
}

export async function persistMucStateToDht(ctx: XmppDhtContext): Promise<void> {
  const rooms = Array.from(ctx.mucRooms.values())
  await Promise.all(rooms.map(async (room) => {
    await writeDhtJson(ctx.libp2p, mucSettingsKey(room.roomName), room, DEFAULT_DHT_TTL_MS)
  }))

  await writeDhtJson(ctx.libp2p, mucSettingsIndexKey(ctx.libp2p.peerId.toString()), {
    version: 1,
    rooms: rooms.map(room => room.roomName)
  }, DEFAULT_DHT_TTL_MS)
}

export async function bufferStanzaToDht(libp2p: Libp2p, peerId: string, stanza: Element): Promise<void> {
  const contentRouting = getContentRouting(libp2p)
  if (!contentRouting) throw new Error('Offline delivery is unavailable because DHT content routing is not active')
  const key = mailboxKey(peerId)
  const prev = mailboxLocks.get(peerId) ?? Promise.resolve()
  const next = prev.then(async () => {
    let queue: string[] = []
    try {
      const raw = await contentRouting.get(key)
      if (raw) {
        const envelope = JSON.parse(new TextDecoder().decode(raw)) as DhtEnvelope<string[]>
        if (!isExpired(envelope) && envelope.data !== null) {
          if (!Array.isArray(envelope.data) || envelope.data.some((entry) => typeof entry !== 'string')) {
            throw new Error('DHT mailbox contains invalid data')
          }
          queue = envelope.data
        }
      }
    } catch (error) {
      if (!isDhtKeyNotFound(error)) {
        throw new Error(`Could not read the recipient’s DHT mailbox: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    queue.push(stanza.toString())
    trackDhtKey(key)
    const envelope: DhtEnvelope<string[]> = {
      data: queue,
      expiresAt: new Date(Date.now() + MAILBOX_TTL_MS).toISOString(),
    }
    await contentRouting.put(key, new TextEncoder().encode(JSON.stringify(envelope)))
  })
  mailboxLocks.set(peerId, next.catch(() => {}))
  return next
}

export async function flushDhtMailbox(ctx: XmppDhtContext): Promise<void> {
  const peerId = ctx.libp2p.peerId.toString()
  const contentRouting = getContentRouting(ctx.libp2p)
  if (!contentRouting) throw new Error('DHT mailbox is unavailable while content routing is offline')
  const key = mailboxKey(peerId)
  const previous = mailboxLocks.get(peerId) ?? Promise.resolve()
  const next = previous.then(async () => {
    let queue: string[]
    try {
      const raw = await contentRouting.get(key)
      if (!raw) return
      const envelope = JSON.parse(new TextDecoder().decode(raw)) as DhtEnvelope<string[]>
      if (isExpired(envelope) || envelope.data === null) return
      if (!Array.isArray(envelope.data) || envelope.data.some((entry) => typeof entry !== 'string')) {
        throw new Error('DHT mailbox contains invalid data')
      }
      queue = [...envelope.data]
    } catch (error) {
      if (isDhtKeyNotFound(error)) return
      throw new Error(`Could not read the local DHT mailbox: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (queue.length === 0) return

    console.log(`[DHT] Transitioned to active. Flushing ${queue.length} stanzas from DHT mailbox...`)
    while (queue.length > 0) {
      const xmlStr = queue[0]
      const element = await new Promise<Element>((resolve, reject) => {
        const parser = new Parser()
        parser.on('element', resolve)
        parser.on('error', reject)
        parser.write('<stream:stream>')
        parser.write(xmlStr)
      })
      const fromPeerId = element.attrs.from ? element.attrs.from.split('@')[0] : 'unknown'
      await ctx.handleStanza(fromPeerId, element)

      // Remove each stanza only after its handler has completed. If processing
      // fails or the tab closes, the current stanza and tail remain queued.
      queue.shift()
      const envelope: DhtEnvelope<string[]> = {
        data: queue,
        expiresAt: new Date(Date.now() + MAILBOX_TTL_MS).toISOString(),
      }
      await contentRouting.put(key, new TextEncoder().encode(JSON.stringify(envelope)))
    }
  })
  mailboxLocks.set(peerId, next.catch(() => {}))
  return next
}
