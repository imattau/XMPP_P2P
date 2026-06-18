import { xml, Element, Parser } from '@xmpp/xml'
import { randomBytes, createCipheriv } from 'crypto'
import { loadOmemoModule } from './omemo-runtime.js'
import { decryptOmemoKey, decryptOmemoPayload, ensureOmemoSession } from './xmpp-secure.js'

export const MUC_XMLNS = 'http://jabber.org/protocol/muc'
const MUC_USER_XMLNS = 'http://jabber.org/protocol/muc#user'

export interface MucOccupant {
  nick: string
  peerId: string
  jid: string
  occupantJid: string
  lastSeen: string
}

export interface MucRoomState {
  name: string
  topic: string
  localNick: string
  occupants: Map<string, MucOccupant>
}

export interface XmppMucContext {
  jid: string
  getPubSubService(): any
  emit(event: string, ...args: any[]): boolean
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

function buildGroupchatMessage(roomName: string, nick: string, children: Element[]): Element {
  return xml(
    'message',
    {
      from: buildOccupantJid(roomName, nick),
      to: buildRoomJid(roomName),
      type: 'groupchat'
    },
    ...children
  )
}

export class XmppMucManager {
  private ctx: XmppMucContext
  private rooms = new Map<string, MucRoomState>()
  private presenceInterval?: NodeJS.Timeout

  constructor(ctx: XmppMucContext) {
    this.ctx = ctx
    this.presenceInterval = setInterval(() => {
      for (const [roomName, roomState] of this.rooms.entries()) {
        void this.broadcastPresence(roomName, roomState.localNick, 'available').catch(() => {})
      }
    }, 1500)
  }

  close() {
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

    await pubsub.subscribe(topic)

    const roomState: MucRoomState = {
      name: roomName,
      topic,
      localNick: nick,
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

    this.rooms.delete(roomName)
  }

  async sendGroupMessage(roomName: string, body: string): Promise<void> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) {
      throw new Error(`Not joined in MUC room: ${roomName}`)
    }

    const stanza = buildGroupchatMessage(roomName, roomState.localNick, [xml('body', {}, body)])

    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(roomState.topic, bytes)
  }

  async sendGroupMessageSecure(roomName: string, body: string): Promise<void> {
    const roomState = this.rooms.get(roomName)
    if (!roomState) {
      throw new Error(`Not joined in MUC room: ${roomName}`)
    }

    const payloadKeyBytes = randomBytes(16)
    const iv = randomBytes(12)

    const cipher = createCipheriv('aes-128-gcm', payloadKeyBytes, iv)
    const ciphertext = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    const payload = Buffer.concat([ciphertext, authTag]).toString('base64')

    const keysMap = new Map<string, Element[]>()

    for (const occupant of roomState.occupants.values()) {
      const devices = await (this.ctx as any).getPeerOmemoDevices(occupant.jid)
      if (devices.length === 0) {
        continue
      }

      const keys: Element[] = []
      for (const deviceId of devices) {
        await ensureOmemoSession(this.ctx as any, occupant.jid, deviceId)
        const omemo = await loadOmemoModule()
        const remoteAddress = new omemo.OMEMOAddress(occupant.jid, deviceId)
        const sessionCipher = new omemo.SessionCipher((this.ctx as any).getOmemoStore(), remoteAddress)
        const encryptedKey = await sessionCipher.encrypt(payloadKeyBytes)
        keys.push(xml('key', { rid: String(deviceId) }, Buffer.from(encryptedKey.body, 'binary').toString('base64')))
      }

      if (keys.length > 0) {
        keysMap.set(occupant.jid, keys)
      }
    }

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
        { sid: String((this.ctx as any).getOmemoDeviceIdOrThrow()) },
        ...keysElements,
        xml('iv', {}, iv.toString('base64'))
      ),
      xml('payload', {}, payload)
    )

    const stanza = buildGroupchatMessage(roomName, roomState.localNick, [encryptedEl])

    const bytes = new TextEncoder().encode(stanza.toString())
    await this.ctx.getPubSubService().publish(roomState.topic, bytes)
  }

  private async broadcastPresence(roomName: string, nick: string, type: 'available' | 'unavailable'): Promise<void> {
    const stanza = buildMucPresence(roomName, nick, this.ctx.jid, type)
    const bytes = new TextEncoder().encode(stanza.toString())
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
    const roomName = topic.startsWith('xmpp/muc/') ? topic.slice('xmpp/muc/'.length) : topic
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
              encryption: 'omemo'
            })
          }
        } catch (err: any) {
          this.ctx.emit('error', new Error(`Failed to decrypt OMEMO group message: ${err.message}`))
        }
      } else {
        const body = element.getChild('body')?.text()
        if (body) {
          this.ctx.emit('muc:message', {
            room: roomName,
            roomJid,
            from: senderNick,
            occupantJid: fromVal || `${roomJid}/${senderNick}`,
            peerJid: `${fromPeerId}@p2p`,
            fromPeerId,
            body,
            timestamp: new Date().toISOString()
          })
        }
      }
    }
  }
}
