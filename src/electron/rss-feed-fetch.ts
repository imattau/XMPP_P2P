import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const octets = address.split('.').map(Number)
    const [a, b] = octets
    return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
      || a >= 224)
  }
  if (version !== 6) return false
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7))
  return normalized !== '::' && normalized !== '::1'
    && !normalized.startsWith('ff') && !normalized.startsWith('2001:db8:')
    && !normalized.startsWith('fc') && !normalized.startsWith('fd')
    && !normalized.startsWith('fe8') && !normalized.startsWith('fe9')
    && !normalized.startsWith('fea') && !normalized.startsWith('feb')
}

/** Electron-only feed transport: reject hosts resolving to local/private addresses. */
export async function fetchRssFeed(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url)
  const addresses = isIP(parsed.hostname) ? [{ address: parsed.hostname }] : await lookup(parsed.hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('This feed host resolves to a local or private network address.')
  }
  return fetch(url, init)
}
