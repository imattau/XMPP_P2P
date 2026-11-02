import { multiaddr } from '@multiformats/multiaddr'

/** Return a canonical root WebSocket relay address, or undefined if invalid. */
export function normalizeBootstrapAddress(value: string): string | undefined {
  const candidate = value.trim().replace(/\/$/, '')
  if (!candidate || candidate.includes('/http-path/')) return undefined

  try {
    const address = multiaddr(candidate)
    const components = address.getComponents()
    const peerComponent = components.at(-1)
    const websocketIndex = components.findIndex(({ name }) => name === 'ws' || name === 'wss')
    if (websocketIndex < 0 || websocketIndex !== components.length - 2 || peerComponent?.name !== 'p2p') {
      return undefined
    }
    if (components[websocketIndex].name === 'ws') {
      const host = components.find(({ name }) => ['dns', 'dns4', 'dns6', 'ip4', 'ip6'].includes(name))?.value ?? ''
      const isLoopback = host === 'localhost' || host.endsWith('.localhost') || host === '::1'
        || (host.startsWith('127.') && host.split('.').length === 4)
      if (typeof window === 'undefined' || window.location.protocol !== 'http:' || !isLoopback) {
        return undefined
      }
    }
    return address.toString()
  } catch {
    return undefined
  }
}
