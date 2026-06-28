import { EventEmitter } from 'events'
import { connect as tcpConnect } from 'net'
import { connect as tlsConnect } from 'tls'
import { resolveSrv } from 'dns/promises'
import { component as xmppComponent, xml } from '@xmpp/component'
import { Parser as XmlParser, Element } from '@xmpp/xml'
import { XmppComponentConfigStore } from './xmpp-server-storage.js'
import type { XmppStorage } from './storage/types.js'

export interface ServerConnectionInfo {
  type: 'component' | 's2s'
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

interface PendingIQ {
  resolve: (value: Element) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const NS_JABBER_SERVER = 'jabber:server'
const NS_PUBSUB_EVENT = 'http://jabber.org/protocol/pubsub#event'
const NS_PUBSUB = 'http://jabber.org/protocol/pubsub'
const NS_DISCO_INFO = 'http://jabber.org/protocol/disco#info'
const NS_DISCO_ITEMS = 'http://jabber.org/protocol/disco#items'
const NS_MUC = 'http://jabber.org/protocol/muc'
const ATOM_XMLNS = 'http://www.w3.org/2005/Atom'

const NS_APP_SETTINGS = 'appSettings'
const KEY_FEDERATION_SETTINGS = 'federation'

export class XmppServerBridge extends EventEmitter {
  public readonly configStore: XmppComponentConfigStore
  private readonly storage: XmppStorage

  private component: any = null
  private componentDomain: string = ''
  private componentStatus: ServerConnectionInfo['status'] = 'disconnected'

  private federationEnabled: boolean = true
  private s2sDomain: string = ''
  private s2sConnections = new Map<string, { socket: any; connected: boolean }>()

  private mucRooms = new Map<string, Set<string>>()

  private pendingIq = new Map<string, PendingIQ>()
  private readonly iqTimeoutMs = 30000

  private feedPubsubMap = new Map<string, string>()
  private pubsubFeedMap = new Map<string, string>()
  private mucBridgeMap = new Map<string, string>()

  constructor(storage: XmppStorage, passphrase?: string) {
    super()
    this.storage = storage
    this.configStore = new XmppComponentConfigStore(storage, passphrase || 'default')
  }

  async loadSettings(): Promise<void> {
    try {
      const raw = await this.storage.getRecord(NS_APP_SETTINGS, KEY_FEDERATION_SETTINGS)
      if (raw) {
        const settings = JSON.parse(raw)
        if (typeof settings.s2sDomain === 'string') this.s2sDomain = settings.s2sDomain
        if (typeof settings.federationEnabled === 'boolean') this.federationEnabled = settings.federationEnabled
      }
    } catch {
      // Ignore corrupt settings
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const settings = { s2sDomain: this.s2sDomain, federationEnabled: this.federationEnabled }
      await this.storage.putRecord(NS_APP_SETTINGS, KEY_FEDERATION_SETTINGS, JSON.stringify(settings), new Date().toISOString())
    } catch {
      // Ignore save failures
    }
  }

  async connectComponent(host: string, port: number, secret: string, domain: string): Promise<void> {
    if (this.component) {
      throw new Error(`Already connected as component ${this.componentDomain}`)
    }

    this.componentStatus = 'connecting'
    this.emitConnection('component', domain, 'connecting')

    const service = `xmpp://${host}:${port}`
    const comp = xmppComponent({ service, domain, password: secret })
    this.component = comp
    this.componentDomain = domain

    comp.on('online', () => {
      this.componentStatus = 'connected'
      this.emitConnection('component', domain, 'connected')
      console.log(`[XMPP Component] Connected as ${domain}`)
    })

    comp.on('stanza', (stanza: Element) => {
      this.handleComponentStanza(stanza)
    })

    comp.on('status', (status: string) => {
      if (status === 'disconnect' || status === 'offline') {
        this.componentStatus = 'disconnected'
        this.emitConnection('component', domain, 'disconnected')
        this.mucRooms.delete(domain)
        console.log(`[XMPP Component] Disconnected from ${domain}`)
        this.component = null
        this.componentDomain = ''
        for (const [id, pending] of this.pendingIq) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Component disconnected'))
        }
        this.pendingIq.clear()
      }
    })

    comp.on('error', (err: Error) => {
      this.componentStatus = 'error'
      this.emitConnection('component', domain, 'error', err.message)
      console.error(`[XMPP Component] Error: ${err.message}`)
    })

