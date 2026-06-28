/**
 * @packageDocumentation P2P networking utilities for configuring and constructing a
 * libp2p node with the transports and services used by the XMPP runtime.
 */

import { createLibp2p, type ConnectionManagerInit } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { mdns } from '@libp2p/mdns'
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { createBaseLibp2pServices } from './p2p-base.js'

/**
 * Startup options for the shared libp2p node factory.
 */
export interface CreateP2PNodeOptions {
  enableMdns?: boolean
  enableDht?: boolean
  enableRelay?: boolean
  enableWebRTC?: boolean
  host?: string
  maxConnections?: number
  maxParallelDials?: number
}

/**
 * Creates a libp2p node configured for the XMPP-over-P2P runtime.
 *
 * @param port - Preferred TCP listen port for the node.
 * @param options - Additional node configuration such as DHT and mDNS toggles.
 * @returns A promise resolving to a started libp2p node.
 */
export async function createP2PNode(port?: number, options: CreateP2PNodeOptions = {}): Promise<any> {
  const listenHost = options.host || '0.0.0.0'
  const peerDiscovery = []

  if (options.enableMdns !== false) {
    peerDiscovery.push(
      mdns({
        interval: 2000
      })
    )
  }

  const services = createBaseLibp2pServices({ enableDht: options.enableDht })

  if (options.enableRelay) {
    services.relay = circuitRelayServer({ reservations: { maxReservations: 256 } })
  }

  const listenAddresses: string[] = []
  if (listenHost === '0.0.0.0') {
    listenAddresses.push(port ? `/ip4/0.0.0.0/tcp/${port}` : `/ip4/0.0.0.0/tcp/0`)
    listenAddresses.push(port ? `/ip6/::/tcp/${port}` : `/ip6/::/tcp/0`)
    listenAddresses.push(port ? `/ip4/0.0.0.0/tcp/${port + 1000}/ws` : `/ip4/0.0.0.0/tcp/0/ws`)
    listenAddresses.push(port ? `/ip6/::/tcp/${port + 1000}/ws` : `/ip6/::/tcp/0/ws`)
  } else if (listenHost === '127.0.0.1') {
    listenAddresses.push(port ? `/ip4/127.0.0.1/tcp/${port}` : `/ip4/127.0.0.1/tcp/0`)
    listenAddresses.push(port ? `/ip6/::1/tcp/${port}` : `/ip6/::1/tcp/0`)
    listenAddresses.push(port ? `/ip4/127.0.0.1/tcp/${port + 1000}/ws` : `/ip4/127.0.0.1/tcp/0/ws`)
    listenAddresses.push(port ? `/ip6/::1/tcp/${port + 1000}/ws` : `/ip6/::1/tcp/0/ws`)
  } else {
    if (listenHost.includes(':')) {
      listenAddresses.push(port ? `/ip6/${listenHost}/tcp/${port}` : `/ip6/${listenHost}/tcp/0`)
      listenAddresses.push(port ? `/ip6/${listenHost}/tcp/${port + 1000}/ws` : `/ip6/${listenHost}/tcp/0/ws`)
    } else {
      listenAddresses.push(port ? `/ip4/${listenHost}/tcp/${port}` : `/ip4/${listenHost}/tcp/0`)
      listenAddresses.push(port ? `/ip4/${listenHost}/tcp/${port + 1000}/ws` : `/ip4/${listenHost}/tcp/0/ws`)
    }
  }

  const transports: any[] = [tcp(), webSockets()]

  if (options.enableWebRTC) {
    transports.push(webRTC(), circuitRelayTransport())
  }

  const connectionManager: ConnectionManagerInit = {
    maxConnections: options.maxConnections ?? 300,
    maxParallelDials: options.maxParallelDials ?? 50
  }

  const node = await createLibp2p({
    addresses: {
      listen: listenAddresses
    },
    transports,
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    connectionManager,
    services
  })

  return node
}
