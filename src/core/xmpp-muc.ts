/**
 * @packageDocumentation Multi-User Chat room management, occupant tracking, and group
 * message handling, including secure room variants.
 */

import { xml, Element, Parser } from '@xmpp/xml'
import { randomBytes, createCipheriv } from 'crypto'
import { loadOmemoModule } from './omemo-runtime.js'
import { decryptOmemoKey, decryptOmemoPayload, ensureOmemoSession } from './xmpp-secure.js'
import { TopicValidatorResult } from '@libp2p/gossipsub'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import {
  XmppMucRoomSettings,
  XmppMucMessage,
  normalizeMucRoomSettings,
  normalizeMucMessage
} from './xmpp-records.js'
import { XmppStorage } from './storage/types.js'
import {
  loadMucStateFromDht,
  persistMucStateToDht,
  mucSettingsKey,
  readDhtJson,
  writeDhtJson
} from './xmpp-dht.js'
import {
  loadMucState,
  loadMucHistoryState,
  persistMucState,
  persistMucHistoryState
} from './xmpp-persistence.js'

export const MUC_XMLNS = 'http://jabber.org/protocol/muc'
const MUC_USER_XMLNS = 'http://jabber.org/protocol/muc#user'
const MUC_HISTORY_LIMIT = 500

/**
 * Represents a live participant in a MUC room.
 */
export interface MucOccupant {
  nick: string
  peerId: string
  jid: string
  occupantJid: string
  lastSeen: string
}

/**
 * Live room state tracked by the MUC manager.
 */
export interface MucRoomState {
  name: string
  topic: string
  localNick: string
  defaultSecure: boolean
  autoJoin: boolean
  communityId?: string
  archived?: boolean
  occupants: Map<string, MucOccupant>
}

/**
 * Persisted room configuration settings.
 */
export interface MucRoomSettings {
  topic?: string
  defaultSecure: boolean
  autoJoin: boolean
  communityId?: string
  archived?: boolean
}

/**
 * Dependencies required by the MUC manager.
 */
export interface XmppMucContext {
  jid: string
  libp2p: any
  storage: XmppStorage
  ready: Promise<void>
  getPubSubService(): any
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs?: number): Promise<Element>
  sendIqResult(peerId: string, id: string, payload?: Element): Promise<void>
  sendIqError(peerId: string, element: Element, condition: string, type?: string, text?: string): Promise<void>
  emit(event: string, ...args: any[]): boolean
  handleStanza(peerId: string, element: Element): Promise<void>
  getSelfNick(): string
  getPeerOmemoDevices(jid: string): Promise<number[]>
  getOmemoStore(): any
  getSecureContext(): any
  getOmemoDeviceIdOrThrow(): number
}

function validateRoomName(roomName: string) {
  if (!roomName || roomName.trim().length === 0) {
    throw new Error('MUC room name is required')
  }
}

function validateNick(nick: string) {
  if (!nick || nick.trim().length === 0) {
    throw new Error('MUC nickname is required')
  }
}

function buildRoomJid(roomName: string): string {
  validateRoomName(roomName)
  return `${roomName}@muc.p2p`
}

function buildOccupantJid(roomName: string, nick: string): string {
  validateRoomName(roomName)
  validateNick(nick)
  return `${buildRoomJid(roomName)}/${nick}`
}

function parseRoomAndNick(jid: string | undefined, fromPeerId: string): { roomName: string; nick: string } | undefined {
  if (!jid) {
    return undefined
  }

  const slashIdx = jid.lastIndexOf('/')
  if (slashIdx === -1 || slashIdx === jid.length - 1) {
    return undefined
  }

  const roomJid = jid.slice(0, slashIdx)
  const nick = jid.slice(slashIdx + 1)
  if (!roomJid.endsWith('@muc.p2p')) {
    return undefined
  }

  const roomNameFixed = roomJid.slice(0, roomJid.length - '@muc.p2p'.length)
  if (!roomNameFixed) {
    return undefined
  }

  return {
    roomName: roomNameFixed,
    nick: nick || fromPeerId
  }
}

function buildMucUserPayload(roomName: string, nick: string, participantJid: string, type?: 'available' | 'unavailable'): Element {
  const attrs: Record<string, string> = {
    affiliation: type === 'unavailable' ? 'none' : 'member',
    jid: participantJid,
    nick,
    role: type === 'unavailable' ? 'none' : 'participant'
  }

  return xml('x', { xmlns: MUC_USER_XMLNS }, xml('item', attrs))
}

