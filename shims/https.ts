/**
 * Browser shim for Node's `https` module.
 *
 * HTTPS requests are not available in the browser via the Node API.
 * Any code that calls `https.get()` or `https.request()` will receive a
 * stub response object that emits an 'error' event so the caller fails
 * fast instead of hanging indefinitely.
 */

function createStubResponse() {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {}

  const res = {
    on(evt: string, cb: (...args: any[]) => void) {
      ;(handlers[evt] ??= []).push(cb)
      return res
    },
    once(evt: string, cb: (...args: any[]) => void) {
      const wrapped = (...args: any[]) => {
        cb(...args)
        const idx = handlers[evt]?.indexOf(wrapped)
        if (idx !== undefined && idx >= 0) handlers[evt]?.splice(idx, 1)
      }
      ;(handlers[evt] ??= []).push(wrapped)
      return res
    },
    off(evt: string, cb: (...args: any[]) => void) {
      const idx = handlers[evt]?.indexOf(cb)
      if (idx !== undefined && idx >= 0) handlers[evt]?.splice(idx, 1)
      return res
    },
    emit(evt: string, ...args: any[]) {
      for (const cb of (handlers[evt] ?? []).slice()) {
        try { cb(...args) } catch { /* swallow */ }
      }
    },
    destroy() {},
    end() {},
    write() {},
    abort() {},
    setTimeout() { return res },
    statusCode: 503,
    statusMessage: 'Service Unavailable',
    headers: {},
  }

  // Emit error asynchronously so callers can attach handlers
  setTimeout(() => {
    for (const cb of (handlers.error ?? []).slice()) {
      try { cb(new Error('https is not available in the browser')) } catch { /* swallow */ }
    }
  }, 0)

  return res
}

export const get = () => createStubResponse()
export const request = () => createStubResponse()
