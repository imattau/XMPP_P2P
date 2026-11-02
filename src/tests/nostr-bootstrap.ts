import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { generateSecretKey } from 'nostr-tools/pure'
import { nsecEncode } from 'nostr-tools/nip19'
import { multiaddr } from '@multiformats/multiaddr'
import { createP2PNode } from '../core/p2p.js'
import { createBrowserP2PNode } from '../core/p2p-browser.js'
import { loadOrCreateNostrBootstrapSecretKey } from '../core/node-nostr-bootstrap-key.js'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import {
  createNostrBootstrapEvent,
  discoverNostrBootstrapAddrs,
  normalizeNostrBootstrapConfig,
  normalizeNostrRelayUrl,
  nostrSecretKeyFromString,
  publishNostrBootstrapAnnouncement,
  verifyNostrBootstrapEvent,
} from '../core/nostr-bootstrap.js'
import { writeBrowserBootstrapConfig } from '../core/browser-bootstrap-config.js'

const secretKey = generateSecretKey()
const peerId = '12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q'
const bootstrapAddr = `/dns4/relay.example.test/tcp/443/wss/p2p/${peerId}`
const now = 1_800_000_000
const event = createNostrBootstrapEvent(secretKey, peerId, [bootstrapAddr], now, 3600)

assert.deepEqual(verifyNostrBootstrapEvent(event, now), [bootstrapAddr])
const otherPublisherEvent = createNostrBootstrapEvent(generateSecretKey(), peerId, [bootstrapAddr], now, 3600)
assert.deepEqual(verifyNostrBootstrapEvent(otherPublisherEvent, now), [bootstrapAddr])
assert.deepEqual(verifyNostrBootstrapEvent(event, now + 3601), [])
assert.deepEqual(verifyNostrBootstrapEvent({ ...event, content: '{}' }, now), [])
assert.deepEqual(verifyNostrBootstrapEvent({ ...event, tags: [['d', 'other'], ...event.tags.slice(1)] }, now), [])
assert.throws(() => createNostrBootstrapEvent(secretKey, peerId, ['/dns4/relay.example.test/tcp/443/wss/p2p/12D3KooWJK5aG5cD9XQk3x8k4Y3h6dQ7bPq9uM8vJ2eR1sT'], now))
assert.throws(() => createNostrBootstrapEvent(secretKey, peerId, [`/dns4/relay.example.test/p2p/${peerId}/tcp/443/wss/p2p/${peerId}`], now))

assert.equal(normalizeNostrRelayUrl('wss://relay.example.test/'), 'wss://relay.example.test')
assert.equal(normalizeNostrRelayUrl('ws://relay.example.test'), undefined)
assert.equal(normalizeNostrRelayUrl('ws://127.0.0.1:7777'), 'ws://127.0.0.1:7777')
assert.equal(normalizeNostrRelayUrl('wss://user:pass@relay.example.test'), undefined)
assert.deepEqual(nostrSecretKeyFromString(Buffer.from(secretKey).toString('hex')), secretKey)
assert.deepEqual(nostrSecretKeyFromString(nsecEncode(secretKey)), secretKey)
assert.deepEqual(normalizeNostrBootstrapConfig({ relayUrls: ['wss://relay.example.test', 'ws://remote.test'] }), {
  relayUrls: ['wss://relay.example.test'],
})
assert.deepEqual(await discoverNostrBootstrapAddrs({ relayUrls: [] }), [])

