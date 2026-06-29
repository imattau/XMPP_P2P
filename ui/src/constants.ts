export interface PublicServer {
  domain: string
  label: string
  category?: string
  registerUrl?: string
  wsUrl?: string
  supportsInBandRegistration?: boolean
}

let cachedServers: PublicServer[] | null = null

export async function fetchPublicServers(): Promise<PublicServer[]> {
  if (cachedServers) return cachedServers
  try {
    const resp = await fetch('https://data.xmpp.net/providers/v2/providers-B.json')
    if (resp.ok) {
      const providers: any[] = await resp.json()
      cachedServers = providers
        .filter((p: any) => p.inBandRegistration !== false)
        .map((p: any) => ({
          domain: p.jid,
          label: p.jid,
          category: p.category || 'D',
          registerUrl: p.registrationWebPage?.en || p.registrationWebPage?.[Object.keys(p.registrationWebPage || {})[0]] || undefined,
          supportsInBandRegistration: p.inBandRegistration === true,
        }))
      if (cachedServers.length > 0) return cachedServers
    }
  } catch {}

  cachedServers = [
    { domain: 'jabber.org', label: 'jabber.org', wsUrl: 'wss://jabber.org:5443/xmpp-websocket', registerUrl: 'https://register.jabber.org', supportsInBandRegistration: true },
    { domain: 'conversations.im', label: 'conversations.im', wsUrl: 'wss://conversations.im:5443/xmpp-websocket', registerUrl: 'https://account.conversations.im', supportsInBandRegistration: true },
    { domain: 'sure.im', label: 'sure.im', wsUrl: 'wss://sure.im:5291/', registerUrl: 'https://sure.im/register', supportsInBandRegistration: true },
    { domain: 'jabber.hot-chilli.net', label: 'jabber.hot-chilli.net', wsUrl: 'wss://jabber.hot-chilli.net:443/xmpp-websocket', registerUrl: 'https://jabber.hot-chilli.net/register', supportsInBandRegistration: true },
    { domain: 'jabberfr.org', label: 'jabberfr.org', wsUrl: 'wss://ws.jabberfr.org/', supportsInBandRegistration: true },
    { domain: 'movim.eu', label: 'movim.eu', wsUrl: 'wss://movim.eu/xmpp', supportsInBandRegistration: true },
  ]
  return cachedServers
}

export function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
