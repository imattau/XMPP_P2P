import { EventEmitter } from 'events'
import { client as xmppClient, xml, jid as xmppJid } from '@xmpp/client'
import { Element } from '@xmpp/xml'
import { buildXepElements, parseXepMetadata, RECEIPTS_XMLNS } from './xmpp-xep-helpers.js'

declare var WebSocket: any

export interface ServerConnectionInfo {
  type: 'client'
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
  receipt?: { type: 'request' | 'received'; id: string }
  replace?: string
  reply?: { id: string; to?: string }
  chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
  mam?: boolean
  queryId?: string
  fromSelf?: boolean
  stanzaError?: { condition?: string; text?: string }
}

export interface ServerMucMessageEvent {
  room: string
  from: string
  body: string
  id: string
  server: string
  nick?: string
  fromSelf?: boolean
  mam?: boolean
  delay?: { stamp: string; from?: string }
}

export interface ServerPubsubEvent {
  node: string
  itemId: string
  from: string
  server: string
  payload?: { body?: string; entry?: Element }
}

export type ServerPubsubSubscriptionStatus = 'subscribed' | 'pending' | 'unconfigured'

export interface ServerDiscoInfoResult {
  identities: Array<{ category: string; type: string; name?: string }>
  features: string[]
}

export interface ServerDiscoItemsResult {
  items: Array<{ jid: string; node?: string; name?: string }>
}

export interface ServerMucRoomInfo {
  roomJid: string
  name: string
  serviceJid: string
}

const NS_PUBSUB = 'http://jabber.org/protocol/pubsub'
const NS_PUBSUB_EVENT = 'http://jabber.org/protocol/pubsub#event'
const NS_MUC = 'http://jabber.org/protocol/muc'
const NS_MUC_USER = 'http://jabber.org/protocol/muc#user'
const NS_MUC_OWNER = 'http://jabber.org/protocol/muc#owner'
const NS_ROSTER = 'jabber:iq:roster'
const NS_MAM = 'urn:xmpp:mam:2'
const NS_DELAY = 'urn:xmpp:delay'
const NS_CARBONS = 'urn:xmpp:carbons:2'
const NS_HTTP_UPLOAD_PREFIX = 'urn:xmpp:http:upload:'
const NS_STANZAS = 'urn:ietf:params:xml:ns:xmpp-stanzas'

function iqErrorMessage(stanza: Element): string {
  const error = stanza.getChild('error')
  const condition = error?.children.find((child): child is Element =>
    child instanceof Element && child.name !== 'text' && child.attrs.xmlns === NS_STANZAS
  )?.name

  switch (condition) {
    case 'service-unavailable':
    case 'feature-not-implemented':
      return 'The XMPP server does not support this request.'
    case 'forbidden':
    case 'not-authorized':
      return 'The XMPP server denied this request.'
    case 'item-not-found':
      return 'The requested XMPP item was not found.'
    case 'bad-request':
      return 'The XMPP server rejected this request as invalid.'
    case 'remote-server-not-found':
    case 'remote-server-timeout':
      return 'The XMPP server could not reach the remote service.'
    case 'internal-server-error':
      return 'The XMPP server encountered an internal error.'
  }

  const serverText = error?.getChild('text', NS_STANZAS)?.text().trim()
  return serverText || 'The XMPP server rejected the request.'
}

interface PendingIQ {
  resolve: (value: Element) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class RegistrationResponseError extends Error {}
const CAPTCHA_REGISTRATION_MESSAGE = 'This server requires CAPTCHA verification. Complete registration on the provider website, then sign in here.'

function decodeRegistrationXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    if (token === 'amp') return '&'
    if (token === 'lt') return '<'
    if (token === 'gt') return '>'
    if (token === 'quot') return '"'
    if (token === 'apos') return "'"
    const codePoint = token[1]?.toLowerCase() === 'x' ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10)
    try { return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity } catch { return entity }
  })
}

function registrationDataForm(
  buffer: string,
  username: string,
  password: string,
  registrationFields: Record<string, string> = {}
): Element | undefined {
  const form = buffer.match(/<x\b([^>]*)>([\s\S]*?)<\/x>/i)
  if (!form || !/\bxmlns=['"]jabber:x:data['"]/i.test(form[1]) || !/\btype=['"]form['"]/i.test(form[1])) return undefined

  const fields: Element[] = []
  let hasUsername = false
  let hasPassword = false
  const submittedFields = { ...registrationFields }
  for (const field of form[2].matchAll(/<field\b([^>]*?)(?:\s*\/\s*>|\s*>([\s\S]*?)<\/field>)/gi)) {
    const attributes = field[1]
    const variable = attributes.match(/\bvar=['"]([^'"]+)['"]/i)?.[1]
    if (!variable) continue
    const contents = field[2] ?? ''
    const values = [...contents.matchAll(/<value\b[^>]*>([\s\S]*?)<\/value>/gi)]
      .map((value) => decodeRegistrationXmlText(value[1].replace(/<[^>]*>/g, '')))
    let valuesToSubmit = values
    if (variable === 'username') {
      valuesToSubmit = [username]
      hasUsername = true
    } else if (variable === 'password') {
      valuesToSubmit = [password]
      hasPassword = true
    } else if (Object.hasOwn(submittedFields, variable)) {
      valuesToSubmit = [submittedFields[variable]]
      delete submittedFields[variable]
    } else if (/\btype=['"]hidden['"]/i.test(attributes)) {
      // Preserve server-provided hidden fields such as FORM_TYPE.
    } else if (/<required\b/i.test(contents)) {
      if (/<captcha\b/i.test(buffer) || /captcha|human[_ -]?verification/i.test(variable)) {
        throw new RegistrationResponseError(CAPTCHA_REGISTRATION_MESSAGE)
      }
      throw new RegistrationResponseError(`The XMPP server requires additional registration information: ${variable}`)
    } else {
      continue
    }
    fields.push(xml('field', { var: variable }, ...valuesToSubmit.map((value) => xml('value', {}, value))))
  }
  if (!hasUsername || !hasPassword) {
    throw new RegistrationResponseError('The XMPP server registration form does not include username and password fields.')
  }
  return xml('x', { xmlns: 'jabber:x:data', type: 'submit' }, ...fields)
}

function normalizeXmppWebSocketUrl(value: string): string {
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    throw new Error('XMPP WebSocket URL is invalid')
  }

  const hostname = endpoint.hostname.toLowerCase()
  const ipv4 = hostname.split('.').map(Number)
  const isLoopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '[::1]'
    || (ipv4.length === 4 && ipv4[0] === 127 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255))
  const securePage = typeof globalThis.location !== 'undefined' && globalThis.location.protocol === 'https:'
  if ((endpoint.protocol !== 'wss:' && !(endpoint.protocol === 'ws:' && isLoopback))
    || (endpoint.protocol === 'ws:' && securePage)
    || !endpoint.hostname
    || endpoint.username
    || endpoint.password
    || endpoint.hash) {
    throw new Error('XMPP WebSocket URLs must use wss://. ws:// is only allowed for localhost development servers served over http://.')
  }
  return endpoint.toString()
}

function isNativeNodeRuntime(): boolean {
  return typeof window === 'undefined'
}

function normalizeXmppTcpUrl(value: string): string {
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    throw new Error('XMPP TCP service address is invalid')
  }
  if (!isNativeNodeRuntime()
    || (endpoint.protocol !== 'xmpp:' && endpoint.protocol !== 'xmpps:')
    || !endpoint.hostname
    || endpoint.username
    || endpoint.password
    || (endpoint.pathname !== '' && endpoint.pathname !== '/')
    || endpoint.search
    || endpoint.hash) {
    throw new Error('XMPP TCP connections are available only in native desktop runtimes and require an xmpp:// or xmpps:// address')
  }
  if (!endpoint.port) endpoint.port = endpoint.protocol === 'xmpps:' ? '5223' : '5222'
  return endpoint.toString()
}

