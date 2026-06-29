/**
 * Browser shim for Node's `net` module.
 *
 * TCP sockets are not available in the browser. Any code that calls
 * `net.connect()` via the esbuild bundle will receive a stub socket that
 * immediately emits an 'error' event so the caller fails fast instead of
 * hanging indefinitely.
 */

export const connect = (_port?: number, _host?: string, _cb?: () => void) => {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {}

  const socket = {
    on(evt: string, cb: (...args: any[]) => void) {
      ;(handlers[evt] ??= []).push(cb)
      return socket
    },
    once(evt: string, cb: (...args: any[]) => void) {
      const wrapped = (...args: any[]) => {
        cb(...args)
        socket.off(evt, wrapped)
      }
      ;(handlers[evt] ??= []).push(wrapped)
      return socket
    },
    off(evt: string, cb: (...args: any[]) => void) {
      if (handlers[evt]) {
        handlers[evt] = handlers[evt].filter(fn => fn !== cb)
      }
      return socket
    },
    emit(evt: string, ...args: any[]) {
      for (const fn of handlers[evt] ?? []) fn(...args)
      return socket
    },
    write: () => true,
    end: () => {},
    destroy: () => {},
    setKeepAlive: () => {},
    setTimeout: () => {},
    removeAllListeners(evt?: string) {
      if (evt) delete handlers[evt]
      else Object.keys(handlers).forEach(k => delete handlers[k])
      return socket
    },
  }

  // Defer the error so listeners added synchronously after connect() can receive it.
  Promise.resolve().then(() => {
    socket.emit('error', Object.assign(new Error('TCP sockets are not available in the browser'), { code: 'EUNSUPPORTED' }))
  })

  return socket
}

export type Socket = any
export type Server = any
export const createServer = () => ({ on: () => {}, listen: () => {}, close: () => {} })
