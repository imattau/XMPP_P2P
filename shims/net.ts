/** Native Android TCP socket adapter used by @xmpp/connection-tcp. */
import { registerPlugin, type Plugin, type PluginListenerHandle } from '@capacitor/core'
import { EventEmitter } from './events.js'

interface TcpEvent { socketId: string; data?: string; error?: string }
interface NativeTcpPlugin extends Plugin {
  open(options: { host: string; port: number; timeoutMs: number }): Promise<{ socketId: string }>
  write(options: { socketId: string; data: string }): Promise<void>
  close(options: { socketId: string }): Promise<void>
  startTls(options: { socketId: string; host: string }): Promise<{ protocol: string }>
  addListener(name: 'tcpData' | 'tcpClosed', listener: (event: TcpEvent) => void): Promise<PluginListenerHandle>
}

const nativeTcp = registerPlugin<NativeTcpPlugin>('NativeTcp')
const sockets = new Map<string, Socket>()
let listeners: Promise<void> | undefined

function installListeners(): Promise<void> {
  if (!listeners) listeners = Promise.all([
    nativeTcp.addListener('tcpData', (event) => sockets.get(event.socketId)?.receiveNativeData(Buffer.from(event.data ?? '', 'base64'))),
    nativeTcp.addListener('tcpClosed', (event) => {
      const socket = sockets.get(event.socketId)
      if (!socket) return
      sockets.delete(event.socketId)
      socket.receiveNativeClosed(event.error)
    }),
  ]).then(() => undefined).catch((error) => { listeners = undefined; throw error })
  return listeners
}

export class Socket extends EventEmitter {
  socketId?: string
  secure = false
  destroyed = false
  tlsOwner?: any

  receiveNativeData(data: Uint8Array): void {
    (this.tlsOwner ?? this).emit('data', data)
  }
  receiveNativeClosed(error?: string): void {
    const target = this.tlsOwner ?? this
    if (error) target.emit('error', Object.assign(new Error(error), { code: 'ECONNRESET' }))
    target.emit('close', Boolean(error))
  }

  connect(options: { host?: string; port?: number } | number, host?: string, callback?: () => void): this {
    const params = typeof options === 'number' ? { port: options, host } : options
    if (callback) this.once('connect', callback)
    void (async () => {
      try {
        await installListeners()
        const result = await nativeTcp.open({ host: params.host ?? '', port: Number(params.port), timeoutMs: 15000 })
        this.socketId = result.socketId
        sockets.set(result.socketId, this)
        if (this.destroyed) { await nativeTcp.close({ socketId: result.socketId }); return }
        this.emit('connect')
      } catch (error) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)))
      }
    })()
    return this
  }

  write(data: string | Uint8Array, callback?: (error?: Error) => void): boolean {
    if (!this.socketId || this.destroyed) {
      callback?.(new Error('TCP socket is not connected'))
      return false
    }
    const encoded = Buffer.from(data as any).toString('base64')
    void nativeTcp.write({ socketId: this.socketId, data: encoded })
      .then(() => callback?.())
      .catch((error) => callback?.(error instanceof Error ? error : new Error(String(error))))
    return true
  }

  end(data?: string | Uint8Array): this {
    if (data !== undefined) this.write(data)
    this.destroyed = true
    if (this.socketId) void nativeTcp.close({ socketId: this.socketId })
    return this
  }

  destroy(error?: Error): this {
    this.destroyed = true
    if (error) this.emit('error', error)
    if (this.socketId) void nativeTcp.close({ socketId: this.socketId })
    return this
  }

  setKeepAlive(): this { return this }
  setTimeout(): this { return this }
  setNoDelay(): this { return this }
}

export const connect = (options: { host?: string; port?: number } | number, host?: string, callback?: () => void) =>
  new Socket().connect(options, host, callback)
export const createConnection = connect
export const isIP = (_input: string) => 0
export type Server = any
export const createServer = () => ({ on: () => {}, listen: () => {}, close: () => {} })
export default { Socket, connect, createConnection, createServer, isIP }