function normalizeXmppServiceUrl(value: string): string {
  const protocol = value.slice(0, value.indexOf(':') + 1).toLowerCase()
  return protocol === 'xmpp:' || protocol === 'xmpps:'
    ? normalizeXmppTcpUrl(value)
    : normalizeXmppWebSocketUrl(value)
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
  private lastError?: string
  private pendingIq = new Map<string, PendingIQ>()
  private serverPresenceResources = new Map<string, Map<string, { show?: string; status?: string; priority: number }>>()
  private configuringMucRooms = new Set<string>()
  private httpUploadService?: { jid: string; namespace: string }
  private readonly iqTimeoutMs = 30000

  get connectionInfo(): ServerConnectionInfo {
    return { type: 'client', domain: this.domain, status: this.status, error: this.lastError }
  }

  get isConnected(): boolean {
    return this.status === 'connected'
  }

  get accountJid(): string | undefined {
    return this.client?.jid?.toString()
  }

  async discoverWebSocketUrl(domain: string): Promise<string | null> {
    return this.discoverViaHostMeta(domain)
  }

  private async discoverViaHostMeta(domain: string): Promise<string | null> {
    const rel = 'urn:xmpp:alt-connections:websocket'
    const secureWebSocket = (candidate: unknown): string | null => {
      if (typeof candidate !== 'string') return null
      try {
        const endpoint = new URL(candidate)
        return endpoint.protocol === 'wss:' ? endpoint.toString() : null
      } catch {
        return null
      }
    }

    // XEP-0156 host metadata is the current HTTPS-based discovery mechanism.
    // CORS may prevent a browser app from reading it; in that case the caller
    // continues with the explicit or well-known endpoint fallbacks.
    try {
      const response = await fetch(`https://${domain}/.well-known/host-meta.json`, {
        signal: AbortSignal.timeout(4000),
        credentials: 'omit',
        headers: { Accept: 'application/jrd+json, application/json' },
      })
      if (response.ok && new URL(response.url).protocol === 'https:') {
        const metadata = await response.json() as { links?: Array<{ rel?: unknown; href?: unknown }> }
        for (const link of metadata.links ?? []) {
          if (link.rel !== rel) continue
          const endpoint = secureWebSocket(link.href)
          if (endpoint) return endpoint
        }
      }
    } catch {}

    try {
      const response = await fetch(`https://${domain}/.well-known/host-meta`, {
        signal: AbortSignal.timeout(4000),
        credentials: 'omit',
        headers: { Accept: 'application/xrd+xml, application/xml, text/xml' },
      })
      if (!response.ok || new URL(response.url).protocol !== 'https:') return null
      const document = await response.text()
      const links = document.match(/<Link\b[^>]*>/gi) ?? []
      for (const link of links) {
        const attributes = new Map<string, string>()
        for (const match of link.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
          attributes.set(match[1].toLowerCase(), match[3].replace(/&amp;/g, '&'))
        }
        if (attributes.get('rel') !== rel) continue
        const endpoint = secureWebSocket(attributes.get('href'))
        if (endpoint) return endpoint
      }
    } catch {}
    return null
  }

  async connect(credentials: XmppClientCredentials): Promise<void> {
    await this.disconnect().catch(() => {})

    const jidObj = xmppJid(credentials.jid)
    this.domain = jidObj.domain
    this.status = 'connecting'
    this.lastError = undefined
    this.emit('connection', this.connectionInfo)

    const requestedService = credentials.service?.trim()
    let services: Array<{ url: string; timeoutMs: number }>
    if (requestedService && requestedService.includes('://')) {
      // Explicit service addresses are authoritative; never silently use another endpoint.
      try {
        services = [{ url: normalizeXmppServiceUrl(requestedService), timeoutMs: 30000 }]
      } catch (error) {
        this.status = 'error'
        this.lastError = error instanceof Error ? error.message : String(error)
        this.emit('connection', { ...this.connectionInfo, status: 'error', error: this.lastError })
        throw error
      }
    } else {
      const domain = requestedService || this.domain
      const discovered = await this.discoverWebSocketUrl(domain)
      services = [...new Set([...(discovered ? [discovered] : []), ...this.defaultWsUrls(domain)])]
        .map((url, index) => ({ url, timeoutMs: discovered && index === 0 ? 20000 : 12000 }))
      if (isNativeNodeRuntime()) {
        services.push(
          { url: `xmpp://${domain}:5222`, timeoutMs: 15000 },
          { url: `xmpps://${domain}:5223`, timeoutMs: 15000 },
        )
      }
    }

    let lastError: Error | undefined
    const attemptedServices: string[] = []
    for (const service of services) {
      attemptedServices.push(service.url)
      this.status = 'connecting'
      this.lastError = undefined
      this.emit('connection', this.connectionInfo)
      try {
        await this.connectToService(credentials, jidObj, service.url, service.timeoutMs)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (this.isAuthenticationFailure(lastError)) break
      }
    }

    this.status = 'error'
    const endpointSummary = attemptedServices.length > 0
      ? `Endpoint${attemptedServices.length === 1 ? '' : 's'} tried: ${attemptedServices.join(', ')}`
      : ''
    this.lastError = [lastError?.message || 'Could not connect to the XMPP server', endpointSummary]
      .filter(Boolean)
      .join('. ')
    this.emit('connection', { ...this.connectionInfo, status: 'error', error: this.lastError })
    throw new Error(`Failed to connect: ${this.lastError}`)
  }

  private isAuthenticationFailure(error: Error): boolean {
    return /not[- ]authorized|invalid credentials|authentication failed|account[- ]disabled|temporary-auth-failure|mechanism-too-weak/i.test(error.message)
  }

  private async connectToService(
    credentials: XmppClientCredentials,
    jidObj: ReturnType<typeof xmppJid>,
    service: string,
    timeoutMs: number
  ): Promise<void> {
    const protocol = service.slice(0, service.indexOf(':') + 1).toLowerCase()
    const nativeTcp = protocol === 'xmpp:' || protocol === 'xmpps:'
    service = normalizeXmppServiceUrl(service)
    this.client = xmppClient({
      domain: this.domain,
      username: jidObj.local,
      password: credentials.password,
      service,
    })
    const client = this.client

    if (nativeTcp) {
      // STARTTLS is mandatory for native TCP: never send SASL credentials or
      // XMPP payloads over an unencrypted raw socket.
      ;(client as any).middleware?.use((context: any, next: () => Promise<unknown>) => {
        if (context.stanza?.is?.('features', 'http://etherx.jabber.org/streams') && !(client as any).isSecure()) {
          throw new Error('The XMPP server did not establish TLS; refusing an unencrypted TCP session')
        }
        return next()
      })
    }

    client.on('online', () => {
      this.status = 'connected'
      this.lastError = undefined
      this.domain = client?.jid?.domain || this.domain
      this.emit('connection', this.connectionInfo)
      // Message Carbons keep conversations in sync when this account sends or
      // receives messages from another connected resource. Some servers do
      // not support XEP-0280, so failure must not affect the login.
      void this.sendIQ(undefined, 'set', xml('enable', { xmlns: NS_CARBONS }))
        .catch(() => {})
      // @xmpp/client reports authentication as "online" but does not publish
      // available presence automatically. Without this, roster contacts cannot
      // see this account as online after a successful connection.
      void this.sendPresence().catch((error) => this.emit('presence:error', error))
    })

    client.on('stanza', (stanza: Element) => this.handleStanza(stanza))
    client.on('status', (status: string) => {
      if (status === 'disconnect' || status === 'offline') {
        this.clearServerPresence()
        this.status = 'disconnected'
        this.emit('connection', { ...this.connectionInfo, status: 'disconnected' })
        for (const [, pending] of this.pendingIq) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Server disconnected'))
        }
        this.pendingIq.clear()
      }
    })
    client.on('error', (err: Error) => {
      this.status = 'error'
      this.lastError = err.message
      this.emit('connection', { ...this.connectionInfo, status: 'error', error: err.message })
      disconnectReject?.(err)
    })

    // A resumed XEP-0198 session sets the underlying entity status to online
    // without emitting its normal "online" event. Track the reconnect emitter
    // too, or the UI remains stuck in disconnected after a successful resume.
    const onReconnecting = () => {
      if (this.client !== client) return
      this.status = 'connecting'
      this.lastError = undefined
      this.emit('connection', this.connectionInfo)
    }
    const onReconnected = () => {
      if (this.client !== client) return
      this.status = 'connected'
      this.lastError = undefined
      this.domain = client?.jid?.domain || this.domain
      this.emit('connection', this.connectionInfo)
      void this.sendPresence().catch((error) => this.emit('presence:error', error))
    }
    ;(client as any).reconnect?.on?.('reconnecting', onReconnecting)
    ;(client as any).reconnect?.on?.('reconnected', onReconnected)

    let disconnectReject: ((err: Error) => void) | null = null
    let timeout: ReturnType<typeof setTimeout> | undefined
    const onDisconnect = (status: string) => {
      if ((status === 'disconnect' || status === 'offline') && disconnectReject) {
        disconnectReject(new Error('Server disconnected before authentication completed'))
      }
    }
    client.on('status', onDisconnect)

    try {
      await Promise.race([
        client.start(),
        new Promise<void>((_, reject) => {
          disconnectReject = reject
          timeout = setTimeout(() => reject(new Error(`Connection timed out after ${Math.ceil(timeoutMs / 1000)} seconds`)), timeoutMs)
        }),
      ])
    } catch (error) {
      await this.disconnect().catch(() => {})
      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      if (timeout) clearTimeout(timeout)
      disconnectReject = null
      ;(client as any).removeListener?.('status', onDisconnect)
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      this.clearServerPresence()
      const changed = this.status !== 'disconnected' || this.lastError !== undefined
      this.status = 'disconnected'
      this.lastError = undefined
      if (changed) this.emit('connection', this.connectionInfo)
      return
    }
    const oldClient: any = this.client
    try {
      oldClient.reconnect?.stop?.()
      oldClient.reconnect?.removeAllListeners?.()
      await oldClient.stop()
    } catch {}
    oldClient.removeAllListeners?.('online')
    oldClient.removeAllListeners?.('stanza')
    oldClient.removeAllListeners?.('status')
    oldClient.removeAllListeners?.('error')
    this.client = null
    this.httpUploadService = undefined
    this.clearServerPresence()
    this.status = 'disconnected'
    this.lastError = undefined
    this.emit('connection', { ...this.connectionInfo, status: 'disconnected' })
    for (const [, pending] of this.pendingIq) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Server disconnected'))
    }
    this.pendingIq.clear()
  }

  async uploadFile(data: Uint8Array, filename: string, contentType = 'application/octet-stream'): Promise<string> {
    if (!this.isConnected) throw new Error('Connect to your XMPP server before uploading a file.')
    if (data.byteLength === 0) throw new Error('The selected file is empty.')
    const service = await this.findHttpUploadService()
    if (!service) throw new Error('Your XMPP server does not provide an HTTP File Upload service.')

    const response = await this.sendIQ(service.jid, 'get', xml('request', {
      xmlns: service.namespace,
      filename: filename.trim() || 'file',
      size: String(data.byteLength),
      'content-type': contentType || 'application/octet-stream',
    }))
    const slot = response.getChild('slot', service.namespace)
    const put = slot?.getChild('put', service.namespace)
    const get = slot?.getChild('get', service.namespace)
    const putUrl = put?.attrs.url
    const getUrl = get?.attrs.url
    if (!putUrl || !getUrl) throw new Error('The XMPP upload service returned an incomplete upload slot.')

    const secureUrl = (value: string, label: string): string => {
      let parsed: URL
      try { parsed = new URL(value) } catch { throw new Error(`The XMPP upload service returned an invalid ${label} URL.`) }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
        throw new Error(`The XMPP upload service returned an insecure ${label} URL.`)
      }
      return parsed.toString()
    }
    const safePutUrl = secureUrl(putUrl, 'upload')
    const safeGetUrl = secureUrl(getUrl, 'download')
    const headers = new Headers({ 'Content-Type': contentType || 'application/octet-stream' })
    for (const header of put?.children.filter((child): child is Element => child instanceof Element && child.name === 'header') ?? []) {
      const name = (header.attrs.name ?? '').replace(/[\r\n]/g, '')
      const lowerName = name.toLowerCase()
      if (!['authorization', 'cookie', 'expires'].includes(lowerName)) continue
      const value = header.text().replace(/[\r\n]/g, '')
      if (lowerName === 'cookie' && value) {
        throw new Error('This XMPP upload service requires a Cookie header that browser apps cannot set. Ask the server operator to use a browser-compatible upload configuration.')
      }
      if (name && value) headers.append(name, value)
    }

    let uploaded: Response
    try {
      uploaded = await fetch(safePutUrl, { method: 'PUT', headers, body: data as unknown as BodyInit, credentials: 'omit' })
    } catch {
      throw new Error('Could not reach the XMPP file upload service. Check the server and try again.')
    }
    if (!uploaded.ok) throw new Error(`XMPP file upload failed (HTTP ${uploaded.status}).`)
    return safeGetUrl
  }

  private async findHttpUploadService(): Promise<{ jid: string; namespace: string } | undefined> {
    if (this.httpUploadService) return this.httpUploadService
    const match = (features: string[]) => features.find((feature) => /^urn:xmpp:http:upload:\d+$/.test(feature))
    const rootInfo = await this.discoInfo(this.domain).catch(() => undefined)
    const rootNamespace = rootInfo && match(rootInfo.features)
    if (rootNamespace) {
      this.httpUploadService = { jid: this.domain, namespace: rootNamespace }
      return this.httpUploadService
    }

    const items = await this.discoItems(this.domain).catch(() => ({ items: [] }))
    for (const item of items.items) {
      const info = await this.discoInfo(item.jid).catch(() => undefined)
      const namespace = info && match(info.features)
      if (!namespace) continue
      this.httpUploadService = { jid: item.jid, namespace }
      return this.httpUploadService
    }
    return undefined
  }

  /**
   * Common secure WebSocket endpoints used by default server configurations.
   * Explicit XEP-0156 discovery and user-provided URLs are tried before these.
   */
  private defaultWsUrls(domain: string): string[] {
    return [
      `wss://${domain}/xmpp-websocket`, // Common browser endpoint on HTTPS port 443
      `wss://${domain}:5281/xmpp-websocket`, // Prosody default
      `wss://${domain}:5443/websocket`, // common ejabberd default
      `wss://${domain}:5443/xmpp-websocket`, // deployments using Prosody's path on 5443
    ]
  }

  async register(
    domainOrService: string,
    username: string,
    password: string,
    xmppDomain?: string,
    registrationFields: Record<string, string> = {}
  ): Promise<string> {
    const isUrl = domainOrService.includes('://')
    let streamDomain: string
    let services: string[]
    if (isUrl) {
      const endpoint = new URL(normalizeXmppWebSocketUrl(domainOrService))
      streamDomain = xmppDomain || endpoint.hostname || domainOrService
      services = [endpoint.toString()]
    } else {
      streamDomain = xmppDomain || domainOrService
      const discovered = await this.discoverWebSocketUrl(domainOrService)
      services = [...new Set([...(discovered ? [discovered] : []), ...this.defaultWsUrls(domainOrService)])]
    }

    let lastError: Error | undefined
    for (const service of services) {
      try {
        return await this.registerAtService(streamDomain, service, username, password, registrationFields)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (error instanceof RegistrationResponseError) throw error
      }
    }
    throw new Error(`Could not register with ${streamDomain}: ${lastError?.message || 'XMPP registration failed'}`)
  }

  private registerAtService(
    domain: string,
    service: string,
    username: string,
    password: string,
    registrationFields: Record<string, string>
  ): Promise<string> {
    service = normalizeXmppWebSocketUrl(service)
    return new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(service, ['xmpp'])
      let buffer = ''
      let step: 'open' | 'features' | 'form' | 'submit' = 'open'
      // Guard: once resolve() or reject() is called, prevent any further calls
      // (the error-check at the bottom of onmessage must not fire after success).
      let done = false
      const finish = (fn: () => void) => {
        if (done) return
        done = true
        clearTimeout(timeout)
        try { ws.close() } catch {}
        fn()
      }
      const timeout = setTimeout(() => {
        finish(() => reject(new Error('Registration timed out')))
      }, 15000)

      ws.onopen = () => {
        // RFC 7395 §4 requires the framed <open/> element, not a raw <stream:stream>.
        // The xmlns:stream prefix does not exist in WebSocket framing — each message is a
        // complete stanza and the stream open is a self-closing <open/> in the framing namespace.
        ws.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='${domain}' version='1.0'/>`)
      }

      ws.onmessage = (event: any) => {
        if (done) return
        buffer += typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)

        // Bug fix: do NOT return early after advancing from 'open' → 'features'.
        // Some servers (Prosody, ejabberd) send the <open/> response and <stream:features>
        // in the same WebSocket frame. The old code returned early after setting
        // step='features', meaning features were never processed from that frame.
        if (step === 'open') {
          if (buffer.includes('<open ') || buffer.includes('<stream:stream')) {
            step = 'features'
          } else {
            // Haven't seen the open confirmation yet — nothing else to do
            return
          }
          // Fall through: the rest of this frame may contain <stream:features>
        }

        if (step === 'features' && buffer.includes('</stream:features>')) {
          // Bug fix: XEP-0077 in-band registration is announced in <stream:features> as:
          //   <register xmlns='http://jabber.org/features/iq-register'/>
          // NOT 'jabber:iq:register' (that is the IQ query namespace used later).
          // Old code used the wrong namespace and always rejected servers that support it.
          const supportsRegistration =
            buffer.includes('http://jabber.org/features/iq-register') ||
            buffer.includes('jabber:iq:register')
          if (!supportsRegistration) {
            finish(() => reject(new RegistrationResponseError('Server does not support in-band registration')))
            return
          }
          step = 'form'
          buffer = ''
          ws.send(`<iq xmlns='jabber:client' type='get' id='reg-1'><query xmlns='jabber:iq:register'/></iq>`)
          return
        }

        if (step === 'form') {
          const match = buffer.match(/id=['"](reg-1)['"]/ )
          if (match && (buffer.includes('type="result"') || buffer.includes("type='result'"))) {
            step = 'submit'
            let dataForm: Element | undefined
            try {
              dataForm = registrationDataForm(buffer, username, password, registrationFields)
            } catch (error) {
              finish(() => reject(error instanceof Error ? error : new Error(String(error))))
              return
            }
            buffer = ''
            const registration = dataForm
              ? xml('iq', { xmlns: 'jabber:client', type: 'set', id: 'reg-2' }, xml('query', { xmlns: 'jabber:iq:register' }, dataForm))
              : xml('iq', { xmlns: 'jabber:client', type: 'set', id: 'reg-2' }, xml('query', { xmlns: 'jabber:iq:register' },
                xml('username', {}, username),
                xml('password', {}, password),
                ...Object.entries(registrationFields).map(([field, value]) => xml(field, {}, value))))
            ws.send(registration.toString())
            return
          }
        }

        if (step === 'submit') {
          const match = buffer.match(/id=['"](reg-2)['"]/)
          if (match && (buffer.includes('type="result"') || buffer.includes("type='result'"))) {
            finish(() => resolve(service))
            return
          }
        }

        // Bug fix: guard with `done` and wrap in else-if so this cannot fire
        // after resolve() has already been called (e.g. a trailing <close/> error frame).
        if (!done && (buffer.includes('type="error"') || buffer.includes("type='error'"))) {
          // Extract a more specific error message if available
          const textMatch = buffer.match(/<text[^>]*>([^<]+)<\/text>/)
          const serverText = textMatch?.[1] || 'Registration rejected by server'
          const errText = /captcha|human verification|verification challenge/i.test(serverText)
            ? CAPTCHA_REGISTRATION_MESSAGE
            : serverText
          finish(() => reject(new RegistrationResponseError(errText)))
        }
      }

      ws.onerror = () => {
        finish(() => reject(new Error('WebSocket connection failed')))
      }
    })
  }

  async sendStanza(stanza: Element): Promise<void> {
    if (!this.client) throw new Error('Not connected to server')
    await this.client.send(stanza)
  }

  async sendMessage(to: string, body: string, options?: {
    originId?: string
    type?: string
    thread?: string
    replace?: string
    reply?: { id: string; to?: string }
    requestReceipt?: boolean
    chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
    attachments?: Array<{ url: string; desc: string }>
  }): Promise<string> {
    const id = options?.originId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const attrs: Record<string, string> = { to, type: options?.type || 'chat', id }
    const children = [
      ...(body ? [xml('body', {}, body)] : []),
      ...(options?.attachments ?? []).flatMap((attachment) => {
        let url: URL
        try { url = new URL(attachment.url) } catch { return [] }
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) return []
        return [xml('x', { xmlns: 'jabber:x:oob' },
          xml('url', {}, url.toString()),
          xml('desc', {}, attachment.desc))]
      }),
      ...buildXepElements({ ...options, originId: options?.originId ?? id }),
    ]
    await this.sendStanza(xml('message', attrs, ...children))
    return id
  }

  async queryMamHistory(withJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    const peerJid = withJid.trim().split('/')[0]
    if (!peerJid || !peerJid.includes('@')) throw new Error('Enter a full XMPP JID to load archived messages.')
    return this.queryMamArchive(undefined, peerJid, before)
  }

  async queryMucMamHistory(roomJid: string, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    const bareRoomJid = roomJid.trim().split('/')[0]
    if (!bareRoomJid || !bareRoomJid.includes('@')) throw new Error('Enter a full XMPP room JID to load archived messages.')
    return this.queryMamArchive(bareRoomJid, undefined, before)
  }

  private async queryMamArchive(targetJid: string | undefined, withJid: string | undefined, before?: string): Promise<{ before?: string; hasMore: boolean }> {
    if (!this.isConnected) throw new Error('Connect to your XMPP server before loading archived messages.')
    const queryId = `mam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const filters = withJid ? [xml('x', { xmlns: 'jabber:x:data', type: 'submit' },
      xml('field', { var: 'FORM_TYPE', type: 'hidden' }, xml('value', {}, NS_MAM)),
      xml('field', { var: 'with' }, xml('value', {}, withJid))
    )] : []
    // Request a bounded latest page. Servers otherwise apply different default
    // limits (or return the entire archive), which makes history loading
    // unpredictable and can overwhelm the browser for long conversations.
    const rsm = xml('set', { xmlns: 'http://jabber.org/protocol/rsm' },
      xml('max', {}, '50'),
      xml('before', {}, before || undefined)
    )
    let response: Element
    try {
      response = await this.sendIQ(targetJid, 'set', xml('query', { xmlns: NS_MAM, queryid: queryId }, ...filters, rsm))
    } catch (error) {
      if (error instanceof Error && /does not support this request/i.test(error.message)) {
        throw new Error('This XMPP server does not provide message archives.')
      }
      throw error
    }
    const fin = response.getChild('fin', NS_MAM)
    const resultSet = fin?.getChild('set', 'http://jabber.org/protocol/rsm')
    // A backwards RSM page is anchored before the first item in the current
    // page. Using <last/> would make successive pages overlap almost entirely.
    const first = resultSet?.getChild('first')?.text().trim()
    return { before: first || undefined, hasMore: fin?.attrs.complete !== 'true' && Boolean(first) }
  }

  async getRosterEntries(): Promise<Array<{ jid: string; name?: string; subscription: string }>> {
    const response = await this.sendIQ(undefined, 'get', xml('query', { xmlns: NS_ROSTER }))
    const query = response.getChild('query', NS_ROSTER)
    return (query?.children ?? [])
      .filter((child): child is Element => child instanceof Element && child.name === 'item')
      .filter((item) => Boolean(item.attrs.jid) && item.attrs.subscription !== 'remove')
      .map((item) => ({ jid: item.attrs.jid, name: item.attrs.name, subscription: item.attrs.subscription || 'none' }))
  }

  async addRosterEntry(jid: string, name?: string): Promise<void> {
    const attrs: Record<string, string> = { jid }
    if (name) attrs.name = name
    await this.sendIQ(undefined, 'set', xml('query', { xmlns: NS_ROSTER }, xml('item', attrs)))
    await this.sendStanza(xml('presence', { to: jid, type: 'subscribe' }))
  }

  async approvePresenceSubscription(jid: string): Promise<void> {
    const bareJid = jid.trim().split('/')[0].toLowerCase()
    if (!bareJid.includes('@') || bareJid.endsWith('@p2p')) throw new Error('Enter a full XMPP contact JID.')
    await this.sendIQ(undefined, 'set', xml('query', { xmlns: NS_ROSTER }, xml('item', { jid: bareJid })))
    await this.sendStanza(xml('presence', { to: bareJid, type: 'subscribed' }))
  }

  async denyPresenceSubscription(jid: string): Promise<void> {
    const bareJid = jid.trim().split('/')[0].toLowerCase()
    if (!bareJid.includes('@') || bareJid.endsWith('@p2p')) throw new Error('Enter a full XMPP contact JID.')
    await this.sendStanza(xml('presence', { to: bareJid, type: 'unsubscribed' }))
  }

  async removeRosterEntry(jid: string): Promise<void> {
    await this.sendIQ(undefined, 'set', xml('query', { xmlns: NS_ROSTER }, xml('item', { jid, subscription: 'remove' })))
  }

  async sendPresence(type?: string, status?: string, show?: string): Promise<void> {
    const attrs: Record<string, string> = {}
    if (type) attrs.type = type
    const children: any[] = []
    if (show) children.push(xml('show', {}, show))
    if (status) children.push(xml('status', {}, status))
    await this.sendStanza(xml('presence', attrs, ...children))
  }

  private clearServerPresence(): void {
    for (const from of this.serverPresenceResources.keys()) {
      this.emit('presence', { from, to: '', type: 'unavailable', server: this.domain })
    }
    this.serverPresenceResources.clear()
  }

  async sendIQ(to: string | undefined, type: 'get' | 'set', queryEl: Element, timeoutMs = this.iqTimeoutMs): Promise<Element> {
    const id = `iq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const attrs: Record<string, string> = { type, id }
    if (to) attrs.to = to
    const stanza = xml('iq', attrs, queryEl)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIq.delete(id)
        reject(new Error(`IQ timeout: ${id}`))
      }, timeoutMs)
      this.pendingIq.set(id, { resolve, reject, timer })
      void this.sendStanza(stanza).catch((error: unknown) => {
        clearTimeout(timer)
        this.pendingIq.delete(id)
        reject(error instanceof Error ? error : new Error('Could not send XMPP IQ request'))
      })
    })
  }

  async joinMuc(roomJid: string, nick: string): Promise<void> {
    await this.sendStanza(xml('presence', { to: `${roomJid}/${nick}` },
      xml('x', { xmlns: NS_MUC })
    ))
  }

  async sendMucMessage(roomJid: string, body: string, options?: {
    originId?: string
    thread?: string
    replace?: string
    reply?: { id: string; to?: string }
  }): Promise<string> {
    return this.sendMessage(roomJid, body, { type: 'groupchat', ...options })
  }

  async sendMucChatState(roomJid: string, state: 'composing' | 'paused' | 'active'): Promise<void> {
    await this.sendStanza(xml('message', { to: roomJid, type: 'groupchat' }, xml(state, { xmlns: 'http://jabber.org/protocol/chatstates' })))
  }

  async leaveMuc(roomJid: string, nick: string): Promise<void> {
    await this.sendStanza(xml('presence', { to: `${roomJid}/${nick}`, type: 'unavailable' }))
  }

  async pubsubSubscribe(nodeJid: string, node: string): Promise<ServerPubsubSubscriptionStatus> {
    const result = await this.sendIQ(nodeJid, 'set',
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('subscribe', { node, jid: this.client?.jid?.toString().split('/')[0] || '' })
      ), 10_000
    )
    const subscription = result.getChild('pubsub')?.getChild('subscription')
    const state = subscription?.attrs.subscription
    if (state === 'pending') return 'pending'
    if (state === 'unconfigured' || subscription?.getChild('subscribe-options')?.getChild('required')) return 'unconfigured'
    return 'subscribed'
  }

  async pubsubPublish(nodeJid: string, node: string, itemId: string, payload: Element): Promise<void> {
    await this.sendIQ(nodeJid, 'set',
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('publish', { node }, xml('item', { id: itemId }, payload))
      )
    )
    // Publishing must not resolve until the server acknowledges the write.
    // Callers often refresh the PEP node immediately after publishing; a
    // fire-and-forget stanza can race that read and silently hide failures.
  }

  async pubsubGetItems(nodeJid: string, node: string, maxItems?: number, timeoutMs = 8_000): Promise<Element[]> {
    const attrs: Record<string, string> = { node }
    if (maxItems !== undefined) attrs.max_items = String(maxItems)
    const result = await this.sendIQ(nodeJid, 'get',
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('items', attrs)
      ), timeoutMs
    )
    const pubsub = result.getChild('pubsub')
    if (!pubsub) return []
    const items = pubsub.getChild('items')
    if (!items) return []
    return items.children.filter((c): c is Element => c instanceof Element) || []
  }

  async pubsubUnsubscribe(nodeJid: string, node: string): Promise<void> {
    await this.sendIQ(nodeJid, 'set',
      xml('pubsub', { xmlns: NS_PUBSUB },
        xml('unsubscribe', { node, jid: this.client?.jid?.toString().split('/')[0] || '' })
      ), 10_000
    )
  }

  async discoInfo(jid: string, timeoutMs = this.iqTimeoutMs): Promise<ServerDiscoInfoResult> {
    const result = await this.sendIQ(jid, 'get',
      xml('query', { xmlns: 'http://jabber.org/protocol/disco#info' }), timeoutMs
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

  async discoItems(jid: string, timeoutMs = this.iqTimeoutMs): Promise<ServerDiscoItemsResult> {
    const result = await this.sendIQ(jid, 'get',
      xml('query', { xmlns: 'http://jabber.org/protocol/disco#items' }), timeoutMs
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

  async discoverMucRooms(): Promise<ServerMucRoomInfo[]> {
    if (!this.isConnected) throw new Error('Connect to your XMPP server before browsing rooms.')
    // Browsing public rooms should remain responsive when a server lists services that do
    // not answer service-discovery requests. Keep these discovery-only IQs bounded.
    const discoveryTimeoutMs = 5_000
    const [rootInfo, rootItems] = await Promise.all([
      this.discoInfo(this.domain, discoveryTimeoutMs).catch((): ServerDiscoInfoResult => ({ identities: [], features: [] })),
      this.discoItems(this.domain, discoveryTimeoutMs).catch(() => ({ items: [] })),
    ])
    const rootIsMuc = rootInfo.features.includes(NS_MUC)
      || rootInfo.identities.some((identity) => identity.category === 'conference')
    const serviceItems = await Promise.all(rootItems.items.map(async (item) => ({
      item,
      info: await this.discoInfo(item.jid, discoveryTimeoutMs).catch((): ServerDiscoInfoResult => ({ identities: [], features: [] })),
    })))
    const services = [
      ...(rootIsMuc ? [this.domain] : []),
      ...serviceItems
        .filter(({ info }) => info.features.includes(NS_MUC) || info.identities.some((identity) => identity.category === 'conference'))
        .map(({ item }) => item.jid),
    ]
    const uniqueServices = [...new Set(services)]
    const roomLists = await Promise.all(uniqueServices.map(async (serviceJid) => ({
      serviceJid,
      result: await this.discoItems(serviceJid, discoveryTimeoutMs).catch(() => ({ items: [] })),
    })))
    return roomLists.flatMap(({ serviceJid, result }) => result.items
      .filter((item) => item.jid.includes('@') && !item.jid.includes('/'))
      .map((item) => ({
        roomJid: item.jid,
        name: item.name?.trim() || item.jid.split('@')[0],
        serviceJid,
      })))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  private handleStanza(stanza: Element): void {
    if (stanza.name === 'message') {
      this.handleMessage(stanza)
    } else if (stanza.name === 'presence') {
      this.handlePresence(stanza)
    } else if (stanza.name === 'iq') {
      const id = stanza.attrs.id
      const rosterQuery = stanza.getChild('query', NS_ROSTER)
      if (stanza.attrs.type === 'set' && rosterQuery) {
        if (id) {
          const attrs: Record<string, string> = { type: 'result', id }
          if (stanza.attrs.from) attrs.to = stanza.attrs.from
          void this.sendStanza(xml('iq', attrs)).catch(() => {})
        }
        const items = rosterQuery.children
          .filter((child): child is Element => child instanceof Element && child.name === 'item')
          .map((item) => ({ jid: item.attrs.jid || '', name: item.attrs.name, subscription: item.attrs.subscription || 'none' }))
          .filter((item) => item.jid)
        this.emit('roster:change', items)
        return
      }
      if (id && (stanza.attrs.type === 'result' || stanza.attrs.type === 'error')) {
        const pending = this.pendingIq.get(id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingIq.delete(id)
          if (stanza.attrs.type === 'error') {
            pending.reject(new Error(iqErrorMessage(stanza)))
          } else {
            pending.resolve(stanza)
          }
        }
      }
    }
  }

  private handlePresence(stanza: Element): void {
    const fullFrom = stanza.attrs.from || ''
    const slash = fullFrom.indexOf('/')
    const from = (slash < 0 ? fullFrom : fullFrom.slice(0, slash)).toLowerCase()
    const resource = slash < 0 ? '' : fullFrom.slice(slash + 1)
    if (!from || from.toLowerCase() === this.client?.jid?.toString().split('/')[0].toLowerCase()) return

    const type = stanza.attrs.type
    if (type === 'subscribe') {
      this.emit('presence:subscribe', {
        from,
        server: from.split('@')[1] || this.domain,
      })
      return
    }
    if (type === 'error' && resource && from.includes('@')) {
      const error = stanza.getChild('error')
      const condition = error?.children.find((child): child is Element =>
        child instanceof Element && child.name !== 'text' && child.attrs.xmlns === 'urn:ietf:params:xml:ns:xmpp-stanzas'
      )
      const text = error?.getChild('text', 'urn:ietf:params:xml:ns:xmpp-stanzas')?.text().trim()
      this.emit('muc:error', {
        room: from,
        roomJid: from,
        from: fullFrom,
        nick: resource,
        server: from.split('@')[1]?.split('/')[0] || this.domain,
        stanzaError: condition ? { condition: condition.name, text } : text ? { text } : undefined,
      })
      return
    }
    if (type && type !== 'available' && type !== 'unavailable') return

    const mucUser = stanza.getChild('x', NS_MUC_USER)
    if (mucUser && resource) {
      const item = mucUser.getChild('item')
      const statusCodes = mucUser.children
        .filter((child): child is Element => child instanceof Element && child.name === 'status')
        .map((status) => status.attrs.code)
        .filter((code): code is string => Boolean(code))
      const event = {
        room: from,
        roomJid: from,
        from: fullFrom,
        nick: resource,
        type: type || 'available',
        server: from.split('@')[1]?.split('/')[0] || this.domain,
        fromSelf: statusCodes.includes('110'),
        occupantJid: item?.attrs.jid,
        role: item?.attrs.role,
        affiliation: item?.attrs.affiliation,
        statusCodes,
      }
      if (type !== 'unavailable' && event.fromSelf && statusCodes.includes('201') && !this.configuringMucRooms.has(from)) {
        this.configuringMucRooms.add(from)
        void this.acceptMucRoomDefaults(from).catch((error) => {
          this.emit('muc:error', {
            ...event,
            stanzaError: { text: error instanceof Error ? error.message : 'Could not accept the room defaults.' },
          })
        }).finally(() => this.configuringMucRooms.delete(from))
      }
      if (type === 'unavailable') {
        this.emit('muc:leave', event)
        const replacementNick = statusCodes.includes('303') ? item?.attrs.nick : undefined
        if (replacementNick) {
          this.emit('muc:join', {
            ...event,
            from: `${from}/${replacementNick}`,
            nick: replacementNick,
            type: 'available',
            fromSelf: false,
          })
        }
      } else {
        this.emit('muc:join', event)
      }
      return
    }

    let resources = this.serverPresenceResources.get(from)
    if (type === 'unavailable') {
      if (resource) resources?.delete(resource)
      else resources?.clear()
      if (!resources?.size) this.serverPresenceResources.delete(from)
    } else {
      if (!resources) {
        resources = new Map()
        this.serverPresenceResources.set(from, resources)
      }
      const rawPriority = stanza.getChild('priority')?.text().trim()
      const parsedPriority = rawPriority ? Number(rawPriority) : 0
      resources.set(resource, {
        show: stanza.getChild('show')?.text(),
        status: stanza.getChild('status')?.text(),
        priority: Number.isInteger(parsedPriority) ? Math.max(-128, Math.min(127, parsedPriority)) : 0,
      })
    }

    const activeResources = this.serverPresenceResources.get(from)
    const activeStatus = activeResources
      ? [...activeResources.values()].reduce((highest, candidate) => candidate.priority > highest.priority ? candidate : highest)
      : undefined
    this.emit('presence', {
      from,
      to: stanza.attrs.to || '',
      type: activeResources?.size ? 'available' : 'unavailable',
      show: activeStatus?.show,
      status: activeStatus?.status,
      server: this.domain,
    })
  }

  private async acceptMucRoomDefaults(roomJid: string): Promise<void> {
    const response = await this.sendIQ(roomJid, 'get', xml('query', { xmlns: NS_MUC_OWNER }))
    const form = response.getChild('query', NS_MUC_OWNER)?.getChild('x', 'jabber:x:data')
    if (!form || form.attrs.type !== 'form') return

    const fields = form.children
      .filter((child): child is Element => child instanceof Element && child.name === 'field')
      .flatMap((field) => {
        const variable = field.attrs.var
        if (!variable) return []
        const values = field.children
          .filter((child): child is Element => child instanceof Element && child.name === 'value')
          .map((value) => value.text())
        if (!values.length) return []
        return [xml('field', { var: variable }, ...values.map((value) => xml('value', {}, value)))]
      })

    await this.sendIQ(roomJid, 'set', xml('query', { xmlns: NS_MUC_OWNER },
      xml('x', { xmlns: 'jabber:x:data', type: 'submit' }, ...fields)
    ))
  }

  private handleMessage(stanza: Element): void {
    const stanzaMetadata = parseXepMetadata(stanza)
    if (stanzaMetadata.carbon) {
      const forwarded = stanzaMetadata.carbon.forwardedMessage
      const from = forwarded.attrs.from || ''
      const to = forwarded.attrs.to || ''
      const body = this.getMessageBody(forwarded)
      const metadata = parseXepMetadata(forwarded)
      const stanzaId = forwarded.attrs.id || stanza.attrs.id || ''
      const id = metadata.originId || stanzaId
      const ownJid = this.client?.jid?.toString().split('/')[0].toLowerCase()
      const fromSelf = stanzaMetadata.carbon.type === 'sent'
        || Boolean(ownJid && from.split('/')[0].toLowerCase() === ownJid)
      this.emit('message', {
        from, to, body, id, type: forwarded.attrs.type || 'chat', server: this.domain,
        thread: metadata.thread,
        delay: metadata.delay,
        receipt: metadata.receipt,
        replace: metadata.replace,
        reply: metadata.reply,
        chatState: metadata.chatState,
        fromSelf,
      })
      return
    }

    const mamResult = stanza.getChild('result', NS_MAM)
    if (mamResult) {
      const forwarded = mamResult.getChild('forwarded')
      const archived = forwarded?.getChild('message')
      if (!archived) return
      const from = archived.attrs.from || ''
      const to = archived.attrs.to || ''
      const body = this.getMessageBody(archived)
      const metadata = parseXepMetadata(archived)
      const id = metadata.originId || archived.attrs.id || mamResult.attrs.id || ''
      const delay = forwarded?.getChild('delay', NS_DELAY)
      const ownJid = this.client?.jid?.toString().split('/')[0].toLowerCase()
      const ownNick = this.client?.jid?.local
      const archivedType = archived.attrs.type || 'chat'
      const fromSelf = archivedType === 'groupchat'
        ? Boolean(ownNick && from.split('/')[1] === ownNick)
        : Boolean(ownJid && from.split('/')[0].toLowerCase() === ownJid)
      const archivedDelay = metadata.delay ?? (delay ? { stamp: delay.attrs.stamp || '', from: delay.attrs.from } : undefined)
      if (archivedType === 'groupchat') {
        const roomJid = from.includes('/') ? from.split('/')[0] : from
        const nick = from.includes('/') ? from.split('/')[1] : undefined
        this.emit('muc:message', {
          room: roomJid,
          roomJid,
          from,
          nick,
          body,
          id,
          type: archivedType,
          server: this.domain,
          fromSelf,
          mam: true,
          delay: archivedDelay,
        })
        return
      }
      this.emit('message', {
        from,
        to,
        body,
        id,
        type: archivedType,
        server: this.domain,
        thread: metadata.thread,
        delay: archivedDelay,
        receipt: metadata.receipt,
        replace: metadata.replace,
        reply: metadata.reply,
        chatState: metadata.chatState,
        mam: true,
        queryId: mamResult.attrs.queryid,
        fromSelf,
      })
      return
    }

    const from = stanza.attrs.from || ''
    const to = stanza.attrs.to || ''
    const type = stanza.attrs.type || 'normal'
    const stanzaId = stanza.attrs.id || ''
    const body = this.getMessageBody(stanza)
    const thread = stanza.getChild('thread')?.text()
    const metadata = parseXepMetadata(stanza)
    const id = metadata.originId || stanzaId

    if (type === 'error') {
      const error = stanza.getChild('error')
      const condition = error?.children.find((child): child is Element =>
        child instanceof Element && child.name !== 'text' && child.attrs.xmlns === NS_STANZAS
      )?.name
      const text = error?.getChild('text', NS_STANZAS)?.text().trim()
      this.emit('message', {
        from, to, body: '', id: stanzaId || id, type, server: this.domain,
        stanzaError: { condition, text: text || undefined },
      })
      return
    }

    const delayEl = stanza.getChild('delay')
    const delay = delayEl ? { stamp: delayEl.attrs.stamp || '', from: delayEl.attrs.from } : undefined

    const chatState = ['active', 'composing', 'paused', 'inactive', 'gone']
      .map(s => stanza.getChild(s))
      .find(child => child?.attrs?.xmlns === 'http://jabber.org/protocol/chatstates')
    const chatStateName = chatState?.name as 'active' | 'composing' | 'paused' | 'inactive' | 'gone' | undefined

    if (type === 'groupchat') {
      const roomJid = from.includes('/') ? from.split('/')[0] : from
      const nick = from.includes('/') ? from.split('/')[1] : undefined
      const ownNick = this.client?.jid?.local
      this.emit('muc:message', { room: roomJid, roomJid, from, body, id, type: 'groupchat', server: this.domain, nick, fromSelf: Boolean(nick && ownNick && nick === ownNick), delay, chatState: chatStateName })
      return
    }

    const pubsubEvent = stanza.getChild('event', NS_PUBSUB_EVENT)
    if (pubsubEvent) {
      this.handlePubsubEvent(stanza)
      return
    }

    if (type !== 'groupchat' && metadata.receipt?.type === 'request' && stanzaId && this.client) {
      void this.sendStanza(xml('message', { to: from, type: 'chat' }, xml('received', { xmlns: RECEIPTS_XMLNS, id: stanzaId }))).catch(() => {})
    }

    this.emit('message', {
      from, to, body, id, type, server: this.domain, thread: metadata.thread ?? thread,
      delay: metadata.delay ?? delay, receipt: metadata.receipt, replace: metadata.replace,
      reply: metadata.reply, chatState: metadata.chatState ?? chatStateName,
    })
  }

  private getMessageBody(stanza: Element): string {
    const body = stanza.getChild('body')?.text() || ''
    const oob = stanza.getChild('x', 'jabber:x:oob')
    const rawUrl = oob?.getChild('url')?.text().trim()
    if (!rawUrl) return body

    let url: URL
    try { url = new URL(rawUrl) } catch { return body }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || /[\r\n<>]/.test(rawUrl)) return body
    const safeUrl = url.toString().replace(/\(/g, '%28').replace(/\)/g, '%29')
    if (body.includes(rawUrl) || body.includes(safeUrl)) return body

    const rawDescription = oob?.getChild('desc')?.text().trim()
    let pathName = url.pathname.split('/').pop() || ''
    try { pathName = decodeURIComponent(pathName) } catch {}
    const filename = (rawDescription || pathName || 'Shared file')
      .replace(/[\[\]\r\n]/g, ' ')
    const isImage = /\.(?:avif|gif|jpe?g|png|webp)$/i.test(filename)
    const reference = `${isImage ? '!' : ''}[${filename}](${safeUrl})`
    return body ? `${body}\n${reference}` : reference
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
