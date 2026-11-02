import { XmppClientBridge } from '../core/xmpp-client-bridge.js'
import { xml } from '@xmpp/xml'
import { createRequire } from 'node:module'

type ProbeWebSocket = {
  on(event: 'open', listener: () => void): void
  on(event: 'message', listener: (data: unknown) => void): void
  on(event: 'error', listener: (error: Error & { code?: string }) => void): void
  on(event: 'close', listener: () => void): void
  send(data: string): void
  close(): void
  terminate(): void
}
const WebSocket = createRequire(import.meta.url)('ws') as new (url: string, protocols?: string[]) => ProbeWebSocket

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`TIMEOUT: ${message}`)
}

// Public endpoints used for optional, read-only integration checks.
const TEST_SERVERS: Array<{ domain: string; wsUrl: string; label: string }> = [
  { domain: 'chatterboxtown.us', wsUrl: 'wss://chatterboxtown.us:5443/ws/', label: 'chatterboxtown.us' },
  { domain: 'jabber.hot-chilli.net', wsUrl: 'wss://jabber.hot-chilli.net:443/xmpp-websocket', label: 'hot-chilli.net' },
  { domain: 'jabberfr.org', wsUrl: 'wss://ws.jabberfr.org/', label: 'jabberfr.org' },
  { domain: 'sure.im', wsUrl: 'wss://sure.im:5291/', label: 'sure.im' },
  { domain: 'movim.eu', wsUrl: 'wss://movim.eu/xmpp', label: 'movim.eu' },
]

async function testHostMetaDiscovery() {
  console.log('\n=== Test 1: XEP-0156 HTTPS Host-Meta WebSocket Discovery ===\n')

  for (const server of TEST_SERVERS) {
    try {
      const bridge = new XmppClientBridge()
      const wsUrl = await bridge.discoverWebSocketUrl(server.domain)
      if (wsUrl) {
        console.log(`  ✓ ${server.label} (${server.domain}) → ${wsUrl}`)
        assert(new URL(wsUrl).protocol === 'wss:', `${server.label} discovery must return a secure WebSocket URL`)
      } else {
        console.log(`  • ${server.label} (${server.domain}) → No host-meta endpoint; direct server URL can still be configured`)
      }
    } catch (err: any) {
      console.log(`  • ${server.label} (${server.domain}) → Host-meta unavailable: ${err.message}`)
    }
  }

  console.log('\n  ✓ Host-meta discovery check: PASS')
}

