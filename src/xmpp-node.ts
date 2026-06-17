import { Libp2p } from 'libp2p'
import { xml, Element, Parser } from '@xmpp/xml'
import { EventEmitter } from 'events'
import { XmppStream } from './xmpp-stream.js'
import { multiaddr, Multiaddr } from '@multiformats/multiaddr'

export interface XmppMessage {
  from: string
  to: string
  body: string
  id?: string
  type?: string
}

export interface XmppPresence {
  from: string
  to: string
  type?: string
  status?: string
}

export interface XmppPubSubMessage {
  topic: string
  node?: string
  from: string
  body: string
  itemId?: string
}

export class XmppNode extends EventEmitter {
  private libp2p: Libp2p
  private streams = new Map<string, XmppStream>()
  public readonly jid: string

  constructor(libp2p: Libp2p) {
    super()
    this.libp2p = libp2p
    this.jid = `${this.libp2p.peerId.toString()}@p2p`

    // Register protocol handler for inbound connections
    this.libp2p.handle('/xmpp/1.0.0', (stream: any, connection?: any) => {
      const conn = connection || stream.connection
      const peerId = conn?.remotePeer?.toString() || 'unknown'
      console.log(`[DEBUG] Inbound connection handler triggered from peer: ${peerId}`)
      const xmppStream = new XmppStream(stream, peerId)
      this.registerStream(peerId, xmppStream)
      this.emit('stream', { peerId, direction: 'inbound', stream: xmppStream })
    })

    // Register Gossipsub PubSub listener if available
    const pubsub = (this.libp2p.services as any).pubsub
    if (pubsub) {
      pubsub.addEventListener('message', (evt: any) => {
        const topic = evt.detail.topic
        const data = evt.detail.data
        const xmlStr = new TextDecoder().decode(data)

        try {
          const p = new Parser()
          p.write('<stream:stream>')
          p.on('element', (element: Element) => {
            if (element.name === 'message') {
              const eventEl = element.getChild('event')
              if (eventEl && eventEl.attrs.xmlns === 'http://jabber.org/protocol/pubsub#event') {
                const itemsEl = eventEl.getChild('items')
                const nodeName = itemsEl?.attrs.node
                const itemEl = itemsEl?.getChild('item')
                const bodyEl = itemEl?.getChild('body')
                if (bodyEl) {
                  const pubSubMsg: XmppPubSubMessage = {
                    topic: topic,
                    node: nodeName,
                    from: element.attrs.from || 'unknown',
                    body: bodyEl.text(),
                    itemId: itemEl?.attrs.id
                  }
                  this.emit('pubsub:message', pubSubMsg)
                }
              }
            }
          })
          p.write(xmlStr)
        } catch (err) {
          // ignore parsing error for malformed pubsub elements
        }
      })
    }
  }

  private registerStream(peerId: string, xmppStream: XmppStream) {
    // If we already have a stream, clean it up
    const existing = this.streams.get(peerId)
    if (existing) {
      existing.close()
    }

    this.streams.set(peerId, xmppStream)

    xmppStream.on('element', (element: Element) => {
      this.handleStanza(peerId, element)
    })

    xmppStream.on('error', (err) => {
      this.emit('error', err)
    })

    xmppStream.on('close', () => {
      if (this.streams.get(peerId) === xmppStream) {
        this.streams.delete(peerId)
      }
      this.emit('stream-closed', peerId)
    })
  }

  private handleStanza(peerId: string, element: Element) {
    const fromJid = element.attrs.from || `${peerId}@p2p`
    const toJid = element.attrs.to || this.jid

    if (element.name === 'message') {
      const bodyEl = element.getChild('body')
      if (bodyEl) {
        const message: XmppMessage = {
          from: fromJid,
          to: toJid,
          body: bodyEl.text(),
          id: element.attrs.id,
          type: element.attrs.type || 'chat'
        }
        this.emit('message', message)
      }
    } else if (element.name === 'presence') {
      const statusEl = element.getChild('status')
      const presence: XmppPresence = {
        from: fromJid,
        to: toJid,
        type: element.attrs.type,
        status: statusEl ? statusEl.text() : undefined
      }
      this.emit('presence', presence)
    } else {
      this.emit('stanza', { from: fromJid, to: toJid, element })
    }
  }

