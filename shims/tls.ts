export const connect = () => {
  const socket = {
    on: () => socket,
    write: () => true,
    end: () => {},
    destroy: () => {},
    removeAllListeners: () => {},
  }
  return socket
}