async function testDirectWebSocketConnection() {
  console.log('\n=== Test 2: Unauthenticated XMPP Stream Handshake ===\n')
  let connectedAny = false

  for (const server of TEST_SERVERS) {
    console.log(`  Testing ${server.label} (${server.wsUrl})...`)
    try {
      const ws = new WebSocket(server.wsUrl, ['xmpp'])
      await new Promise<void>((resolve, reject) => {
        let settled = false
        let buffer = ''
        let closeTimer: ReturnType<typeof setTimeout> | undefined
        let finishError: Error | undefined
        const finishAfterClose = (error?: Error) => {
          if (error) reject(error)
          else resolve()
        }
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          finishError = error
          clearTimeout(timer)
          try {
            ws.close()
            closeTimer = setTimeout(() => {
              ws.terminate()
              finishAfterClose(error)
            }, 1000)
          } catch {
            finishAfterClose(error)
          }
        }
        const timer = setTimeout(() => {
          finish(new Error('Timed out before the server advertised stream features'))
        }, 8000)
        ws.on('open', () => {
          ws.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='${server.domain}' version='1.0'/>`)
        })
        ws.on('message', (data) => {
          buffer += typeof data === 'string' ? data : String(data)
          if (/<(?:[\w.-]+:)?features\b/i.test(buffer) && /<\/(?:[\w.-]+:)?features\s*>/i.test(buffer)) {
            finish()
          }
        })
        ws.on('error', (error) => {
          const details = [error.message, error.code].filter(Boolean).join(' / ')
          finish(new Error(`WebSocket transport failed${details ? ` (${details})` : ''}`))
        })
        ws.on('close', () => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            finishAfterClose(new Error('Server closed before advertising stream features'))
          } else {
            if (closeTimer) clearTimeout(closeTimer)
            finishAfterClose(finishError)
          }
        })
      })
      console.log(`    ✓ XMPP stream features received without authentication`)
      connectedAny = true
    } catch (err: any) {
      console.log(`    ✗ ${err.message}`)
    }
  }

  assert(connectedAny, 'Could not complete an unauthenticated XMPP stream handshake with any server')
  console.log('\n  ✓ XMPP stream handshake: PASS')
}

async function testXmppLogin(
  bridge: XmppClientBridge,
  jid: string,
  password: string,
  service?: string
): Promise<void> {
  console.log(`  Connecting to ${jid}...`)
  const connectionEvents: any[] = []
  bridge.on('connection', (info: any) => {
    connectionEvents.push(info)
    const statusIcon = info.status === 'connected' ? '✓' : info.status === 'error' ? '✗' : '∼'
    console.log(`    ${statusIcon} Connection status: ${info.status}${info.error ? ` (${info.error})` : ''}`)
  })

  await bridge.connect({ jid, password, service })
  await waitFor(() => bridge.isConnected, 15000, 'Server did not transition to connected state')
  assert(bridge.isConnected, 'Bridge.isConnected should be true after successful connect()')
  console.log('  ✓ Connected successfully')
}

async function testDiscoInfo(bridge: XmppClientBridge, target: string, label: string) {
  console.log(`\n=== Test: Service Discovery (disco#info) on ${label} ===\n`)

  const info = await bridge.discoInfo(target)
  assert(info.identities.length > 0, `${label} should expose at least one identity`)
  assert(info.features.length > 0, `${label} should expose at least one feature`)

  console.log(`  Identities (${info.identities.length}):`)
  for (const id of info.identities) {
    console.log(`    - ${id.category}/${id.type}${id.name ? ` (${id.name})` : ''}`)
  }
  console.log(`  Features (${info.features.length}):`)
  const keyFeatures = info.features.filter((f: string) =>
    f.includes('jabber:iq:register') ||
    f.includes('http://jabber.org/protocol') ||
    f.includes('urn:xmpp') ||
    f.includes('jabber:iq:roster') ||
    f.includes('msn')
  )
  for (const f of keyFeatures.slice(0, 15)) {
    console.log(`    - ${f}`)
  }
  if (info.features.length > 15) {
    console.log(`    ... and ${info.features.length - 15} more`)
  }

  console.log(`\n  ✓ Service discovery on ${label}: PASS`)
}

async function testDiscoItems(bridge: XmppClientBridge, target: string, label: string) {
  console.log(`\n=== Test: Service Discovery (disco#items) on ${label} ===\n`)

  const items = await bridge.discoItems(target)
  console.log(`  Items (${items.items.length}):`)
  for (const item of items.items) {
    console.log(`    - ${item.jid}${item.name ? ` (${item.name})` : ''}${item.node ? ` [${item.node}]` : ''}`)
  }

  console.log(`\n  ✓ Service discovery items on ${label}: PASS`)

  // Discover info on each component
  for (const item of items.items.slice(0, 5)) {
    try {
      const itemInfo = await bridge.discoInfo(item.jid)
      const idents = itemInfo.identities.map((i: any) => `${i.category}/${i.type}`).join(', ')
      console.log(`  Component ${item.jid}: ${idents}`)
    } catch (err: any) {
      // Some components may not allow disco from non-local users
    }
  }
}

async function testPresence(bridge: XmppClientBridge) {
  console.log('\n=== Test: Send initial presence ===\n')
  await bridge.sendPresence(undefined, 'Online from XMPP_P2P test')
  console.log('  ✓ Initial presence broadcast')
}

async function testPing(bridge: XmppClientBridge, domain: string) {
  console.log('\n=== Test: Server ping (XEP-0199) ===\n')
  try {
    const pingResult = await bridge.sendIQ(domain, 'get', xml('ping', { xmlns: 'urn:xmpp:ping' }))
    console.log(`  ✓ Ping response: type=${pingResult.attrs.type}`)
  } catch (err: any) {
    console.log(`  ∼ Ping not supported or failed: ${err.message}`)
  }
}

async function testMucPresence(bridge: XmppClientBridge, serverDomain: string, nick: string) {
  // Try joining a MUC room if a conference component exists
  const items = await bridge.discoItems(serverDomain)
  const mucItems = items.items.filter((i: any) =>
    i.jid.includes('muc') || i.jid.includes('conference') || i.jid.includes('chat')
  )
  if (mucItems.length > 0) {
    const mucJid = mucItems[0].jid
    console.log(`\n=== Test: MUC presence to ${mucJid} ===\n`)
    try {
      await bridge.joinMuc(mucJid, nick)
      console.log(`  ✓ Joined MUC ${mucJid} as ${nick}`)
      // Wait a moment then leave
      await new Promise(resolve => setTimeout(resolve, 1000))
      await bridge.leaveMuc(mucJid, nick)
      console.log(`  ✓ Left MUC ${mucJid}`)
    } catch (err: any) {
      console.log(`  ∼ MUC join failed: ${err.message}`)
    }
  } else {
    console.log('\n  ∼ No MUC component discovered, skipping MUC test')
  }
}

async function testDisconnect(bridge: XmppClientBridge) {
  console.log('\n=== Test: Disconnect ===\n')
  await bridge.disconnect()
  await waitFor(() => !bridge.isConnected, 5000, 'Server did not disconnect cleanly')
  assert(!bridge.isConnected, 'Bridge should report disconnected after disconnect()')
  console.log('  ✓ Disconnected cleanly')
}

async function testReconnect(
  bridge: XmppClientBridge,
  jid: string,
  password: string,
  service?: string
): Promise<void> {
  console.log('\n=== Test: Re-connect ===\n')
  await bridge.connect({ jid, password, service })
  await waitFor(() => bridge.isConnected, 15000, 'Server did not transition to connected on re-connect')
  assert(bridge.isConnected, 'Bridge should report connected after re-connect()')
  console.log('  ✓ Re-connected successfully')
}

async function testErrorHandling() {
  console.log('\n=== Test: Error handling ===\n')

  // Test sendStanza when not connected
  console.log('  Testing sendStanza while disconnected...')
  const bridge = new XmppClientBridge()
  try {
    await bridge.sendStanza(xml('message', { to: 'test@jabber.org', type: 'chat' }, xml('body', {}, 'test')))
    assert(false, 'Should have thrown when sending while disconnected')
  } catch (err: any) {
    console.log(`  ✓ Correctly rejected send while disconnected: ${err.message}`)
  }

  // Test connection to non-existent server
  console.log('\n  Testing connection to non-existent server...')
  try {
    await bridge.connect({ jid: 'test@nonexistent-test-server-xyz.example', password: 'test' })
    assert(false, 'Should have thrown for non-existent server')
  } catch (err: any) {
    console.log(`  ✓ Correctly rejected non-existent server: ${err.message.slice(0, 80)}`)
  } finally {
    try { await bridge.disconnect() } catch {}
  }

  console.log('\n  ✓ Error handling: PASS')
}

async function testFullConnectionLifecycle(
  jid: string,
  password: string,
  service: string | undefined,
  domain: string,
  label: string
): Promise<void> {
  console.log(`\n════════════════════════════════════════════════`)
  console.log(`  Testing: ${label}`)
  console.log(`  Server: ${service || domain}`)
  console.log(`════════════════════════════════════════════════`)

  const bridge = new XmppClientBridge()

  try {
    // Connect
    await testXmppLogin(bridge, jid, password, service)

    // Disco info on the server
    await testDiscoInfo(bridge, domain, domain)

    // Disco items on the server
    await testDiscoItems(bridge, domain, domain)

    // Send presence
    await testPresence(bridge)

    // Ping the server
    await testPing(bridge, domain)

    // MUC
    await testMucPresence(bridge, domain, jid.split('@')[0])

    // Disconnect
    await testDisconnect(bridge)

    // Reconnect
    await testReconnect(bridge, jid, password, service)

    // Final disconnect
    await testDisconnect(bridge)

    console.log(`\n  ✓ Full lifecycle for ${label}: PASS\n`)
  } finally {
    try { await bridge.disconnect() } catch {}
  }
}

async function runServerBridgeRealTest() {
  console.log('══════════════════════════════════════════════════════')
  console.log('  XMPP Client Bridge — Real Server Integration Tests')
  console.log('══════════════════════════════════════════════════════\n')

  let passed = 0
  let failed = 0
  let skipped = 0

  // ─── Test 1: HTTPS Host-Meta Discovery ───
  try {
    await testHostMetaDiscovery()
    passed++
  } catch (err: any) {
    console.log(`\n  ✗ Host-meta discovery FAILED: ${err.message}`)
    failed++
  }

  // ─── Test 2: Direct WebSocket Connections ───
  try {
    await testDirectWebSocketConnection()
    passed++
  } catch (err: any) {
    console.log(`\n  ✗ Direct WebSocket connection FAILED: ${err.message}`)
    failed++
  }

  // ─── Test 3: Error Handling ───
  try {
    await testErrorHandling()
    passed++
  } catch (err: any) {
    console.log(`\n  ✗ Error handling FAILED: ${err.message}`)
    failed++
  }

  // ─── Test 4-5: Full Connection and Messaging ───
  // Try in-band registration on accessible servers, then use env credentials.
  const credsConfigs: Array<{
    jid: string
    password: string
    service?: string
    domain: string
    label: string
  }> = []

  // Prefer environment variables for full test
  const envJid = process.env.XMPP_TEST_JID
  const envPassword = process.env.XMPP_TEST_PASSWORD
  const envService = process.env.XMPP_TEST_SERVICE
  if (envJid && envPassword) {
    credsConfigs.push({
      jid: envJid,
      password: envPassword,
      service: envService,
      domain: envJid.split('@')[1] || '',
      label: `env:${envJid}`,
    })
  }

  if (credsConfigs.length === 0) {
    console.log('\n  No credentials available — skipping connection lifecycle tests.')
    console.log('  To run full tests, set:')
    console.log('    export XMPP_TEST_JID="user@example.com"')
    console.log('    export XMPP_TEST_PASSWORD="hunter2"')
    console.log('    export XMPP_TEST_SERVICE="wss://example.com:5443/xmpp-websocket"')
    console.log('  Credentials must belong to a test account you control; this test never creates public accounts.')
    skipped++
  } else {
    for (const config of credsConfigs) {
      try {
        await testFullConnectionLifecycle(
          config.jid,
          config.password,
          config.service,
          config.domain,
          config.label
        )
        passed++
      } catch (err: any) {
        console.log(`\n  ✗ Connection lifecycle for ${config.label} FAILED: ${err.message}`)
        failed++
      }
    }
  }

  // ─── Summary ───
  const total = passed + failed + skipped
  console.log('══════════════════════════════════════════════════════')
  console.log('  RESULTS SUMMARY')
  console.log('══════════════════════════════════════════════════════')
  console.log(`  Total tests:  ${total}`)
  console.log(`  Passed:       ${passed}`)
  console.log(`  Failed:       ${failed}`)
  console.log(`  Skipped:      ${skipped}`)
  console.log('══════════════════════════════════════════════════════\n')

  if (failed > 0) {
    throw new Error(`${failed} test(s) FAILED`)
  }
}

runServerBridgeRealTest().catch((err) => {
  console.error(`\n❌ ${err.message}`)
  process.exit(1)
})