const configDirectory = await mkdtemp(join(tmpdir(), 'nostr-bootstrap-config-'))
try {
  const keyPath = join(configDirectory, 'publisher-key')
  const firstKey = await loadOrCreateNostrBootstrapSecretKey(keyPath)
  const secondKey = await loadOrCreateNostrBootstrapSecretKey(keyPath)
  assert.equal(firstKey.created, true)
  assert.equal(secondKey.created, false)
  assert.deepEqual(secondKey.secretKey, firstKey.secretKey)
  assert.equal((await stat(keyPath)).mode & 0o777, 0o600)

  const outputPath = join(configDirectory, 'bootstrap-config.json')
  const publicNostrConfig = { relayUrls: ['wss://relay.example.test'] }
  const writtenAddrs = await writeBrowserBootstrapConfig({
    outputPath,
    publicDomain: 'bootstrap.example.test',
    peerId,
    relayEnabled: true,
    secureWebSocket: true,
    nostrBootstrap: publicNostrConfig,
  })
  const browserConfig = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>
  assert.equal(writtenAddrs.length, 1)
  assert.deepEqual(browserConfig.nostrBootstrap, publicNostrConfig)
  assert(!JSON.stringify(browserConfig).includes(Buffer.from(secretKey).toString('hex')))
} finally {
  await rm(configDirectory, { recursive: true, force: true })
}

useWebSocketImplementation(WebSocket)
const relay = new WebSocketServer({ host: '127.0.0.1', port: 0 })
await new Promise<void>((resolve) => relay.on('listening', resolve))
const relayAddress = relay.address()
assert(typeof relayAddress === 'object' && relayAddress)
const relayEvents = new Map<string, ReturnType<typeof createNostrBootstrapEvent>>()
relay.on('connection', (socket) => {
  socket.on('message', (buffer) => {
    const message = JSON.parse(buffer.toString()) as [string, string, ...unknown[]]
    if (message[0] === 'EVENT') {
      const relayEvent = message[1] as unknown as ReturnType<typeof createNostrBootstrapEvent>
      relayEvents.set(relayEvent.id, relayEvent)
      socket.send(JSON.stringify(['OK', relayEvent.id, true, 'accepted']))
    } else if (message[0] === 'REQ') {
      const subscriptionId = message[1]
      for (const relayEvent of relayEvents.values()) socket.send(JSON.stringify(['EVENT', subscriptionId, relayEvent]))
      socket.send(JSON.stringify(['EOSE', subscriptionId]))
    }
  })
})
try {
  const relayUrl = `ws://127.0.0.1:${relayAddress.port}`
  await publishNostrBootstrapAnnouncement({ relayUrls: [relayUrl], secretKey, peerId, bootstrapAddrs: [bootstrapAddr] })
  assert.deepEqual(await discoverNostrBootstrapAddrs({ relayUrls: [relayUrl] }), [bootstrapAddr])

  relayEvents.clear()
  const nodePeer = await createP2PNode(0, { enableMdns: false, enableDht: false, host: '127.0.0.1' })
  let browserPeer: Awaited<ReturnType<typeof createBrowserP2PNode>> | undefined
  try {
    await nodePeer.start()
    const nodeAddress = nodePeer.getMultiaddrs().find((address: { toString(): string }) => address.toString().includes('/ws'))?.toString()
    assert(nodeAddress, 'local libp2p node must expose a WebSocket address')
    const actualPeerId = nodePeer.peerId.toString()
    await publishNostrBootstrapAnnouncement({ relayUrls: [relayUrl], secretKey, peerId: actualPeerId, bootstrapAddrs: [nodeAddress] })
    const discoveredNodeAddresses = await discoverNostrBootstrapAddrs({ relayUrls: [relayUrl] })
    assert.deepEqual(discoveredNodeAddresses, [nodeAddress])

    browserPeer = await createBrowserP2PNode({ bootstrapAddrs: discoveredNodeAddresses })
    await browserPeer.start()
    await browserPeer.dial(multiaddr(discoveredNodeAddresses[0]))
    assert(browserPeer.getConnections(nodePeer.peerId).length > 0, 'browser P2P node must dial the address discovered through Nostr')
  } finally {
    await browserPeer?.stop()
    await nodePeer.stop()
  }
} finally {
  await new Promise<void>((resolve) => relay.close(() => resolve()))
}

console.log('Nostr event validation, localhost relay publish/discovery, and browser-to-node bootstrap dial passed')
