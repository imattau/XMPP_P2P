export const PUBLIC_SERVERS = [
  { domain: 'jabber.org', label: 'jabber.org', websocket: 'wss://jabber.org:5443/ws', registerUrl: 'https://register.jabber.org' },
  { domain: 'conversations.im', label: 'conversations.im', websocket: 'wss://conversations.im:5443/ws', registerUrl: 'https://account.conversations.im' },
  { domain: '404.city', label: '404.city', websocket: 'wss://404.city:5443/ws', registerUrl: 'https://404.city/register' },
  { domain: 'dismail.de', label: 'dismail.de', websocket: 'wss://dismail.de:5443/ws', registerUrl: 'https://dismail.de/register' },
  { domain: 'sure.im', label: 'sure.im', websocket: 'wss://sure.im:5443/ws', registerUrl: 'https://sure.im/register' },
]

export function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
