/**
 * @packageDocumentation P2P networking utilities for configuring and constructing a
 * libp2p node with the transports and services used by the XMPP runtime.
 */

import { createLibp2p, type ConnectionManagerInit } from 'libp2p'
import { FaultTolerance, type PrivateKey } from '@libp2p/interface'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { mdns } from '@libp2p/mdns'
import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { createBaseLibp2pServices } from './p2p-base.js'

/**
 * Startup options for the shared libp2p node factory.
 */
export interface CreateP2PNodeOptions {
  enableMdns?: boolean
  enableDht?: boolean
  enableRelay?: boolean
  relayMaxReservations?: number
  relayPublicAddress?: string
  enableWebRTC?: boolean
  host?: string
  maxConnections?: number
  maxParallelDials?: number
  privateKey?: PrivateKey
  bootstrapAddrs?: string[]
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

  if (options.bootstrapAddrs?.length) {
    peerDiscovery.push(bootstrap({ list: options.bootstrapAddrs }))
  }

  if (options.enableMdns !== false) {
    peerDiscovery.push(
      mdns({
        interval: 2000
      })
    )
  }

  const services = createBaseLibp2pServices({ enableDht: options.enableDht })

  if (options.enableRelay) {
    services.relay = circuitRelayServer({
      reservations: {
        maxReservations: Math.max(1, Math.min(256, options.relayMaxReservations ?? 32)),
        applyDefaultLimit: true,
        reservationTtl: 2 * 60 * 60_000,
        defaultDurationLimit: 15 * 60_000,
        defaultDataLimit: 256n * 1024n * 1024n,
      },
    })
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
  const relayListenAddresses = options.enableWebRTC
    ? [...new Set((options.bootstrapAddrs ?? []).map((address) =>
      address.includes('/p2p-circuit') ? address : `${address}/p2p-circuit`
    ))]
    : []

  if (options.enableWebRTC) {
    transports.push(webRTC(), circuitRelayTransport())
  }

  const connectionManager: ConnectionManagerInit = {
    maxConnections: options.maxConnections ?? 300,
    maxParallelDials: options.maxParallelDials ?? 50
  }

  const node = await createLibp2p({
    privateKey: options.privateKey,
    addresses: {
      // Configured bootstrap peers may provide circuit relay reservations.
      // Treat failed reservations as optional so an ordinary bootstrap node
      // does not prevent direct TCP/WebSocket startup.
      listen: [...listenAddresses, ...relayListenAddresses],
      ...(options.enableRelay && options.relayPublicAddress ? { announce: [options.relayPublicAddress] } : {}),
    },
    ...(relayListenAddresses.length > 0 ? { transportManager: { faultTolerance: FaultTolerance.NO_FATAL } } : {}),
    transports,
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    connectionManager,
    services
  })

  return node
}
