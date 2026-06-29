export const connect = () => {
  const socket = {
    on: () => socket,
    write: () => true,
    end: () => {},
    destroy: () => {},
    setKeepAlive: () => {},
    setTimeout: () => {},
    removeAllListeners: () => {},
  }
  return socket
}
export type Socket = any
export type Server = any
export const createServer = () => ({ on: () => {}, listen: () => {}, close: () => {} })
