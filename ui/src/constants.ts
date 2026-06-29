export interface PublicServer {
  domain: string
  label: string
  category?: string
  registerUrl?: string
}

let cachedServers: PublicServer[] | null = null

export async function fetchPublicServers(): Promise<PublicServer[]> {
  if (cachedServers) return cachedServers
  try {
    const resp = await fetch('https://data.xmpp.net/providers/v2/providers-B.json')
    if (resp.ok) {
      const providers: any[] = await resp.json()
      cachedServers = providers.map((p: any) => ({
        domain: p.jid,
        label: p.jid,
        category: p.category || 'D',
        registerUrl: p.registrationWebPage?.en || p.registrationWebPage?.[Object.keys(p.registrationWebPage || {})[0]] || undefined,
      }))
      return cachedServers
    }
  } catch {}

  cachedServers = [
    { domain: 'jabber.org', label: 'jabber.org', registerUrl: 'https://register.jabber.org' },
    { domain: 'conversations.im', label: 'conversations.im', registerUrl: 'https://account.conversations.im' },
    { domain: '404.city', label: '404.city', registerUrl: 'https://404.city/register' },
    { domain: 'dismail.de', label: 'dismail.de', registerUrl: 'https://dismail.de/register' },
    { domain: 'sure.im', label: 'sure.im', registerUrl: 'https://sure.im/register' },
  ]
  return cachedServers
}

export function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
