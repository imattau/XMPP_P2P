import { Libp2p } from 'libp2p'
import { Element, Parser } from '@xmpp/xml'
import { XmppMucRoomSettings } from './xmpp-records.js'

const MUC_SETTINGS_INDEX_PREFIX = '/xmpp/muc/index/'
const MUC_SETTINGS_PREFIX = '/xmpp/muc/room/'

export function mucSettingsIndexKey(peerId: string): Uint8Array {
  return new TextEncoder().encode(`${MUC_SETTINGS_INDEX_PREFIX}${peerId}`)
}

export function mucSettingsKey(roomName: string): Uint8Array {
  return new TextEncoder().encode(`${MUC_SETTINGS_PREFIX}${roomName}`)
}

export function mailboxKey(peerId: string): Uint8Array {
  return new TextEncoder().encode(`/xmpp/mailbox/queue/${peerId}`)
}

export async function readDhtJson<T>(libp2p: Libp2p, key: Uint8Array): Promise<T | undefined> {
  const contentRouting = (libp2p as any).contentRouting
  if (!contentRouting?.get) {
    console.log('[DEBUG DHT] readDhtJson: contentRouting.get not available')
    return undefined
  }

  try {
    const keyStr = new TextDecoder().decode(key)
    console.log(`[DEBUG DHT] readDhtJson starting for key: ${keyStr}`)
    const value = await contentRouting.get(key)
    console.log(`[DEBUG DHT] readDhtJson success for key: ${keyStr}`)
    return JSON.parse(new TextDecoder().decode(value)) as T
  } catch (err: any) {
    console.error(`[DEBUG DHT] readDhtJson failed:`, err?.message || err)
    return undefined
  }
}

export async function writeDhtJson(libp2p: Libp2p, key: Uint8Array, value: unknown): Promise<void> {
  const contentRouting = (libp2p as any).contentRouting
  if (!contentRouting?.put) {
    console.log('[DEBUG DHT] writeDhtJson: contentRouting.put not available')
    return
  }

  try {
    const keyStr = new TextDecoder().decode(key)
    console.log(`[DEBUG DHT] writeDhtJson starting for key: ${keyStr}`)
    await contentRouting.put(key, new TextEncoder().encode(JSON.stringify(value)))
    console.log(`[DEBUG DHT] writeDhtJson success for key: ${keyStr}`)
  } catch (err: any) {
    console.error(`[DEBUG DHT] writeDhtJson failed:`, err?.message || err)
  }
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
    await writeDhtJson(ctx.libp2p, mucSettingsKey(room.roomName), room)
  }))

  await writeDhtJson(ctx.libp2p, mucSettingsIndexKey(ctx.libp2p.peerId.toString()), {
    version: 1,
    rooms: rooms.map(room => room.roomName)
  })
}

export async function bufferStanzaToDht(libp2p: Libp2p, peerId: string, stanza: Element): Promise<void> {
  const key = mailboxKey(peerId)
  let queue = await readDhtJson<string[]>(libp2p, key)
  if (!Array.isArray(queue)) {
    queue = []
  }
  queue.push(stanza.toString())
  await writeDhtJson(libp2p, key, queue)
}

export async function flushDhtMailbox(ctx: XmppDhtContext): Promise<void> {
  const key = mailboxKey(ctx.libp2p.peerId.toString())
  const queue = await readDhtJson<string[]>(ctx.libp2p, key)
  if (Array.isArray(queue) && queue.length > 0) {
    console.log(`[DEBUG] Transitioned to active. Flushing ${queue.length} stanzas from DHT mailbox...`)
    await writeDhtJson(ctx.libp2p, key, [])

    for (const xmlStr of queue) {
      try {
        const parser = new Parser()
        parser.on('element', (element: Element) => {
          const peerId = element.attrs.from ? element.attrs.from.split('@')[0] : 'unknown'
          void ctx.handleStanza(peerId, element).catch(err => ctx.emit('error', err))
        })
        parser.write('<stream:stream>')
        parser.write(xmlStr)
      } catch (err) {
        console.error('[DEBUG] Failed to parse buffered stanza from DHT mailbox:', err)
      }
    }
  }
}
