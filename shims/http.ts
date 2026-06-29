export const createServer = () => {
  const handlers: Record<string, (...args: any[]) => void> = {}
  let addr = { port: 0, family: 'IPv4' as const, address: '127.0.0.1' }
  return {
    on: (evt: string, cb: (...args: any[]) => void) => { handlers[evt] = cb; return this },
    once: (evt: string, cb: (...args: any[]) => void) => { handlers[evt] = cb; return this },
    off: (evt: string, cb: (...args: any[]) => void) => { delete handlers[evt]; return this },
    listen: (_port: number, _host: string, cb?: () => void) => {
      addr = { port: Number(_port) || 0, family: 'IPv4', address: _host || '127.0.0.1' }
      if (handlers.listening) handlers.listening()
      if (cb) cb()
    },
    close: (cb?: () => void) => { if (cb) cb() },
    address: () => addr,
  }
}
export type IncomingMessage = any
export type Server = any
export type ServerResponse = any
