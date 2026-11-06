import { registerPlugin, type Plugin, type PluginListenerHandle } from '@capacitor/core'
import { serviceCapabilities, transportSymbol, type Connection, type CreateListenerOptions, type DialTransportOptions, type Logger, type MultiaddrConnection, type Transport } from '@libp2p/interface'
import { AbstractMultiaddrConnection } from '@libp2p/utils'
import { TCP as TCPMatcher } from '@multiformats/multiaddr-matcher'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'
import { Buffer } from 'buffer'
import { isAndroidNative } from './native-platform.js'

interface NativeTcpEvent {
  socketId: string
  data?: string
  error?: string
}

interface NativeTcpAcceptedEvent extends NativeTcpEvent {
  listenerId: string
  remoteHost: string
  remotePort: number
}

interface NativeTcpPlugin extends Plugin {
  open(options: { host: string; port: number; timeoutMs: number }): Promise<{ socketId: string }>
  listen(options: { host: string; port: number }): Promise<{ listenerId: string; port: number; addresses: string[] }>
  stopListening(options: { listenerId: string }): Promise<void>
  write(options: { socketId: string; data: string }): Promise<void>
  close(options: { socketId: string }): Promise<void>
  addListener(eventName: 'tcpData' | 'tcpClosed', listener: (event: NativeTcpEvent) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'tcpAccepted', listener: (event: NativeTcpAcceptedEvent) => void): Promise<PluginListenerHandle>
}

const nativeTcp = registerPlugin<NativeTcpPlugin>('NativeTcp')
const connections = new Map<string, NativeTcpMultiaddrConnection>()
const earlyEvents = new Map<string, NativeTcpEvent[]>()
const acceptedListeners = new Map<string, (event: NativeTcpAcceptedEvent) => void>()
const earlyAccepted = new Map<string, NativeTcpAcceptedEvent[]>()
let listenersReady: Promise<void> | undefined
let dataListener: PluginListenerHandle | undefined
let closeListener: PluginListenerHandle | undefined

function ensureNativeListeners(): Promise<void> {
  if (!listenersReady) {
    listenersReady = Promise.all([
      nativeTcp.addListener('tcpData', (event) => dispatchNativeEvent(event)),
      nativeTcp.addListener('tcpClosed', (event) => dispatchNativeEvent(event)),
      nativeTcp.addListener('tcpAccepted', (event) => dispatchAcceptedEvent(event)),
    ]).then(([data, closed]) => {
      dataListener = data
      closeListener = closed
    }).catch((error) => {
      listenersReady = undefined
      throw error
    })
  }
  return listenersReady
}

function dispatchNativeEvent(event: NativeTcpEvent): void {
  const connection = connections.get(event.socketId)
  if (connection) {
    connection.receive(event)
    return
  }
  const pending = earlyEvents.get(event.socketId) ?? []
  pending.push(event)
  earlyEvents.set(event.socketId, pending)
}

function dispatchAcceptedEvent(event: NativeTcpAcceptedEvent): void {
  const listener = acceptedListeners.get(event.listenerId)
  if (listener) {
    listener(event)
    return
  }
  const pending = earlyAccepted.get(event.listenerId) ?? []
  pending.push(event)
  earlyAccepted.set(event.listenerId, pending)
}

function activateConnection(socketId: string, connection: NativeTcpMultiaddrConnection): void {
  connections.set(socketId, connection)
  for (const event of earlyEvents.get(socketId) ?? []) connection.receive(event)
  earlyEvents.delete(socketId)
}

function deactivateConnection(socketId: string): void {
  connections.delete(socketId)
  earlyEvents.delete(socketId)
}

class NativeTcpMultiaddrConnection extends AbstractMultiaddrConnection {
  private readonly socketId: string
  private writeQueue: Promise<void> = Promise.resolve()
  private queuedBytes = 0

  constructor(socketId: string, remoteAddr: Multiaddr, log: Logger, direction: 'inbound' | 'outbound' = 'outbound', localAddr?: Multiaddr) {
    super({ direction, remoteAddr, localAddr, log })
    this.socketId = socketId
  }

  receive(event: NativeTcpEvent): void {
    if (event.data) this.onData(new Uint8Array(Buffer.from(event.data, 'base64')))
    if (event.error || !event.data) {
      deactivateConnection(this.socketId)
      this.onTransportClosed(event.error ? new Error(event.error) : undefined)
    }
  }

  sendData(data: Iterable<Uint8Array> & { byteLength: number }): { sentBytes: number; canSendMore: boolean } {
    let byteLength = 0
    for (const chunk of data) {
      byteLength += chunk.byteLength
      const encoded = Buffer.from(chunk).toString('base64')
      this.writeQueue = this.writeQueue.then(() => nativeTcp.write({ socketId: this.socketId, data: encoded }))
    }
    this.queuedBytes += byteLength
    void this.writeQueue.then(() => {
      this.queuedBytes = Math.max(0, this.queuedBytes - byteLength)
      if (this.writableNeedsDrain && this.queuedBytes < 256 * 1024) this.dispatchEvent(new Event('drain'))
    }).catch((error: unknown) => {
      this.onTransportClosed(error instanceof Error ? error : new Error(String(error)))
    })
    return { sentBytes: byteLength, canSendMore: this.queuedBytes < 1024 * 1024 }
  }

