/**
 * @packageDocumentation Browser-targeted libp2p node factory. Uses websockets and WebRTC
 * for transport (no tcp, no mdns — neither is available in a browser sandbox) and
 * relies on KadDHT, bootstrapped from at least one known Node peer's /ws multiaddr,
 * for peer discovery.
 */

import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { createBaseLibp2pServices } from './p2p.js'

export interface CreateBrowserP2PNodeOptions {
  bootstrapAddrs: string[]
}

/**
 * Creates a browser-friendly libp2p node configured for bootstrap-based peer discovery.
 *
 * @param options - Bootstrap multiaddrs used to join the network.
 * @returns A started libp2p node.
 */
export async function createBrowserP2PNode(options: CreateBrowserP2PNodeOptions): Promise<Libp2p> {
  const services = createBaseLibp2pServices({ enableDht: true })

  const node = await createLibp2p({
    transports: [
      webSockets(),
      webRTC(),
      circuitRelayTransport()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      bootstrap({
        list: options.bootstrapAddrs
      })
    ],
    services
  })

  return node
}
