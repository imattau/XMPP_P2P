import { mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createP2PNode } from './core/p2p.js'
import { writeBrowserBootstrapConfig } from './core/browser-bootstrap-config.js'
import { NodeSqliteStorage } from './core/storage/node-sqlite-storage.js'
import { XmppNode } from './core/xmpp-node.js'
import { startTui } from './tui/index.js'
import { loadOrCreateNostrBootstrapSecretKey } from './core/node-nostr-bootstrap-key.js'
import {
  DEFAULT_NOSTR_RELAY_URLS,
  normalizeNostrRelayUrls,
  nostrSecretKeyFromString,
  startNostrBootstrapPublisher,
} from './core/nostr-bootstrap.js'

const valueFor = (args: string[], name: string) => {
  const index = args.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (index < 0) return undefined
  const arg = args[index]
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[index + 1]
}

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm start -- [--port <port>] [--host <host>] [--sqlite-path <path>]')
    return
  }
  if (args.includes('--version') || args.includes('-v')) {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    console.log(packageJson.version)
    return
  }

  const portValue = valueFor(args, '--port')
  const port = portValue === undefined ? undefined : Number(portValue)
  if (portValue !== undefined && (port === undefined || !Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error(`Invalid port value: ${portValue}`)
  }

  const sqlitePath = valueFor(args, '--sqlite-path') ?? join(process.cwd(), 'data', 'state.sqlite')
  await mkdir(dirname(sqlitePath), { recursive: true })

  const libp2p = await createP2PNode(port, {
    host: valueFor(args, '--host'),
    enableWebRTC: args.includes('--webrtc'),
    enableRelay: args.includes('--relay')
  })
  const xmppNode = new XmppNode(libp2p, new NodeSqliteStorage(sqlitePath))
  await xmppNode.ready

  const bootstrapOutput = process.env.XMPP_P2P_BOOTSTRAP_OUTPUT
  if (bootstrapOutput) {
    try {
      const nostrRelayUrls = normalizeNostrRelayUrls(
        process.env.XMPP_P2P_NOSTR_RELAYS ?? [...DEFAULT_NOSTR_RELAY_URLS],
      )
      let nostrSecretKey: Uint8Array | undefined
      if (process.env.XMPP_P2P_NOSTR_SECRET_KEY) {
        nostrSecretKey = nostrSecretKeyFromString(process.env.XMPP_P2P_NOSTR_SECRET_KEY)
      } else if (nostrRelayUrls.length > 0) {
        const keyPath = process.env.XMPP_P2P_NOSTR_KEY_PATH?.trim() || join(dirname(sqlitePath), 'nostr-bootstrap-key')
        const persistedKey = await loadOrCreateNostrBootstrapSecretKey(keyPath)
        nostrSecretKey = persistedKey.secretKey
        if (persistedKey.created) console.log(`Generated Nostr bootstrap publisher key at ${keyPath}`)
      }
      const nostrBootstrap = nostrRelayUrls.length ? { relayUrls: nostrRelayUrls } : undefined
      const bootstrapAddrs = await writeBrowserBootstrapConfig({
        outputPath: bootstrapOutput,
        publicDomain: process.env.XMPP_P2P_BOOTSTRAP_DOMAIN,
        peerId: libp2p.peerId.toString(),
        relayEnabled: args.includes('--relay'),
        secureWebSocket: process.env.XMPP_P2P_BOOTSTRAP_WSS === 'true',
        nostrBootstrap,
      })
      if (bootstrapAddrs.length > 0) console.log(`Browser bootstrap address: ${bootstrapAddrs[0]}`)
      if (bootstrapAddrs.length && nostrRelayUrls.length && nostrSecretKey) {
        startNostrBootstrapPublisher({
          relayUrls: nostrRelayUrls,
          secretKey: nostrSecretKey,
          peerId: libp2p.peerId.toString(),
          bootstrapAddrs,
          onPublished: () => console.log('Published signed Nostr bootstrap announcement'),
          onError: (error) => console.error(`Could not publish Nostr bootstrap announcement: ${error.message}`),
        })
      }
    } catch (error) {
      console.error(`Could not write browser bootstrap configuration: ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(`Peer ID: ${libp2p.peerId.toString()}`)
  console.log(`JID: ${xmppNode.jid}`)
  console.log('Listening addresses:')
  for (const address of libp2p.getMultiaddrs()) console.log(`  ${address.toString()}`)
  await startTui(libp2p, xmppNode)
}

main().catch((error) => {
  console.error(`Fatal startup error: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
