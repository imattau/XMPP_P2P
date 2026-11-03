/** Android native TLS upgrade adapter for the XMPP TCP transport. */
import { registerPlugin, type Plugin } from '@capacitor/core'
import { Socket as TcpSocket } from './net.js'
import { EventEmitter } from './events.js'

interface NativeTlsPlugin extends Plugin {
  open(options: { host: string; port: number; timeoutMs: number }): Promise<{ socketId: string }>
  startTls(options: { socketId: string; host: string }): Promise<{ protocol: string }>
  close(options: { socketId: string }): Promise<void>
}
const nativeTcp = registerPlugin<NativeTlsPlugin>('NativeTcp')

export class TLSSocket extends EventEmitter {
  socket?: TcpSocket
  secure = true
  private protocol = 'TLSv1.2'

  connect(options: { socket?: TcpSocket; host?: string; port?: number }, callback?: () => void): this {
    if (callback) this.once('secureConnect', callback)
    const upgrade = async (socket: TcpSocket) => {
      this.socket = socket
      socket.tlsOwner = this
      try {
        if (!socket.socketId) throw new Error('TCP socket is not connected')
        const result = await nativeTcp.startTls({ socketId: socket.socketId, host: options.host ?? '' })
        this.protocol = result.protocol || this.protocol
        socket.secure = true
        this.emit('secureConnect')
      } catch (error) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)))
      }
    }
    if (options.socket) void upgrade(options.socket)
    else {
      const raw = new TcpSocket()
      raw.tlsOwner = this
      raw.once('connect', () => void upgrade(raw))
      raw.once('error', (error: Error) => this.emit('error', error))
      raw.connect({ host: options.host, port: options.port })
    }
    return this
  }

  write(data: string | Uint8Array, callback?: (error?: Error) => void): boolean {
    return this.socket?.write(data, callback) ?? false
  }
  end(data?: string | Uint8Array): this { this.socket?.end(data); return this }
  destroy(error?: Error): this { this.socket?.destroy(error); return this }
  getProtocol(): string { return this.protocol }
}

export const connect = (options: { socket?: TcpSocket; host?: string; port?: number }, callback?: () => void) =>
  new TLSSocket().connect(options, callback)
export type SecureContext = any
export const createSecureContext = () => ({})
export default { connect, TLSSocket, createSecureContext }
