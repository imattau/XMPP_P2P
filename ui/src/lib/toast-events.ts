type ToastType = 'success' | 'error' | 'info'
type Listener = (message: string, type: ToastType) => void

const listeners = new Set<Listener>()

export function onToast(cb: Listener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function emitToast(message: string, type: ToastType = 'info') {
  for (const cb of listeners) {
    try { cb(message, type) } catch { /* noop */ }
  }
}