function buildMucPresence(roomName: string, nick: string, participantJid: string, type?: 'available' | 'unavailable'): Element {
  const attrs: Record<string, string> = {
    from: buildOccupantJid(roomName, nick),
    to: buildRoomJid(roomName)
  }
  if (type === 'unavailable') {
    attrs.type = 'unavailable'
  }

  const children: Element[] = [buildMucUserPayload(roomName, nick, participantJid, type)]
  if (!type || type === 'available') {
    children.unshift(xml('x', { xmlns: MUC_XMLNS }))
  }

  return xml('presence', attrs, ...children)
}

function buildGroupchatMessage(roomName: string, nick: string, children: Element[], id?: string): Element {
  const msgId = id || Math.random().toString(36).substring(2, 15)
  const fromJid = buildOccupantJid(roomName, nick)

  if (!children.some(c => c.name === 'origin-id')) {
    children.push(xml('origin-id', { xmlns: 'urn:xmpp:sid:0', id: msgId }))
  }
  if (!children.some(c => c.name === 'stanza-id')) {
    children.push(xml('stanza-id', { xmlns: 'urn:xmpp:sid:0', id: msgId, by: fromJid }))
  }

  return xml(
    'message',
    {
      from: fromJid,
      to: buildRoomJid(roomName),
      type: 'groupchat',
      id: msgId
    },
    ...children
  )
}

function parseReplyElement(element: Element): { id: string; to?: string } | undefined {
  const replyEl = element.getChild('reply')
  if (!replyEl || replyEl.attrs.xmlns !== 'urn:xmpp:reply:0' || !replyEl.attrs.id) {
    return undefined
  }

  return {
    id: replyEl.attrs.id,
    to: replyEl.attrs.to
  }
}

function parseThreadElement(element: Element): string | undefined {
  const threadEl = element.getChild('thread')
  const thread = threadEl?.text().trim()
  return thread || undefined
}

/**
 * Manager class that encapsulates multi-user chat (MUC) rooms, occupancy tracking,
 * message histories, configuration state persistence, and OMEMO end-to-end group encryption.
 */
export class XmppMucManager {
  private ctx: XmppMucContext
  private rooms = new Map<string, MucRoomState>()
  private presenceInterval?: NodeJS.Timeout

  public readonly mucRooms = new Map<string, XmppMucRoomSettings>()
  public readonly mucHistory = new Map<string, XmppMucMessage>()
  private mucSaveQueue: Promise<void> = Promise.resolve()
  private mucHistorySaveQueue: Promise<void> = Promise.resolve()

  constructor(ctx: XmppMucContext) {
    this.ctx = ctx
    this.presenceInterval = setInterval(() => {
      for (const [roomName, roomState] of this.rooms.entries()) {
        void this.broadcastPresence(roomName, roomState.localNick, 'available').catch(() => {})
      }
    }, 1500)
  }

  public async initialize(): Promise<void> {
    await this.loadMucState()
    await this.loadMucHistory()
  }

  public async loadMucState(): Promise<void> {
    const dhtCtx = {
      libp2p: this.ctx.libp2p,
      mucRooms: this.mucRooms,
      ensureMucRoomSettings: this.ensureMucRoomSettings.bind(this),
      handleStanza: this.ctx.handleStanza.bind(this.ctx),
      emit: this.ctx.emit.bind(this)
    }
    await loadMucStateFromDht(dhtCtx).catch(err => {
      console.error('[XMPP] Failed to load MUC state from DHT:', err)
    })

    if (this.mucRooms.size === 0) {
      await loadMucState({
        storage: this.ctx.storage,
        mucRooms: this.mucRooms,
        normalizeMucRoomSettings
      } as any)
    }

    for (const settings of this.mucRooms.values()) {
      if (settings.autoJoin) {
        await this.joinRoom(settings.roomName, this.ctx.getSelfNick())
      }
    }
  }

  private async loadMucHistory(): Promise<void> {
    await loadMucHistoryState({
      storage: this.ctx.storage,
      mucHistory: this.mucHistory,
      normalizeMucMessage,
      mucHistoryKey: (room: string, id: string) => `${room}:${id}`
    } as any, MUC_HISTORY_LIMIT)
  }

