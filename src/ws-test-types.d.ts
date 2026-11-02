declare module 'ws' {
  export const WebSocket: any
  export class WebSocketServer {
    constructor(options: { host: string; port: number })
    address(): { port: number } | string | null
    on(event: 'connection', listener: (socket: {
      on(event: 'message', listener: (buffer: { toString(): string }) => void): void
      send(data: string): void
    }) => void): void
    on(event: 'listening', listener: () => void): void
    close(callback: () => void): void
  }
}