  async sendClose(): Promise<void> {
    await this.writeQueue.catch(() => {})
    deactivateConnection(this.socketId)
    await nativeTcp.close({ socketId: this.socketId })
  }

  sendReset(): void {
    deactivateConnection(this.socketId)
    void nativeTcp.close({ socketId: this.socketId })
  }

  sendPause(): void {}
  sendResume(): void {}
}

class NativeTcpTransport implements Transport {
  readonly [transportSymbol] = true as const
  readonly [Symbol.toStringTag] = '@nexus/native-tcp'
  readonly [serviceCapabilities] = ['@libp2p/transport']

  constructor(private readonly logger: Logger) {}

  async dial(ma: Multiaddr, options: DialTransportOptions): Promise<Connection> {
    options.signal.throwIfAborted()
    await ensureNativeListeners()
    const components = ma.getComponents()
    const host = components.find(({ name }) => ['ip4', 'ip6', 'dns', 'dns4', 'dns6'].includes(name))?.value
    const port = Number(components.find(({ name }) => name === 'tcp')?.value)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Unsupported native TCP multiaddress: ${ma}`)
    }
    const { socketId } = await nativeTcp.open({ host, port, timeoutMs: 15000 })
    const connection = new NativeTcpMultiaddrConnection(socketId, ma, this.logger)
    activateConnection(socketId, connection)
    if (options.signal.aborted) {
      await connection.close()
      options.signal.throwIfAborted()
    }
    const abort = () => connection.abort(new Error('TCP dial aborted'))
    options.signal.addEventListener('abort', abort, { once: true })
    connection.addEventListener('close', () => options.signal.removeEventListener('abort', abort), { once: true })
    try {
      return await options.upgrader.upgradeOutbound(connection, options)
    } catch (error) {
      connection.abort(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  createListener({ upgrader }: CreateListenerOptions) {
    const events = new EventTarget()
    let listenerId: string | undefined
    let addresses: Multiaddr[] = []
    let abortController: AbortController | undefined

    const onAccepted = (event: NativeTcpAcceptedEvent) => {
      let remoteAddr: Multiaddr
      try {
        const remoteHost = event.remoteHost.includes(':')
          ? `/ip6/${event.remoteHost.split('%', 2)[0]}`
          : `/ip4/${event.remoteHost}`
        remoteAddr = multiaddr(`${remoteHost}/tcp/${event.remotePort}`)
      } catch {
        void nativeTcp.close({ socketId: event.socketId })
        return
      }

      const connection = new NativeTcpMultiaddrConnection(event.socketId, remoteAddr, this.logger, 'inbound', addresses[0])
      activateConnection(event.socketId, connection)
      void upgrader.upgradeInbound(connection, { signal: abortController?.signal ?? new AbortController().signal })
        .catch((error: unknown) => connection.abort(error instanceof Error ? error : new Error(String(error))))
    }

    return {
      async listen(address: Multiaddr) {
        if (listenerId) throw new Error('Android TCP listener is already open')
        await ensureNativeListeners()
        const host = address.getComponents().find(({ name }) => ['ip4', 'ip6'].includes(name))?.value ?? '0.0.0.0'
        const port = Number(address.getComponents().find(({ name }) => name === 'tcp')?.value ?? '0')
        const result = await nativeTcp.listen({ host, port })
        listenerId = result.listenerId
        addresses = result.addresses.map((value) => multiaddr(value))
        abortController = new AbortController()
        acceptedListeners.set(listenerId, onAccepted)
        for (const event of earlyAccepted.get(listenerId) ?? []) onAccepted(event)
        earlyAccepted.delete(listenerId)
        events.dispatchEvent(new Event('listening'))
      },
      getAddrs() { return addresses },
      async close() {
        const currentId = listenerId
        if (!currentId) return
        acceptedListeners.delete(currentId)
        earlyAccepted.delete(currentId)
        abortController?.abort(new Error('Android TCP listener closed'))
        abortController = undefined
        listenerId = undefined
        addresses = []
        await nativeTcp.stopListening({ listenerId: currentId })
        events.dispatchEvent(new Event('close'))
      },
      updateAnnounceAddrs() {},
      addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        events.addEventListener(type, listener, options)
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
        events.removeEventListener(type, listener, options)
      },
      dispatchEvent(event: Event) { return events.dispatchEvent(event) },
    } as any
  }

  listenFilter(multiaddrs: Multiaddr[]): Multiaddr[] { return multiaddrs.filter((ma) => TCPMatcher.exactMatch(ma)) }
  dialFilter(multiaddrs: Multiaddr[]): Multiaddr[] { return multiaddrs.filter((ma) => TCPMatcher.exactMatch(ma)) }
}

export function nativeTcpAndroid() {
  if (!isAndroidNative()) return undefined
  return (components: { logger: Logger }) => new NativeTcpTransport(components.logger)
}