  public async persistMucState(): Promise<void> {
    const dhtCtx = {
      libp2p: this.ctx.libp2p,
      mucRooms: this.mucRooms,
      ensureMucRoomSettings: this.ensureMucRoomSettings.bind(this),
      handleStanza: this.ctx.handleStanza.bind(this.ctx),
      emit: this.ctx.emit.bind(this)
    }
    await persistMucStateToDht(dhtCtx)
    await persistMucState({
      storage: this.ctx.storage,
      mucRooms: this.mucRooms
    } as any)
  }

  private async persistMucHistory(): Promise<void> {
    await persistMucHistoryState({
      storage: this.ctx.storage,
      mucHistory: this.mucHistory
    } as any)
  }

  public scheduleMucPersist(): Promise<void> {
    this.mucSaveQueue = this.mucSaveQueue
      .then(() => this.persistMucState())
      .catch(err => {
        console.error('[XMPP] Failed to persist MUC state:', err)
      })
    return this.mucSaveQueue
  }

  public scheduleMucHistoryPersist(): Promise<void> {
    this.mucHistorySaveQueue = this.mucHistorySaveQueue
      .then(() => this.persistMucHistory())
      .catch(err => {
        console.error('[XMPP] Failed to persist MUC history:', err)
      })
    return this.mucHistorySaveQueue
  }

  public async ensureMucRoomSettings(roomName: string): Promise<MucRoomSettings | undefined> {
    const existing = this.mucRooms.get(roomName)
    if (existing) {
      return {
        topic: existing.topic,
        defaultSecure: existing.defaultMode === 'secure',
        autoJoin: existing.autoJoin,
        communityId: existing.communityId,
        archived: existing.archived
      }
    }

    const settings = await readDhtJson<XmppMucRoomSettings>(this.ctx.libp2p, mucSettingsKey(roomName))
    if (!settings) {
      return undefined
    }

    const normalized = normalizeMucRoomSettings(settings)
    this.mucRooms.set(roomName, normalized)
    return {
      topic: normalized.topic,
      defaultSecure: normalized.defaultMode === 'secure',
      autoJoin: normalized.autoJoin,
      communityId: normalized.communityId,
      archived: normalized.archived
    }
  }

  public getMucRoomSettings(roomName: string): MucRoomSettings | undefined {
    const settings = this.mucRooms.get(roomName)
    if (!settings) return undefined
    return {
      topic: settings.topic,
      defaultSecure: settings.defaultMode === 'secure',
      autoJoin: settings.autoJoin,
      communityId: settings.communityId,
      archived: settings.archived
    }
  }

  public setMucRoomSettings(roomName: string, settings: MucRoomSettings): void {
    this.mucRooms.set(roomName, {
      roomName,
      topic: settings.topic?.trim() || undefined,
      communityId: settings.communityId?.trim() || undefined,
      defaultMode: settings.defaultSecure ? 'secure' : 'open',
      autoJoin: settings.autoJoin,
      archived: settings.archived,
      updatedAt: new Date().toISOString()
    })
  }

  public async updateMucRoomSettings(roomName: string, settings: { topic?: string; defaultMode?: 'secure' | 'open'; autoJoin?: boolean; communityId?: string; archived?: boolean }): Promise<void> {
    const normalized = normalizeMucRoomSettings({
      roomName,
      topic: settings.topic,
      defaultMode: settings.defaultMode,
      autoJoin: settings.autoJoin,
      communityId: settings.communityId,
      archived: settings.archived,
      updatedAt: new Date().toISOString()
    })

     this.mucRooms.set(roomName, normalized)
     this.setRoomSettings(roomName, {
       topic: normalized.topic,
       defaultSecure: normalized.defaultMode === 'secure',
       autoJoin: normalized.autoJoin,
       communityId: normalized.communityId,
       archived: normalized.archived
     })
     await this.scheduleMucPersist()
   }

   public async recordMucMessage(msg: XmppMucMessage): Promise<boolean> {
     await this.ctx.ready
     const normalized = normalizeMucMessage(msg)
     const key = `${normalized.room}:${normalized.id}`
     if (this.mucHistory.has(key)) {
       return false
     }

     this.mucHistory.set(key, normalized)

     while (this.mucHistory.size > MUC_HISTORY_LIMIT) {
       const oldestKey = this.mucHistory.keys().next().value as string | undefined
       if (!oldestKey) {
         break
       }
       this.mucHistory.delete(oldestKey)
     }

     await this.scheduleMucHistoryPersist()
     return true
   }

