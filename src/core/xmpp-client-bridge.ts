import { EventEmitter } from 'events'
import { client as xmppClient, xml, jid as xmppJid } from '@xmpp/client'
import { Element } from '@xmpp/xml'

declare var WebSocket: any

export interface ServerConnectionInfo {
  type: 'component'
  domain: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
}

export interface ServerMessageEvent {
  from: string
  to: string
  body: string
  id: string
  type: string
  server: string
  thread?: string
  delay?: { stamp: string; from?: string }
}

export interface ServerMucMessageEvent {
  room: string
  from: string
  body: string
  id: string
  server: string
}

export interface ServerPubsubEvent {
  node: string
  itemId: string
  from: string
  server: string
  payload?: { body?: string; entry?: Element }
}

export interface ServerDiscoInfoResult {
  identities: Array<{ category: string; type: string; name?: string }>
  features: string[]
}

export interface ServerDiscoItemsResult {
  items: Array<{ jid: string; node?: string; name?: string }>
}

const NS_PUBSUB = 'http://jabber.org/protocol/pubsub'
const NS_PUBSUB_EVENT = 'http://jabber.org/protocol/pubsub#event'
const NS_MUC = 'http://jabber.org/protocol/muc'

interface PendingIQ {
  resolve: (value: Element) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface XmppClientCredentials {
  jid: string
  password: string
  service?: string
}

export class XmppClientBridge extends EventEmitter {
  private client: ReturnType<typeof xmppClient> | null = null
  private status: ServerConnectionInfo['status'] = 'disconnected'
  private domain: string = ''
  private pendingIq = new Map<string, PendingIQ>()
  private readonly iqTimeoutMs = 30000

  get connectionInfo(): ServerConnectionInfo {
    return { type: 'component', domain: this.domain, status: this.status }
  }

  get isConnected(): boolean {
    return this.status === 'connected'
  }

  async connect(credentials: XmppClientCredentials): Promise<void> {
    await this.disconnect().catch(() => {})

    const jidObj = xmppJid(credentials.jid)
    this.domain = jidObj.domain
    this.status = 'connecting'
    this.emit('connection', this.connectionInfo)

    const service = credentials.service || `wss://${this.domain}:5443/ws`

    this.client = xmppClient({
      service,
      domain: this.domain,
      username: jidObj.local,
      password: credentials.password,
    })

    this.client.on('online', () => {
      this.status = 'connected'
      this.domain = this.client?.jid?.domain || this.domain
      this.emit('connection', this.connectionInfo)
    })

    this.client.on('stanza', (stanza: Element) => {
      this.handleStanza(stanza)
    })

    this.client.on('status', (status: string) => {
      if (status === 'disconnect' || status === 'offline') {
        this.status = 'disconnected'
        this.emit('connection', { ...this.connectionInfo, status: 'disconnected' })
        for (const [, pending] of this.pendingIq) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Server disconnected'))
        }
        this.pendingIq.clear()
      }
    })

    this.client.on('error', (err: Error) => {
      this.status = 'error'
      this.emit('connection', { ...this.connectionInfo, status: 'error', error: err.message })
    })

