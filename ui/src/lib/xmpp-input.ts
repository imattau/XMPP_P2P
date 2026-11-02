export function normalizeXmppJid(value: string): { jid: string; domain: string } {
  const input = value.trim()
  // A resource may itself contain `@`; validate the account JID before the
  // first slash and always return the bare JID for roster and account calls.
  const jid = input.split('/')[0]
  const separator = jid.lastIndexOf('@')
  const domain = jid.slice(separator + 1)
  if (separator <= 0 || !domain || jid.indexOf('@') !== separator || /\s/.test(jid)) {
    throw new Error('Enter your full XMPP JID, for example user@example.com.')
  }
  return { jid, domain }
}

export function getOptionalWebSocketUrl(value: string, allowNativeTcp = false): string | undefined {
  const endpoint = value.trim()
  if (!endpoint) return undefined
  try {
    const parsed = new URL(endpoint)
    const nativeTcp = parsed.protocol === 'xmpp:' || parsed.protocol === 'xmpps:'
    if (nativeTcp && allowNativeTcp && parsed.hostname && !parsed.username && !parsed.password
      && (parsed.pathname === '' || parsed.pathname === '/') && !parsed.search && !parsed.hash) {
      return parsed.toString()
    }
    const hostname = parsed.hostname.toLowerCase()
    const ipv4Parts = hostname.split('.')
    const isLoopback = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '[::1]'
      || (ipv4Parts.length === 4 && ipv4Parts[0] === '127'
        && ipv4Parts.every((part) => /^\d+$/.test(part) && Number(part) <= 255))
    const securePage = typeof window !== 'undefined' && window.location.protocol === 'https:'
    if ((parsed.protocol === 'wss:' || (parsed.protocol === 'ws:' && isLoopback))
      && !(parsed.protocol === 'ws:' && securePage)
      && parsed.hostname
      && !parsed.username
      && !parsed.password
      && !parsed.hash) return parsed.toString()
  } catch {
    // Return a focused validation message for malformed custom endpoints.
  }
  throw new Error(allowNativeTcp
    ? 'Server URL must use wss://, xmpp:// or xmpps://. ws:// is only allowed for localhost development.'
    : 'Server URL must use wss://. ws:// is only allowed for a localhost development server served over http://.')
}