    try {
      await comp.start()
    } catch (err: any) {
      this.componentStatus = 'disconnected'
      this.component = null
      this.componentDomain = ''
      this.emitConnection('component', domain, 'error', err.message)
      throw new Error(`Failed to connect component ${domain}: ${err.message}`)
    }
  }

  async disconnectComponent(): Promise<void> {
    if (!this.component) {
      throw new Error('Component not connected')
    }
    const domain = this.componentDomain
    await this.component.stop()
    this.component = null
    this.componentDomain = ''
    this.componentStatus = 'disconnected'
    this.mucRooms.delete(domain)
    this.emitConnection('component', domain, 'disconnected')
    for (const [id, pending] of this.pendingIq) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Component disconnected'))
    }
    this.pendingIq.clear()
  }

  isComponentConnected(): boolean {
    return this.componentStatus === 'connected'
  }

  setFederationEnabled(enabled: boolean): void {
    this.federationEnabled = enabled
    if (!enabled) {
      void this.disconnectAll()
    }
    void this.saveSettings()
  }

  isFederationEnabled(): boolean {
    return this.federationEnabled
  }

  setS2SDomain(domain: string): void {
    this.s2sDomain = domain
    void this.saveSettings()
  }

  async resolveComponentEndpoint(domain: string): Promise<{ host: string; port: number }> {
    try {
      const records = await resolveSrv(`_xmpp-component._tcp.${domain}`)
      return { host: records[0].name, port: records[0].port }
    } catch {
      return { host: domain, port: 5347 }
    }
  }

  getS2SDomain(): string {
    return this.s2sDomain
  }

  async sendMessage(to: string, body: string, options?: { thread?: string }, fromLocalpart?: string): Promise<string> {
    const id = Math.random().toString(36).substring(2, 15)
    const from = this.getFromAddress(fromLocalpart)
    const children: Element[] = [xml('body', {}, body)]
    if (options?.thread) {
      children.push(xml('thread', {}, options.thread))
    }
    const msg = xml('message', { to, from, type: 'chat', id }, ...children)
    await this.sendStanza(to, msg)
    return id
  }

  async joinMuc(roomJid: string, nick: string, fromLocalpart?: string): Promise<void> {
    const from = this.getFromAddress(fromLocalpart)
    const fullJid = `${roomJid}/${nick}`
    const pres = xml('presence', { to: fullJid, from },
      xml('x', { xmlns: NS_MUC })
    )
    await this.sendStanza(roomJid, pres)

    const domain = roomJid.includes('@') ? roomJid.split('@')[1] : ''
    const rooms = this.mucRooms.get(domain) || new Set()
    rooms.add(roomJid)
    this.mucRooms.set(domain, rooms)
  }

  async sendMucMessage(roomJid: string, body: string, fromLocalpart?: string): Promise<string> {
    const id = Math.random().toString(36).substring(2, 15)
    const from = this.getFromAddress(fromLocalpart)
    const msg = xml('message', { to: roomJid, from, type: 'groupchat', id },
      xml('body', {}, body)
    )
    await this.sendStanza(roomJid, msg)
    return id
  }

  async leaveMuc(roomJid: string, fromLocalpart?: string): Promise<void> {
    const from = this.getFromAddress(fromLocalpart)
    const pres = xml('presence', {
      to: `${roomJid}/${this.getMucNick()}`,
      from,
      type: 'unavailable'
    })
    await this.sendStanza(roomJid, pres).catch(() => {})

    const domain = roomJid.includes('@') ? roomJid.split('@')[1] : ''
    const rooms = this.mucRooms.get(domain)
    if (rooms) {
      rooms.delete(roomJid)
      if (rooms.size === 0) this.mucRooms.delete(domain)
    }
  }

  // Phase 2: PubSub operations