    try {
      await this.client.start()
    } catch (err: any) {
      this.status = 'disconnected'
      this.emit('connection', { ...this.connectionInfo, status: 'disconnected' })
      throw new Error(`Failed to connect: ${err.message}`)
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.stop()
    } catch {}
    this.client = null
    this.status = 'disconnected'
    this.emit('connection', { ...this.connectionInfo, status: 'disconnected' })
    for (const [, pending] of this.pendingIq) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Server disconnected'))
    }
    this.pendingIq.clear()
  }

  async register(service: string, username: string, password: string): Promise<void> {
    const domain = new URL(service).hostname

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(service)
      let buffer = ''
      let step: 'features' | 'form' | 'submit' = 'features'
      const timeout = setTimeout(() => {
        try { ws.close() } catch {}
        reject(new Error('Registration timed out'))
      }, 15000)

      ws.onopen = () => {
        ws.send(`<stream:stream to='${domain}' xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' version='1.0'>`)
      }

      ws.onmessage = (event: any) => {
        buffer += event.data

        if (step === 'features' && buffer.includes('</stream:features>')) {
          if (!buffer.includes('jabber:iq:register')) {
            clearTimeout(timeout)
            ws.close()
            reject(new Error('Server does not support in-band registration'))
            return
          }
          step = 'form'
          buffer = ''
          ws.send(`<iq type='get' id='reg-1'><query xmlns='jabber:iq:register'/></iq>`)
          return
        }

        if (step === 'form') {
          const match = buffer.match(/id=['"](reg-1)['"]/)
          if (match && (buffer.includes('type="result"') || buffer.includes("type='result'"))) {
            step = 'submit'
            buffer = ''
            const u = username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            const p = password.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            ws.send(`<iq type='set' id='reg-2'><query xmlns='jabber:iq:register'><username>${u}</username><password>${p}</password></query></iq>`)
            return
          }
        }

        if (step === 'submit') {
          const match = buffer.match(/id=['"](reg-2)['"]/)
          if (match && (buffer.includes('type="result"') || buffer.includes("type='result'"))) {
            clearTimeout(timeout)
            step = 'submit'
            ws.close()
            resolve()
            return
          }
        }

        if (buffer.includes('type="error"') || buffer.includes("type='error'")) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error('Registration rejected by server'))
        }
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket connection failed'))
      }
    })
  }

  async sendStanza(stanza: Element): Promise<void> {
    if (!this.client) throw new Error('Not connected to server')
    await this.client.send(stanza)
  }

  async sendMessage(to: string, body: string, options?: { type?: string; thread?: string; replace?: string }): Promise<string> {
    const id = options?.replace || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const attrs: Record<string, string> = { to, type: options?.type || 'chat', id }
    const children: any[] = [xml('body', {}, body)]
    if (options?.thread) children.push(xml('thread', {}, options.thread))
    if (options?.replace) children.push(xml('replace', { id: options.replace, xmlns: 'urn:xmpp:message-correct:0' }))
    await this.sendStanza(xml('message', attrs, ...children))
    return id
  }

  async sendPresence(type?: string, status?: string, show?: string): Promise<void> {
    const attrs: Record<string, string> = {}
    if (type) attrs.type = type
    const children: any[] = []
    if (show) children.push(xml('show', {}, show))
    if (status) children.push(xml('status', {}, status))
    await this.sendStanza(xml('presence', attrs, ...children))
  }

  async sendIQ(to: string, type: 'get' | 'set', queryEl: Element): Promise<Element> {
    const id = `iq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const stanza = xml('iq', { to, type, id }, queryEl)
    await this.sendStanza(stanza)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIq.delete(id)
        reject(new Error(`IQ timeout: ${id}`))
      }, this.iqTimeoutMs)
      this.pendingIq.set(id, { resolve, reject, timer })
    })
  }

  async joinMuc(roomJid: string, nick: string): Promise<void> {
    await this.sendStanza(xml('presence', { to: `${roomJid}/${nick}` },
      xml('x', { xmlns: NS_MUC })
    ))
  }

  async sendMucMessage(roomJid: string, body: string): Promise<string> {
    return this.sendMessage(roomJid, body, { type: 'groupchat' })
  }

  async leaveMuc(roomJid: string, nick: string): Promise<void> {
    await this.sendStanza(xml('presence', { to: `${roomJid}/${nick}`, type: 'unavailable' }))
  }

  async pubsubSubscribe(nodeJid: string, node: string): Promise<void> {
    const iq = xml('iq', { to: nodeJid, type: 'set' },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('subscribe', { node, jid: this.client?.jid?.toString() || '' })
      )
    )
    await this.sendStanza(iq)
  }

  async pubsubPublish(nodeJid: string, node: string, itemId: string, payload: Element): Promise<void> {
    const iq = xml('iq', { to: nodeJid, type: 'set' },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('publish', { node },
          xml('item', { id: itemId }, payload)
        )
      )
    )
    await this.sendStanza(iq)
  }

  async pubsubGetItems(nodeJid: string, node: string, maxItems?: number): Promise<Element[]> {
    const attrs: Record<string, string> = { node }
    if (maxItems !== undefined) attrs.max_items = String(maxItems)
    const result = await this.sendIQ(nodeJid, 'get',
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('items', attrs)
      )
    )
    const pubsub = result.getChild('pubsub')
    if (!pubsub) return []
    const items = pubsub.getChild('items')
    if (!items) return []
    return items.children.filter((c): c is Element => c instanceof Element) || []
  }

  async pubsubUnsubscribe(nodeJid: string, node: string): Promise<void> {
    const iq = xml('iq', { to: nodeJid, type: 'set' },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('unsubscribe', { node, jid: this.client?.jid?.toString() || '' })
      )
    )
    await this.sendStanza(iq)
  }

  async discoInfo(jid: string): Promise<ServerDiscoInfoResult> {
    const result = await this.sendIQ(jid, 'get',
      xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
    )
    const query = result.getChild('query')
    if (!query) return { identities: [], features: [] }
    const identityEls = query.children.filter((c: any) => c.name === 'identity')
    const identities = identityEls.map((el: any) => ({
      category: el.attrs.category || '',
      type: el.attrs.type || '',
      name: el.attrs.name
    }))
    const featureEls = query.children.filter((c: any) => c.name === 'feature')
    const features = featureEls.map((el: any) => el.attrs.var || '')
    return { identities, features }
  }

  async discoItems(jid: string): Promise<ServerDiscoItemsResult> {
    const result = await this.sendIQ(jid, 'get',
      xml('query', { xmlns: 'http://jabber.org/protocol/disco#items' })
    )
    const query = result.getChild('query')
    if (!query) return { items: [] }
    const itemEls = query.children.filter((c: any) => c.name === 'item')
    const items = itemEls.map((el: any) => ({
      jid: el.attrs.jid || '',
      node: el.attrs.node,
      name: el.attrs.name
    }))
    return { items }
  }

  private handleStanza(stanza: Element): void {
    if (stanza.name === 'message') {
      this.handleMessage(stanza)
    } else if (stanza.name === 'presence') {
      this.emit('presence', {
        from: stanza.attrs.from || '',
        to: stanza.attrs.to || '',
        type: stanza.attrs.type,
        show: stanza.getChild('show')?.text(),
        status: stanza.getChild('status')?.text(),
        server: this.domain,
      })
    } else if (stanza.name === 'iq') {
      const id = stanza.attrs.id
      if (id && (stanza.attrs.type === 'result' || stanza.attrs.type === 'error')) {
        const pending = this.pendingIq.get(id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingIq.delete(id)
          if (stanza.attrs.type === 'error') {
            pending.reject(new Error(`IQ error: ${stanza.toString()}`))
          } else {
            pending.resolve(stanza)
          }
        }
      }
    }
  }

  private handleMessage(stanza: Element): void {
    const from = stanza.attrs.from || ''
    const to = stanza.attrs.to || ''
    const type = stanza.attrs.type || 'normal'
    const id = stanza.attrs.id || ''
    const body = stanza.getChild('body')?.text() || ''
    const thread = stanza.getChild('thread')?.text()

    const delayEl = stanza.getChild('delay')
    const delay = delayEl ? { stamp: delayEl.attrs.stamp || '', from: delayEl.attrs.from } : undefined

    if (type === 'groupchat') {
      const roomJid = from.includes('/') ? from.split('/')[0] : from
      const nick = from.includes('/') ? from.split('/')[1] : undefined
      this.emit('muc:message', { room: roomJid, roomJid, from, body, id, type: 'groupchat', server: this.domain, nick, delay })
      if (body) {
        this.emit('message', { from, to, body, id, type: 'groupchat', server: this.domain, thread, delay })
      }
      return
    }

    const pubsubEvent = stanza.getChild('event', NS_PUBSUB_EVENT)
    if (pubsubEvent) {
      this.handlePubsubEvent(stanza)
      return
    }

    this.emit('message', { from, to, body, id, type, server: this.domain, thread, delay })
  }

  private handlePubsubEvent(stanza: Element): void {
    const from = stanza.attrs.from || ''
    const event = stanza.getChild('event', NS_PUBSUB_EVENT)
    if (!event) return
    const items = event.getChild('items')
    if (!items) return
    const node = items.attrs.node || ''
    for (const item of (items.children || []).filter(c => c instanceof Element)) {
      if (item.name !== 'item') continue
      const itemId = item.attrs.id || ''
      const entry = item.getChild('entry', 'http://www.w3.org/2005/Atom')
      this.emit('pubsub:event', { node, itemId, from, server: this.domain, payload: entry ? { entry } : undefined })
    }
  }
}