   public getMucHistory(room: string): XmppMucMessage[] {
     return Array.from(this.mucHistory.values())
       .filter(msg => msg.room === room)
       .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
   }

  async close(): Promise<void> {
    await this.mucSaveQueue
    await this.mucHistorySaveQueue
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval)
      this.presenceInterval = undefined
    }
  }

  getRoomTopic(roomName: string): string {
    return `xmpp/muc/${roomName}`
  }

  getRooms(): string[] {
    return Array.from(this.rooms.keys())
  }

  getRoomState(roomName: string): MucRoomState | undefined {
    return this.rooms.get(roomName)
  }

  async joinRoom(roomName: string, nick: string): Promise<void> {
    validateRoomName(roomName)
    validateNick(nick)
    const topic = this.getRoomTopic(roomName)
    const pubsub = this.ctx.getPubSubService()
    const existingSettings = await this.ensureMucRoomSettings(roomName)

    await pubsub.subscribe(topic)
    await pubsub.subscribe(`${topic}/messages`)
    await pubsub.subscribe(`${topic}/presence`)

    const roomState: MucRoomState = {
      name: roomName,
      topic,
      localNick: nick,
      defaultSecure: existingSettings?.defaultSecure ?? true,
      autoJoin: existingSettings?.autoJoin ?? true,
      communityId: existingSettings?.communityId,
      archived: existingSettings?.archived,
      occupants: new Map<string, MucOccupant>()
    }
    this.rooms.set(roomName, roomState)

    // Broadcast join presence
    await this.broadcastPresence(roomName, nick, 'available')
  }

  async leaveRoom(roomName: string): Promise<void> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) return

    // Broadcast leave presence
    try {
      await this.broadcastPresence(roomName, roomState.localNick, 'unavailable')
    } catch {
      // ignore offline send failures
    }

    const pubsub = this.ctx.getPubSubService()
    await pubsub.unsubscribe(roomState.topic)
    await pubsub.unsubscribe(`${roomState.topic}/messages`)
    await pubsub.unsubscribe(`${roomState.topic}/presence`)

    this.rooms.delete(roomName)
  }

  setRoomSettings(roomName: string, settings: MucRoomSettings): void {
    const roomState = this.rooms.get(roomName)
    if (roomState) {
      roomState.defaultSecure = settings.defaultSecure
      roomState.autoJoin = settings.autoJoin
      roomState.topic = settings.topic ?? roomState.topic
      roomState.communityId = settings.communityId
      roomState.archived = settings.archived
    }
    this.setMucRoomSettings(roomName, settings)
    void this.scheduleMucPersist().catch(() => {})
  }

  getRoomSettings(roomName: string): MucRoomSettings | undefined {
    const roomState = this.rooms.get(roomName)
    if (!roomState) return undefined
    return {
      topic: roomState.topic,
      defaultSecure: roomState.defaultSecure,
      autoJoin: roomState.autoJoin,
      communityId: roomState.communityId
    }
  }

  async sendGroupMessage(roomName: string, body: string, replaceId?: string, messageId?: string, reply?: { id: string; to?: string }, thread?: string): Promise<string> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) {
      throw new Error(`Not joined in MUC room: ${roomName}`)
    }

    const id = messageId || Math.random().toString(36).substring(2, 11)
    const children = [xml('body', {}, body)]
    if (replaceId) {
      children.push(xml('replace', { xmlns: 'urn:xmpp:message-correct:0', id: replaceId }))
    }
    if (reply) {
      const replyAttrs: Record<string, string> = { xmlns: 'urn:xmpp:reply:0', id: reply.id }
      if (reply.to) {
        replyAttrs.to = reply.to
      }
      children.push(xml('reply', replyAttrs))
    }
    if (thread) {
      children.push(xml('thread', {}, thread))
    }

    const stanza = buildGroupchatMessage(roomName, roomState.localNick, children, id)

    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(`${roomState.topic}/messages`, bytes)
    await this.ctx.getPubSubService().publish(roomState.topic, bytes)

    await this.recordMucMessage({
      id,
      room: roomName,
      from: roomState.localNick,
      fromPeerId: this.ctx.jid.split('@')[0],
      body,
      timestamp: new Date().toISOString(),
      reply,
      thread
    })

    return id
  }

  async sendGroupMessageSecure(roomName: string, body: string, replaceId?: string, messageId?: string, reply?: { id: string; to?: string }, thread?: string): Promise<string> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) {
      throw new Error(`Not joined in MUC room: ${roomName}`)
    }

    const id = messageId || Math.random().toString(36).substring(2, 11)
    const payloadKeyBytes = randomBytes(16)
    const iv = randomBytes(12)

    const cipher = createCipheriv('aes-128-gcm', payloadKeyBytes, iv)
    const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    const payload = Buffer.concat([ciphertext, authTag]).toString('base64')

    const keysMap = new Map<string, Element[]>()

    const addOmemoKey = async (targetJid: string) => {
      const devices = await this.ctx.getPeerOmemoDevices(targetJid)
      if (devices.length === 0) {
        return
      }

      const keys: Element[] = []
      for (const deviceId of devices) {
        await ensureOmemoSession(this.ctx.getSecureContext(), targetJid, deviceId)
        const omemo = await loadOmemoModule()
        const remoteAddress = new omemo.OMEMOAddress(targetJid, deviceId)
        const sessionCipher = new omemo.SessionCipher(this.ctx.getOmemoStore(), remoteAddress)
        const encryptedKey = await sessionCipher.encrypt(payloadKeyBytes)
        keys.push(xml('key', { rid: String(deviceId) }, Buffer.from(encryptedKey.body, 'binary').toString('base64')))
      }

      if (keys.length > 0) {
        keysMap.set(targetJid, keys)
      }
    }

    // Encrypt for all occupants (including self for MAM history decryption)
    for (const occupant of roomState.occupants.values()) {
      await addOmemoKey(occupant.jid)
    }
    // Add self key so sender can decrypt own messages from MAM history
    await addOmemoKey(this.ctx.jid)

    if (keysMap.size === 0 && roomState.occupants.size > 0) {
      throw new Error('No occupants have available OMEMO devices')
    }

    const keysElements: Element[] = []
    for (const [jid, keys] of keysMap.entries()) {
      keysElements.push(xml('keys', { jid }, ...keys))
    }

    const encryptedEl = xml(
      'encrypted',
      { xmlns: 'urn:xmpp:omemo:2' },
      xml(
        'header',
        { sid: String(this.ctx.getOmemoDeviceIdOrThrow()) },
        ...keysElements,
        xml('iv', {}, iv.toString('base64'))
      ),
      xml('payload', {}, payload)
    )

    const children = [encryptedEl]
    if (replaceId) {
      children.push(xml('replace', { xmlns: 'urn:xmpp:message-correct:0', id: replaceId }))
    }
    if (reply) {
      const replyAttrs: Record<string, string> = { xmlns: 'urn:xmpp:reply:0', id: reply.id }
      if (reply.to) {
        replyAttrs.to = reply.to
      }
      children.push(xml('reply', replyAttrs))
    }
    if (thread) {
      children.push(xml('thread', {}, thread))
    }

    const stanza = buildGroupchatMessage(roomName, roomState.localNick, children, id)

    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(`${roomState.topic}/messages`, bytes)
    await this.ctx.getPubSubService().publish(roomState.topic, bytes)

    await this.recordMucMessage({
      id,
      room: roomName,
      from: roomState.localNick,
      fromPeerId: this.ctx.jid.split('@')[0],
      body,
      timestamp: new Date().toISOString(),
      encrypted: true,
      encryption: 'omemo',
      reply,
      thread
    })

    return id
  }

  async sendGroupChatState(roomName: string, state: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'): Promise<void> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) {
      throw new Error(`Not joined in MUC room: ${roomName}`)
    }

    const stanza = buildGroupchatMessage(roomName, roomState.localNick, [
      xml(state, { xmlns: 'http://jabber.org/protocol/chatstates' })
    ])

    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(`${roomState.topic}/presence`, bytes)
    await this.ctx.getPubSubService().publish(roomState.topic, bytes)
  }

  async sendGroupChatMarker(roomName: string, type: 'received' | 'displayed', id: string): Promise<void> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) {
      throw new Error(`Not joined in MUC room: ${roomName}`)
    }

    const stanza = buildGroupchatMessage(roomName, roomState.localNick, [
      xml(type, { xmlns: 'urn:xmpp:chat-markers:0', id })
    ])

    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(`${roomState.topic}/presence`, bytes)
    await this.ctx.getPubSubService().publish(roomState.topic, bytes)
  }

  async queryHistory(roomName: string, targetPeerJid: string, queryId?: string): Promise<void> {
    const iqId = Math.random().toString(36).substring(2, 11)
    const queryEl = xml('query', { xmlns: 'urn:xmpp:mam:2', node: `${roomName}@muc.p2p` })
    if (queryId) {
      queryEl.attrs.queryid = queryId
    }
    const iq = xml('iq', { type: 'get', id: iqId, to: targetPeerJid }, queryEl)
    await this.ctx.sendIqRequest(targetPeerJid, iq)
  }

  async handleIncomingMamQuery(element: Element, peerId: string): Promise<void> {
    const query = element.getChild('query')
    if (!query) return

    const queryId = query.attrs.queryid
    const roomJid = query.attrs.node || ''
    const atIdx = roomJid.indexOf('@')
    const roomName = atIdx !== -1 ? roomJid.slice(0, atIdx) : roomJid

    const history = this.getMucHistory(roomName)

    for (const msg of history) {
      const msgEl = xml('message', {
        to: `${roomName}@muc.p2p`,
        from: `${roomName}@muc.p2p/${msg.from}`,
        type: 'groupchat',
        id: msg.id
      }, xml('body', {}, msg.body))
      if (msg.reply) {
        const replyAttrs: Record<string, string> = { xmlns: 'urn:xmpp:reply:0', id: msg.reply.id }
        if (msg.reply.to) {
          replyAttrs.to = msg.reply.to
        }
        msgEl.children.push(xml('reply', replyAttrs))
      }
      if (msg.thread) {
        msgEl.children.push(xml('thread', {}, msg.thread))
      }

      if (msg.encrypted && msg.encryption === 'omemo') {
        // We do not have easy access to reconstruct full OMEMO payload details, so we just wrap clean body in mam message response.
        // If they encrypted, it was stored decrypted in history. Return it in clean body.
      }

      const resultEl = xml('result', {
        xmlns: 'urn:xmpp:mam:2',
        queryid: queryId,
        id: msg.id
      }, xml('forwarded', { xmlns: 'urn:xmpp:forward:0' },
        xml('delay', { xmlns: 'urn:xmpp:delay', stamp: msg.timestamp }),
        msgEl
      ))

      const wrapperMsg = xml('message', {
        to: `${peerId}@p2p`,
        from: this.ctx.jid
      }, resultEl)

      const stream = await this.ctx.getOrCreateStream(`${peerId}@p2p`)
      stream.send(wrapperMsg)
    }

    const finEl = xml('fin', { xmlns: 'urn:xmpp:mam:2', complete: 'true' },
      xml('count', {}, String(history.length))
    )
    await this.ctx.sendIqResult(peerId, element.attrs.id, finEl)
  }

  async handleIncomingMamResult(element: Element, peerId: string): Promise<void> {
    const resultEl = element.getChild('result')
    if (!resultEl) return

    const queryId = resultEl.attrs.queryid
    const forwardedEl = resultEl.getChild('forwarded')
    const delayEl = forwardedEl?.getChild('delay')
    const delayStamp = delayEl?.attrs.stamp
    const innerMsg = forwardedEl?.getChild('message')

    if (innerMsg) {
      const fromVal = innerMsg.attrs.from || ''
      const toVal = innerMsg.attrs.to || ''
      const roomJid = toVal.split('/')[0]
      const atIdx = roomJid.indexOf('@')
      const roomName = atIdx !== -1 ? roomJid.slice(0, atIdx) : roomJid
      const senderNick = fromVal.split('/')[1] || fromVal
      const body = innerMsg.getChild('body')?.text()
      const msgId = innerMsg.attrs.id || resultEl.attrs.id
      const reply = parseReplyElement(innerMsg)
      const thread = parseThreadElement(innerMsg)

      if (body) {
        const mamMsg = {
          id: msgId,
          room: roomName,
          from: senderNick,
          fromPeerId: peerId,
          body,
          timestamp: delayStamp || new Date().toISOString(),
          reply,
          thread
        }
        await this.recordMucMessage(mamMsg)

        this.ctx.emit('muc:message', {
          room: roomName,
          roomJid,
          from: senderNick,
          occupantJid: fromVal,
          peerJid: `${peerId}@p2p`,
          fromPeerId: peerId,
          body,
          timestamp: delayStamp || new Date().toISOString(),
          id: msgId,
          mam: true,
          reply,
          thread,
          queryId
        })
      }
    }
  }

  private async broadcastPresence(roomName: string, nick: string, type: 'available' | 'unavailable'): Promise<void> {
    const stanza = buildMucPresence(roomName, nick, this.ctx.jid, type)
    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(`${this.getRoomTopic(roomName)}/presence`, bytes)
    await this.ctx.getPubSubService().publish(this.getRoomTopic(roomName), bytes)
  }

  async handleIncomingPayload(topic: string, fromPeerId: string, xmlStr: string): Promise<void> {
    try {
      const p = new Parser()
      p.write('<stream:stream>')
      p.on('element', (element: Element) => {
        void this.handleIncomingElement(topic, fromPeerId, element).catch(() => {})
      })
      p.write(xmlStr)
    } catch {
      // ignore parsing errors
    }
  }

  private async handleIncomingElement(topic: string, fromPeerId: string, element: Element): Promise<void> {
    let roomName = topic.startsWith('xmpp/muc/') ? topic.slice('xmpp/muc/'.length) : topic
    if (roomName.endsWith('/presence')) {
      roomName = roomName.slice(0, -9)
    } else if (roomName.endsWith('/messages')) {
      roomName = roomName.slice(0, -9)
    }
    const roomState = this.rooms.get(roomName)
    if (!roomState) return

    if (element.name === 'presence') {
      const fromJid = element.attrs.from || `${fromPeerId}@p2p`
      const roomAndNick = parseRoomAndNick(element.attrs.from, fromPeerId) || parseRoomAndNick(element.attrs.to, fromPeerId)
      if (!roomAndNick || roomAndNick.roomName !== roomName) {
        this.ctx.emit('error', new Error(`Malformed MUC presence for room ${roomName}`))
        return
      }

      const nick = roomAndNick.nick
      const roomJid = buildRoomJid(roomName)
      const mucUserEl = (element.children as any[]).find(child => child?.name === 'x' && child?.attrs?.xmlns === MUC_USER_XMLNS) as Element | undefined
      const mucItemEl = mucUserEl?.getChild('item')
      const occupantJid = fromJid
      const peerJid = `${fromPeerId}@p2p`
      const occupantRole = mucItemEl?.attrs.role
      const occupantAffiliation = mucItemEl?.attrs.affiliation

      const isUnavailable = element.attrs.type === 'unavailable'
      if (isUnavailable) {
        if (roomState.occupants.has(nick)) {
          roomState.occupants.delete(nick)
          this.ctx.emit('muc:leave', {
            room: roomName,
            roomJid,
            nick,
            peerId: fromPeerId,
            occupantJid,
            peerJid,
            role: occupantRole,
            affiliation: occupantAffiliation
          })
        }
      } else {
        const isNew = !roomState.occupants.has(nick)
        roomState.occupants.set(nick, {
          nick,
          peerId: fromPeerId,
          jid: peerJid,
          occupantJid,
          lastSeen: new Date().toISOString()
        })

        if (isNew) {
          this.ctx.emit('muc:join', {
            room: roomName,
            roomJid,
            nick,
            peerId: fromPeerId,
            occupantJid,
            peerJid,
            role: occupantRole,
            affiliation: occupantAffiliation
          })

          // If someone else joined, broadcast our own presence so they can discover us
          if (fromPeerId !== this.ctx.jid.split('@')[0]) {
            // Send back our presence to ensure roster sync
            void this.broadcastPresence(roomName, roomState.localNick, 'available').catch(() => {})
          }
        }
      }
    } else if (element.name === 'message' && element.attrs.type === 'groupchat') {
      const to = element.attrs.to || ''
      if (to && to !== buildRoomJid(roomName) && to !== this.ctx.jid) {
        this.ctx.emit('error', new Error(`Malformed MUC groupchat target for room ${roomName}`))
        return
      }

      const omemoEl = element.getChild('encrypted')
      const fromVal = element.attrs.from || ''
      const slashIdx = fromVal.lastIndexOf('/')
      const senderNick = slashIdx !== -1 ? fromVal.slice(slashIdx + 1) : fromPeerId
      const roomJid = buildRoomJid(roomName)

      const chatStateEl = ['active', 'composing', 'paused', 'inactive', 'gone']
        .map(s => element.getChild(s))
        .find(child => child?.attrs?.xmlns === 'http://jabber.org/protocol/chatstates')
      if (chatStateEl) {
        this.ctx.emit('muc:chatstate', {
          room: roomName,
          roomJid,
          from: senderNick,
          occupantJid: fromVal || `${roomJid}/${senderNick}`,
          peerJid: `${fromPeerId}@p2p`,
          fromPeerId,
          chatState: chatStateEl.name
        })
      }

      const markerEl = ['received', 'displayed']
        .map(s => element.getChild(s))
        .find(child => child?.attrs?.xmlns === 'urn:xmpp:chat-markers:0')
      if (markerEl) {
        this.ctx.emit('muc:marker', {
          room: roomName,
          roomJid,
          from: senderNick,
          occupantJid: fromVal || `${roomJid}/${senderNick}`,
          peerJid: `${fromPeerId}@p2p`,
          fromPeerId,
          type: markerEl.name,
          id: markerEl.attrs.id
        })
      }

      if (omemoEl && omemoEl.attrs.xmlns === 'urn:xmpp:omemo:2') {
        try {
          const headerEl = omemoEl.getChild('header')
          const payloadEl = omemoEl.getChild('payload')
          const sid = Number(headerEl?.attrs.sid ?? 0)
          const ivEl = headerEl?.getChild('iv')
          const keysEl = (headerEl?.children as any[] ?? []).filter(child => child?.name === 'keys') as Element[]
          const payload = payloadEl?.text().trim()
          const iv = ivEl?.text().trim()
          const rid = (this.ctx as any).getOmemoDeviceIdOrThrow()

          const ourKeysEl = keysEl.find(k => k.attrs.jid === this.ctx.jid)
          const keyEl = ourKeysEl
            ? (ourKeysEl.children as any[] ?? []).find((child: Element) => Number(child.attrs.rid ?? 0) === rid)
            : undefined

          if (headerEl && payload && iv && keyEl && Number.isFinite(sid) && sid > 0) {
            const omemo = await loadOmemoModule()
            const senderJid = `${fromPeerId}@p2p`
            const remoteAddress = new omemo.OMEMOAddress(senderJid, sid)
            const encryptedKey = keyEl.text().trim()
            const payloadKey = await decryptOmemoKey(this.ctx as any, remoteAddress, encryptedKey)
            const body = decryptOmemoPayload(payload, payloadKey, iv)
            const msgId = element.attrs.id || Math.random().toString(36).substring(2, 11)
            const reply = parseReplyElement(element)
            const thread = parseThreadElement(element)

            await this.recordMucMessage({
              id: msgId,
              room: roomName,
              from: senderNick,
              fromPeerId,
              body,
              timestamp: new Date().toISOString(),
              encrypted: true,
              encryption: 'omemo',
              reply,
              thread
            })

            const replaceEl = element.getChild('replace')
            const replace = replaceEl?.attrs.xmlns === 'urn:xmpp:message-correct:0' ? replaceEl.attrs.id : undefined

            this.ctx.emit('muc:message', {
              room: roomName,
              roomJid,
              from: senderNick,
              occupantJid: fromVal || `${roomJid}/${senderNick}`,
              peerJid: `${fromPeerId}@p2p`,
              fromPeerId,
              body,
              timestamp: new Date().toISOString(),
              encrypted: true,
              encryption: 'omemo',
              id: msgId,
              replace,
              reply,
              thread
            })
          }
        } catch (err: any) {
          this.ctx.emit('error', new Error(`Failed to decrypt OMEMO group message: ${err.message}`))
        }
      } else {
        const body = element.getChild('body')?.text()
        if (body) {
          const msgId = element.attrs.id || Math.random().toString(36).substring(2, 11)
          const reply = parseReplyElement(element)
          const thread = parseThreadElement(element)
          await this.recordMucMessage({
            id: msgId,
            room: roomName,
            from: senderNick,
            fromPeerId,
            body,
            timestamp: new Date().toISOString(),
            reply,
            thread
          })

          const replaceEl = element.getChild('replace')
          const replace = replaceEl?.attrs.xmlns === 'urn:xmpp:message-correct:0' ? replaceEl.attrs.id : undefined

          this.ctx.emit('muc:message', {
            room: roomName,
            roomJid,
            from: senderNick,
            occupantJid: fromVal || `${roomJid}/${senderNick}`,
            peerJid: `${fromPeerId}@p2p`,
            fromPeerId,
            body,
            timestamp: new Date().toISOString(),
            id: msgId,
            replace,
            reply,
            thread
          })
        }
      }
    }
  }
}