  async pubsubSubscribe(nodeJid: string, node: string, fromLocalpart?: string): Promise<void> {
    const from = this.getFromAddress(fromLocalpart)
    const iq = xml('iq', { type: 'set', id: '', to: nodeJid, from },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('subscribe', { node, jid: from })
      )
    )
    await this.sendIQ(nodeJid, iq)
  }

  async pubsubPublish(nodeJid: string, node: string, itemId: string, payload: Element, fromLocalpart?: string): Promise<string> {
    const iqId = Math.random().toString(36).substring(2, 15)
    const iq = xml('iq', { type: 'set', id: iqId, to: nodeJid, from: this.getFromAddress(fromLocalpart) },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('publish', { node },
          xml('item', { id: itemId }, payload)
        )
      )
    )
    await this.sendIQ(nodeJid, iq)
    return itemId
  }

  async pubsubGetItems(nodeJid: string, node: string, maxItems?: number, fromLocalpart?: string): Promise<Element[]> {
    const iqId = Math.random().toString(36).substring(2, 15)
    const attrs: Record<string, string> = { node }
    if (maxItems !== undefined) attrs['max_items'] = String(maxItems)
    const iq = xml('iq', { type: 'get', id: iqId, to: nodeJid, from: this.getFromAddress(fromLocalpart) },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('items', attrs)
      )
    )
    const result = await this.sendIQ(nodeJid, iq)
    const pubsubEl = result.getChild('pubsub')
    if (!pubsubEl) return []
    const itemsEl = pubsubEl.getChild('items')
    if (!itemsEl) return []
    return itemsEl.children.filter((c: any) => c.name === 'item') as Element[]
  }

  async pubsubUnsubscribe(nodeJid: string, node: string, fromLocalpart?: string): Promise<void> {
    const from = this.getFromAddress(fromLocalpart)
    const iq = xml('iq', { type: 'set', id: '', to: nodeJid, from },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('unsubscribe', { node, jid: from })
      )
    )
    await this.sendIQ(nodeJid, iq)
  }

  async pubsubCreateNode(nodeJid: string, node: string, fromLocalpart?: string): Promise<void> {
    const iq = xml('iq', { type: 'set', id: '', to: nodeJid, from: this.getFromAddress(fromLocalpart) },
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('create', { node })
      )
    )
    await this.sendIQ(nodeJid, iq)
  }

  // Phase 3: Feed bridge config

  async setFeedBridge(feedTopic: string, pubsubNode: string): Promise<void> {
    this.feedPubsubMap.set(feedTopic, pubsubNode)
    this.pubsubFeedMap.set(pubsubNode, feedTopic)
  }

  async removeFeedBridge(feedTopic: string): Promise<void> {
    const pubsubNode = this.feedPubsubMap.get(feedTopic)
    if (pubsubNode) {
      this.feedPubsubMap.delete(feedTopic)
      this.pubsubFeedMap.delete(pubsubNode)
    }
  }

  getFeedBridge(feedTopic: string): string | undefined {
    return this.feedPubsubMap.get(feedTopic)
  }

  getAllFeedBridges(): Array<{ feedTopic: string; pubsubNode: string }> {
    return Array.from(this.feedPubsubMap.entries()).map(([feedTopic, pubsubNode]) => ({ feedTopic, pubsubNode }))
  }

  getPubsubFeedBridge(pubsubNode: string): string | undefined {
    return this.pubsubFeedMap.get(pubsubNode)
  }

  async crossPostFeedToPubSub(feedPost: { id: string; body: string; title?: string; summary?: string; author?: string; categories?: string[] }): Promise<void> {
    if (!this.component) return
    const pubsubNode = this.feedPubsubMap.get(feedPost.id.split(':')[0])
    if (!pubsubNode) return

    const children: Element[] = []
    if (feedPost.title) {
      children.push(xml('title', { type: 'text' }, feedPost.title))
    }
    children.push(xml('id', {}, feedPost.id))
    children.push(xml('published', {}, new Date().toISOString()))
    children.push(xml('updated', {}, new Date().toISOString()))
    if (feedPost.author) {
      children.push(xml('author', {}, xml('name', {}, feedPost.author)))
    }
    if (feedPost.summary) {
      children.push(xml('summary', { type: 'text' }, feedPost.summary))
    }
    children.push(xml('content', { type: 'text' }, feedPost.body))
    if (feedPost.categories) {
      for (const cat of feedPost.categories) {
        children.push(xml('category', { term: cat }))
      }
    }
    const entry = xml('entry', { xmlns: ATOM_XMLNS }, ...children)
    await this.pubsubPublish(this.componentDomain, pubsubNode, feedPost.id, entry).catch((err) => {
      console.warn(`[Bridge] Failed to cross-post to pubsub: ${err.message}`)
    })
  }

  // Phase 4: Service Discovery

  async discoInfo(jid: string, fromLocalpart?: string): Promise<ServerDiscoInfoResult> {
    const iqId = Math.random().toString(36).substring(2, 15)
    const iq = xml('iq', { type: 'get', id: iqId, to: jid, from: this.getFromAddress(fromLocalpart) },
      xml('query', { xmlns: NS_DISCO_INFO })
    )
    const result = await this.sendIQ(jid, iq)
    const query = result.getChild('query')
    if (!query) return { identities: [], features: [] }
    const identities = query.children
      .filter((c: any) => c.name === 'identity')
      .map((c: Element) => ({ category: c.attrs.category || '', type: c.attrs.type || '', name: c.attrs.name }))
    const features = query.children
      .filter((c: any) => c.name === 'feature')
      .map((c: Element) => c.attrs.var || '')
      .filter(Boolean)
    return { identities, features }
  }

  async discoItems(jid: string, fromLocalpart?: string): Promise<ServerDiscoItemsResult> {
    const iqId = Math.random().toString(36).substring(2, 15)
    const iq = xml('iq', { type: 'get', id: iqId, to: jid, from: this.getFromAddress(fromLocalpart) },
      xml('query', { xmlns: NS_DISCO_ITEMS })
    )
    const result = await this.sendIQ(jid, iq)
    const query = result.getChild('query')
    if (!query) return { items: [] }
    const items = query.children
      .filter((c: any) => c.name === 'item')
      .map((c: Element) => ({ jid: c.attrs.jid || '', node: c.attrs.node, name: c.attrs.name }))
    return { items }
  }

  // Phase 5: MUC bridge config

  async setMucBridge(serverRoom: string, p2pRoom: string): Promise<void> {
    this.mucBridgeMap.set(serverRoom, p2pRoom)
  }

  async removeMucBridge(serverRoom: string): Promise<void> {
    this.mucBridgeMap.delete(serverRoom)
  }

  getMucBridge(serverRoom: string): string | undefined {
    return this.mucBridgeMap.get(serverRoom)
  }

  getAllMucBridges(): Array<{ serverRoom: string; p2pRoom: string }> {
    return Array.from(this.mucBridgeMap.entries()).map(([serverRoom, p2pRoom]) => ({ serverRoom, p2pRoom }))
  }

  // Status

  getConnectionInfo(): ServerConnectionInfo[] {
    const infos: ServerConnectionInfo[] = []
    if (this.componentDomain) {
      infos.push({
        type: 'component',
        domain: this.componentDomain,
        status: this.componentStatus
      })
    }
    if (this.s2sDomain) {
      infos.push({
        type: 's2s',
        domain: this.s2sDomain,
        status: 'connected'
      })
    }
    return infos
  }

  isFederatedJid(target: string): boolean {
    if (!this.federationEnabled) return false
    const atIndex = target.lastIndexOf('@')
    if (atIndex < 0) return false
    const domain = target.slice(atIndex + 1)
    return domain !== 'p2p' && domain !== ''
  }

  async disconnectAll(): Promise<void> {
    if (this.component) {
      await this.component.stop().catch(() => {})
      this.component = null
      this.componentDomain = ''
      this.componentStatus = 'disconnected'
    }
    for (const [domain, conn] of this.s2sConnections) {
      try { conn.socket.end() } catch {}
    }
    this.s2sConnections.clear()
    this.mucRooms.clear()
    for (const [id, pending] of this.pendingIq) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Bridge disconnected'))
    }
    this.pendingIq.clear()
  }

  // Private helpers

  private getFromAddress(localpart?: string): string {
    const domain = this.componentDomain || this.s2sDomain || 'p2p-node'
    return localpart ? `${localpart}@${domain}` : domain
  }

  private getMucNick(): string {
    return 'p2p-user'
  }

  private emitConnection(type: 'component' | 's2s', domain: string, status: ServerConnectionInfo['status'], error?: string) {
    this.emit('connection', { type, domain, status, error } as ServerConnectionInfo)
  }

  // Stanza sending

  private async sendStanza(to: string, stanza: Element): Promise<void> {
    if (!this.federationEnabled) {
      throw new Error('Federation is disabled')
    }
    if (this.component) {
      this.component.send(stanza)
      return
    }
    if (this.s2sDomain) {
      await this.sendViaS2S(to, stanza)
      return
    }
    throw new Error('No federation connection available')
  }

  // IQ engine

  private async sendIQ(to: string, iq: Element): Promise<Element> {
    const id = iq.attrs.id || Math.random().toString(36).substring(2, 15)
    iq.attrs.id = id

    return new Promise<Element>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIq.delete(id)
        reject(new Error(`IQ timed out to ${to}`))
      }, this.iqTimeoutMs)

      this.pendingIq.set(id, { resolve, reject, timer })
      this.sendStanza(to, iq).catch(err => {
        clearTimeout(timer)
        this.pendingIq.delete(id)
        reject(err)
      })
    })
  }

  private resolvePendingIQ(id: string, result: Element): void {
    const pending = this.pendingIq.get(id)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingIq.delete(id)
      pending.resolve(result)
    }
  }

  private rejectPendingIQ(id: string, error: Error): void {
    const pending = this.pendingIq.get(id)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingIq.delete(id)
      pending.reject(error)
    }
  }

  // Inbound handler (Phase 1 - all stanzas)

  private handleComponentStanza(stanza: Element): void {
    const domain = this.componentDomain
    if (!domain) return

    if (stanza.name === 'message') {
      this.handleInboundMessage(domain, stanza)
    } else if (stanza.name === 'presence') {
      this.handleInboundPresence(domain, stanza)
    } else if (stanza.name === 'iq') {
      this.handleInboundIQ(domain, stanza)
    }
  }

  private handleInboundMessage(domain: string, stanza: Element): void {
    const type = stanza.attrs.type || 'chat'
    const from = stanza.attrs.from || ''
    const to = stanza.attrs.to || ''
    const id = stanza.attrs.id || ''

    // Phase 1: Check for PubSub event
    const eventEl = stanza.getChild('event')
    if (eventEl && eventEl.attrs.xmlns === NS_PUBSUB_EVENT) {
      this.handleInboundPubSubEvent(domain, from, stanza)
      return
    }

    const bodyEl = stanza.getChild('body')
    const body = bodyEl?.text()

    // Phase 1: Check for headline type (pubsub notification without event element)
    if (type === 'headline' && body) {
      this.emit('message', {
        from, to, body, id, type, server: domain
      } as ServerMessageEvent)
      return
    }

    if (type === 'groupchat' && body) {
      const roomJid = from.includes('/') ? from.slice(0, from.indexOf('/')) : ''
      const nick = from.includes('/') ? from.slice(from.indexOf('/') + 1) : ''
      const event: ServerMucMessageEvent = { room: roomJid, from: nick || from, body, id, server: domain }
      this.emit('muc:message', event)

      // Phase 5: Cross-MUC bridge
      const p2pRoom = this.mucBridgeMap.get(roomJid)
      if (p2pRoom) {
        this.emit('muc:bridge', { serverRoom: roomJid, p2pRoom, from: nick || from, body, id })
      }
      return
    }

    if (type === 'chat' && body) {
      const threadEl = stanza.getChild('thread')
      const thread = threadEl?.text()
      const delayEl = stanza.getChild('delay')
      this.emit('message', {
        from, to, body, id, type, server: domain,
        thread,
        delay: delayEl ? { stamp: delayEl.attrs.stamp || '', from: delayEl.attrs.from } : undefined
      } as ServerMessageEvent)
    }
  }

  // Phase 1: Inbound PubSub event handler

  private handleInboundPubSubEvent(domain: string, from: string, stanza: Element): void {
    const eventEl = stanza.getChild('event')
    if (!eventEl) return
    const itemsEl = eventEl.getChild('items')
    if (!itemsEl) return
    const node = itemsEl.attrs.node || ''
    const itemElements = itemsEl.children.filter((c: any) => c.name === 'item') as Element[]

    for (const item of itemElements) {
      const itemId = item.attrs.id || ''

      // Check for Atom entry (feed/collection posts)
      const entryEl = item.getChild('entry')
      const bodyEl = item.getChild('body')

      if (entryEl && entryEl.attrs.xmlns === ATOM_XMLNS) {
        const titleEl = entryEl.getChild('title')
        const contentEl = entryEl.getChild('content')
        const body = contentEl?.text() || entryEl.text() || ''
        const title = titleEl?.text()

        const pubsubEvent: ServerPubsubEvent = { node, itemId, from, server: domain, payload: { body, entry: entryEl } }
        this.emit('pubsub:event', pubsubEvent)

        // Phase 3: Check if this pubsub node is bridged to a feed
        const feedTopic = this.pubsubFeedMap.get(node)
        if (feedTopic) {
          this.emit('feed:bridge', {
            feedTopic,
            itemId,
            body,
            title,
            from,
            server: domain
          })
        }
      } else if (bodyEl) {
        const body = bodyEl.text()
        const pubsubEvent: ServerPubsubEvent = { node, itemId, from, server: domain, payload: { body } }
        this.emit('pubsub:event', pubsubEvent)
      }
    }
  }

  // Phase 1: Inbound presence handler

  private handleInboundPresence(domain: string, stanza: Element): void {
    const type = stanza.attrs.type || 'available'
    const from = stanza.attrs.from || ''
    const showEl = stanza.getChild('show')
    const statusEl = stanza.getChild('status')
    this.emit('presence', {
      from, type, server: domain,
      show: showEl?.text(),
      status: statusEl?.text()
    })
  }

  // Phase 1: Inbound IQ handler

  private handleInboundIQ(domain: string, stanza: Element): void {
    const type = stanza.attrs.type || ''
    const id = stanza.attrs.id || ''

    if (type === 'result' || type === 'error') {
      if (type === 'error') {
        const errorEl = stanza.getChild('error')
        const text = errorEl?.getChild('text')?.text() || 'IQ error'
        this.rejectPendingIQ(id, new Error(text))
      } else {
        this.resolvePendingIQ(id, stanza)
      }
      return
    }

    // Incoming IQ request from server - handle disco queries
    if (type === 'get') {
      const queryEl = stanza.getChild('query')
      if (!queryEl) return
      const xmlns = queryEl.attrs.xmlns

      if (xmlns === NS_DISCO_INFO) {
        this.handleDiscoInfoIQ(domain, stanza)
      } else if (xmlns === NS_DISCO_ITEMS) {
        this.handleDiscoItemsIQ(domain, stanza)
      } else if (xmlns === NS_PUBSUB) {
        this.handlePubsubIQ(domain, stanza)
      }
    }
  }

  // Phase 4: Disco IQ handlers

  private handleDiscoInfoIQ(domain: string, stanza: Element): void {
    const id = stanza.attrs.id
    const from = stanza.attrs.from || domain
    const to = stanza.attrs.to || this.getFromAddress()

    const result = xml('iq', { type: 'result', id, from: to, to: from },
      xml('query', { xmlns: NS_DISCO_INFO },
        xml('identity', { category: 'pubsub', type: 'p2p', name: 'XMPP P2P' }),
        xml('feature', { var: NS_PUBSUB }),
        xml('feature', { var: NS_PUBSUB_EVENT }),
        xml('feature', { var: NS_DISCO_INFO }),
        xml('feature', { var: NS_DISCO_ITEMS }),
        xml('feature', { var: 'http://jabber.org/protocol/muc' }),
        xml('feature', { var: 'urn:xmpp:microblog:0' })
      )
    )
    this.sendStanza(domain, result).catch(() => {})
  }

  private handleDiscoItemsIQ(domain: string, stanza: Element): void {
    const id = stanza.attrs.id
    const from = stanza.attrs.from || domain
    const to = stanza.attrs.to || this.getFromAddress()

    const items = this.feedPubsubMap.size > 0
      ? Array.from(this.feedPubsubMap.entries()).map(([feedTopic, pubsubNode]) =>
          xml('item', { jid: to, node: pubsubNode, name: `Feed: ${feedTopic}` })
        )
      : []

    const result = xml('iq', { type: 'result', id, from: to, to: from },
      xml('query', { xmlns: NS_DISCO_ITEMS }, ...items)
    )
    this.sendStanza(domain, result).catch(() => {})
  }

  // Phase 2/4: PubSub IQ handler (server requesting pubsub operations)

  private handlePubsubIQ(domain: string, stanza: Element): void {
    const queryEl = stanza.getChild('pubsub') || stanza.getChild('query')
    if (!queryEl) return

    const id = stanza.attrs.id
    const from = stanza.attrs.from || domain
    const to = stanza.attrs.to || this.getFromAddress()

    // Respond with error for unsupported pubsub operations
    const error = xml('iq', { type: 'error', id, from: to, to: from },
      xml('error', { type: 'cancel' },
        xml('feature-not-implemented', { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' })
      )
    )
    this.sendStanza(domain, error).catch(() => {})
  }

  // S2S (existing)

  private async sendViaS2S(to: string, stanza: Element): Promise<void> {
    const toDomain = to.includes('@') ? to.split('@')[1] : to
    let conn = this.s2sConnections.get(toDomain)

    if (!conn || !conn.connected) {
      conn = await this.establishS2SConnection(toDomain)
      this.s2sConnections.set(toDomain, conn)
    }

    await this.writeS2SStanza(conn.socket, stanza)
  }

  private async establishS2SConnection(remoteDomain: string): Promise<{ socket: any; connected: boolean }> {
    const endpoint = await this.resolveS2SEndpoint(remoteDomain)
    console.log(`[S2S] Connecting to ${remoteDomain} at ${endpoint.host}:${endpoint.port}`)

    return new Promise((resolve, reject) => {
      const socket = tcpConnect(endpoint.port, endpoint.host, () => {
        const streamOpen = `<?xml version='1.0'?><stream:stream to='${remoteDomain}' from='${this.s2sDomain}' version='1.0' xml:lang='en' xmlns='${NS_JABBER_SERVER}' xmlns:stream='http://etherx.jabber.org/streams'>`
        socket.write(streamOpen)
      })

      const parser = new XmlParser()
      let streamOpened = false

      parser.on('element', (element: Element) => {
        if (!streamOpened) {
          streamOpened = true
          return
        }
        if (element.name === 'features' && element.attrs.xmlns !== NS_JABBER_SERVER) {
          this.attemptS2SUpgrade(socket, parser, remoteDomain, element)
            .then(() => resolve({ socket, connected: true }))
            .catch(reject)
        }
      })

      socket.on('error', reject)
      socket.on('close', () => this.s2sConnections.delete(remoteDomain))
      socket.on('data', (data) => parser.write(data.toString('utf8')))

      setTimeout(() => resolve({ socket, connected: true }), 5000)
    })
  }

  private async attemptS2SUpgrade(socket: any, _parser: XmlParser, domain: string, _features: Element): Promise<void> {
    const starttls = xml('starttls', { xmlns: 'urn:ietf:params:xml:ns:xmpp-tls' })
    return new Promise((resolve, reject) => {
      let tlsNegotiated = false
      const tlsParser = new XmlParser()
      tlsParser.on('element', (el: Element) => {
        if (el.name === 'proceed' && !tlsNegotiated) {
          tlsNegotiated = true
          const tlsSocket = tlsConnect({
            socket,
            servername: domain,
            rejectUnauthorized: false
          }, () => {
            const reOpen = `<?xml version='1.0'?><stream:stream to='${domain}' from='${this.s2sDomain}' version='1.0' xml:lang='en' xmlns='${NS_JABBER_SERVER}' xmlns:stream='http://etherx.jabber.org/streams'>`
            tlsSocket.write(reOpen)
            resolve()
          })
          tlsSocket.on('data', (data) => _parser.write(data.toString('utf8')))
          tlsSocket.on('error', reject)
        }
      })
      socket.write(starttls.toString())
      socket.on('data', (data: Buffer) => {
        if (!tlsNegotiated) tlsParser.write(data.toString('utf8'))
      })
    })
  }

  private async writeS2SStanza(socket: any, stanza: Element): Promise<void> {
    stanza.attrs.from = stanza.attrs.from || this.s2sDomain
    socket.write(stanza.toString())
  }

  private async resolveS2SEndpoint(domain: string): Promise<{ host: string; port: number }> {
    try {
      const records = await resolveSrv(`_xmpps-server._tcp.${domain}`)
      return { host: records[0].name, port: records[0].port }
    } catch {
      try {
        const records = await resolveSrv(`_xmpp-server._tcp.${domain}`)
        return { host: records[0].name, port: records[0].port }
      } catch {
        return { host: domain, port: 5269 }
      }
    }
  }

  async sendServerMessage(roomJid: string, body: string, fromLocalpart?: string): Promise<string> {
    return this.sendMucMessage(roomJid, body, fromLocalpart)
  }
}