  // Dial a peer and establish XmppStream
  async getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream> {
    let peerIdStr: string
    const addrStr = peerAddr.toString()

    if (addrStr.includes('/p2p/')) {
      peerIdStr = addrStr.split('/p2p/').pop() || ''
    } else if (addrStr.includes('/ipfs/')) {
      peerIdStr = addrStr.split('/ipfs/').pop() || ''
    } else {
      peerIdStr = addrStr
    }

    if (!peerIdStr) {
      throw new Error('Address does not contain a peer ID')
    }

    const existing = this.streams.get(peerIdStr)
    if (existing) {
      return existing
    }

    // Dial the peer
    let dialTarget: any = peerAddr
    if (addrStr.startsWith('/')) {
      dialTarget = multiaddr(addrStr)
    }
    const stream = await this.libp2p.dialProtocol(dialTarget, '/xmpp/1.0.0')
    const xmppStream = new XmppStream(stream, peerIdStr)
    this.registerStream(peerIdStr, xmppStream)
    this.emit('stream', { peerId: peerIdStr, direction: 'outbound', stream: xmppStream })
    return xmppStream
  }

  // Send a chat message to a peer
  async sendMessage(peerAddr: string | Multiaddr, body: string): Promise<string> {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'
    const id = Math.random().toString(36).substring(2, 11)

    const msg = xml(
      'message',
      {
        to: toJid,
        from: this.jid,
        type: 'chat',
        id: id
      },
      xml('body', {}, body)
    )

    xmppStream.send(msg)
    return id
  }

  // Send presence updates
  async sendPresence(peerAddr: string | Multiaddr, type?: string, status?: string) {
    const xmppStream = await this.getOrCreateStream(peerAddr)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'

    const presAttrs: Record<string, string> = {
      to: toJid,
      from: this.jid
    }
    if (type) {
      presAttrs.type = type
    }

    const pres = status
      ? xml('presence', presAttrs, xml('status', {}, status))
      : xml('presence', presAttrs)

    xmppStream.send(pres)
  }

  // Subscribe to a Gossipsub/PubSub topic
  subscribe(topic: string) {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      throw new Error('PubSub/Gossipsub service is not configured')
    }
    pubsub.subscribe(topic)
  }

  // Unsubscribe from a Gossipsub/PubSub topic
  unsubscribe(topic: string) {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      throw new Error('PubSub/Gossipsub service is not configured')
    }
    pubsub.unsubscribe(topic)
  }

  // Publish a message to a topic wrapped in a XEP-0060 compliant stanza
  async publish(topic: string, body: string): Promise<string> {
    const pubsub = (this.libp2p.services as any).pubsub
    if (!pubsub) {
      throw new Error('PubSub/Gossipsub service is not configured')
    }

    const itemId = Math.random().toString(36).substring(2, 11)
    const stanza = xml(
      'message',
      {
        from: this.jid,
        to: 'pubsub.p2p',
        type: 'headline'
      },
      xml(
        'event',
        { xmlns: 'http://jabber.org/protocol/pubsub#event' },
        xml(
          'items',
          { node: topic },
          xml(
            'item',
            { id: itemId },
            xml('body', {}, body)
          )
        )
      )
    )

    const bytes = new TextEncoder().encode(stanza.toString())
    await pubsub.publish(topic, bytes)
    return itemId
  }

  // Close all streams
  async close() {
    for (const stream of this.streams.values()) {
      await stream.close()
    }
    this.streams.clear()
  }
}
