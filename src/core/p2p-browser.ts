/**
 * @packageDocumentation Browser-targeted libp2p node factory. Uses WebSockets and WebRTC
 * in browsers, with an Android native TCP dial transport added by the Capacitor plugin.
 * It relies on KadDHT bootstrapped from known peer multiaddresses for discovery.
 */

import { createLibp2p, type Libp2p } from 'libp2p'
import { FaultTolerance, type PeerDiscovery, type PrivateKey } from '@libp2p/interface'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { isPrivate } from '@libp2p/utils'
import { TCP as TCPMatcher, WebSockets } from '@multiformats/multiaddr-matcher'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { createBaseLibp2pServices } from './p2p-base.js'
import { nativeTcpAndroid } from './native-tcp-transport.js'
import { nativeMdnsAndroid } from './native-mdns.js'

export interface CreateBrowserP2PNodeOptions {
  bootstrapAddrs: string[]
  privateKey?: PrivateKey
  /** Mobile WebViews should run KadDHT as a client, not a routing server. */
  dhtClientMode?: boolean
}

/**
 * Creates a browser-friendly libp2p node configured for bootstrap-based peer discovery.
 *
 * @param options - Bootstrap multiaddrs used to join the network.
 * @returns A started libp2p node.
 */
export async function createBrowserP2PNode(options: CreateBrowserP2PNodeOptions): Promise<Libp2p> {
  if (options.bootstrapAddrs.some((address) => /\/http-path\//.test(address))) {
    throw new Error('Browser relay addresses must use the root WebSocket endpoint; URL paths cannot be used for WebRTC peer routes')
  }

  const nativeTcpTransport = nativeTcpAndroid()
  const bootstrapAddrs = options.bootstrapAddrs.filter((address) =>
    address.includes('/ws/') || address.includes('/wss/') || Boolean(nativeTcpTransport && /\/tcp\//.test(address))
  )

  const services = createBaseLibp2pServices({ enableDht: true, dhtClientMode: options.dhtClientMode === true })

  const peerDiscovery: Array<(components: any) => PeerDiscovery> = []
  if (bootstrapAddrs.length > 0) peerDiscovery.push(bootstrap({ list: bootstrapAddrs }))
  const androidMdns = nativeMdnsAndroid()
  if (androidMdns) peerDiscovery.push(androidMdns)

  const node = await createLibp2p({
    privateKey: options.privateKey,
    // A configured browser relay should provide a routable circuit address.
    // Some bootstrap peers are ordinary WebSocket nodes, though, so their
    // failed HOP reservation must not prevent direct WebSocket startup.
    addresses: {
      // Android can accept direct LAN TCP connections. Browser builds do not
      // have a native TCP listener, so they only listen through configured relays.
      listen: [
        ...(nativeTcpTransport ? ['/ip4/0.0.0.0/tcp/0'] : []),
        ...bootstrapAddrs.map((address) =>
          address.includes('/p2p-circuit') ? address : `${address}/p2p-circuit`
        )
      ]
    },
    transportManager: { faultTolerance: FaultTolerance.NO_FATAL },
    transports: [
      nativeTcpTransport,
      webSockets(),
      webRTC(),
      circuitRelayTransport()
    ].filter(Boolean) as any[],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    // libp2p's browser default rejects all private addresses and insecure
    // WebSockets. Explicitly configured bootstrap relays are trusted by the
    // operator, and their circuit addresses must remain dialable for peers
    // behind browser NATs. Keep the default restrictions for other addresses.
    connectionGater: {
      denyDialMultiaddr: (address) => {
        const value = address.toString()
        if (bootstrapAddrs.some((bootstrapAddr) =>
          value === bootstrapAddr || value.startsWith(`${bootstrapAddr}/p2p-circuit`)
        )) return false
        if (nativeTcpTransport && TCPMatcher.exactMatch(address) && isPrivate(address) === true) return false
        return WebSockets.matches(address) || isPrivate(address) === true
      }
    },
    services
  })

  return node
}
