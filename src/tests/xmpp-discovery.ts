import { XmppClientBridge } from '../core/xmpp-client-bridge.js'

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function response(url: string, body: unknown): Response {
  return {
    ok: true,
    status: 200,
    url,
    json: async () => body,
    text: async () => String(body),
  } as Response
}

async function run(): Promise<void> {
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: string; credentials?: RequestCredentials }> = []
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), credentials: init?.credentials })
      return response(String(input), {
        links: [
          { rel: 'urn:xmpp:alt-connections:websocket', href: 'ws://insecure.example/xmpp' },
          { rel: 'urn:xmpp:alt-connections:websocket', href: 'wss://chat.example/xmpp-websocket' },
        ],
      })
    }) as typeof fetch

    const jsonUrl = await new XmppClientBridge().discoverWebSocketUrl('example.test')
    assert(jsonUrl === 'wss://chat.example/xmpp-websocket', 'JSON host-meta should select a secure XMPP WebSocket URL')
    assert(requests.length === 1, 'JSON host-meta should be preferred before XML host-meta')
    assert(requests[0].credentials === 'omit', 'host-meta requests must omit browser credentials')

    requests.length = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, credentials: init?.credentials })
      return url.endsWith('.json')
        ? response(url, { links: [] })
        : response(url, `<XRD><Link rel="urn:xmpp:alt-connections:websocket" href="wss://ws.example/xmpp?token=a&amp;b=c" /></XRD>`)
    }) as typeof fetch

    const xmlUrl = await new XmppClientBridge().discoverWebSocketUrl('example.test')
    assert(xmlUrl === 'wss://ws.example/xmpp?token=a&b=c', 'XML host-meta should parse escaped attributes and preserve the secure URL')
    assert(requests.length === 2 && requests[1].url.endsWith('/.well-known/host-meta'), 'host-meta should use JSON then XML fallback')

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      return url.endsWith('.json')
        ? response(url, { links: [{ rel: 'urn:xmpp:alt-connections:websocket', href: 'ws://insecure.example/xmpp' }] })
        : response(url, '<XRD />')
    }) as typeof fetch
    const insecureUrl = await new XmppClientBridge().discoverWebSocketUrl('example.test')
    assert(insecureUrl === null, 'discovery must reject insecure WebSocket URLs')

    const tcpEnabled = new XmppClientBridge(true)
    tcpEnabled.discoverWebSocketUrl = async () => null
    const tcpAttempts: string[] = []
    ;(tcpEnabled as any).connectToService = async (_credentials: unknown, _jid: unknown, service: string) => {
      tcpAttempts.push(service)
      throw new Error('offline')
    }
    await tcpEnabled.connect({ jid: 'alice@example.test', password: 'unused' }).catch(() => {})
    assert(tcpAttempts.includes('xmpp://example.test:5222'), 'native TCP capability should add the STARTTLS XMPP fallback')
    assert(tcpAttempts.includes('xmpps://example.test:5223'), 'native TCP capability should add the direct TLS XMPP fallback')

    const tcpDisabled = new XmppClientBridge(false)
    tcpDisabled.discoverWebSocketUrl = async () => null
    const webAttempts: string[] = []
    ;(tcpDisabled as any).connectToService = async (_credentials: unknown, _jid: unknown, service: string) => {
      webAttempts.push(service)
      throw new Error('offline')
    }
    await tcpDisabled.connect({ jid: 'alice@example.test', password: 'unused' }).catch(() => {})
    assert(!webAttempts.some((service) => service.startsWith('xmpp:') || service.startsWith('xmpps:')),
      'browser capability should not add native TCP fallbacks')

    console.log('XMPP host-meta discovery and native TCP fallback selection: PASS')
  } finally {
    globalThis.fetch = originalFetch
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
