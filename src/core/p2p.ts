/**
 * @fileoverview P2P networking utilities for configuring and constructing a
 * libp2p node with the transports and services used by the XMPP runtime.
 */

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { mdns } from '@libp2p/mdns'
import { identify } from '@libp2p/identify'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { StrictSign, gossipsub } from '@libp2p/gossipsub'
import { ping } from '@libp2p/ping'
import { multiaddr } from '@multiformats/multiaddr'

/**
 * Startup options for the shared libp2p node factory.
 */
export interface CreateP2PNodeOptions {
  enableMdns?: boolean
  enableDht?: boolean
  host?: string
}

// Older multiaddr builds used by libp2p can omit `toOptions`, but GossipSub
// expects it when scoring remote peers.
const dummyMa = multiaddr('/ip4/127.0.0.1/tcp/0')
const MultiaddrProto = Object.getPrototypeOf(dummyMa)
if (!MultiaddrProto.toOptions) {
  MultiaddrProto.toOptions = function() {
    const components = this.getComponents()
    const ip = components.find((c: any) => c.name === 'ip4' || c.name === 'ip6')?.value || '127.0.0.1'
    const port = parseInt(components.find((c: any) => c.name === 'tcp' || c.name === 'udp')?.value || '0', 10)
    return {
      host: ip,
      port: port,
      family: ip.includes(':') ? 'IPv6' : 'IPv4'
    }
  }
}

interface BaseLibp2pConfigOptions {
  enableDht?: boolean
}

/**
 * Builds the shared libp2p services map.
 *
 * @param options - Optional service toggles such as DHT enablement.
 * @returns A plain object of libp2p service factories.
 */
export function createBaseLibp2pServices(options: BaseLibp2pConfigOptions = {}): Record<string, any> {
  const services: Record<string, any> = {
    identify: identify(),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      globalSignaturePolicy: StrictSign,
      scoreParams: {},
      scoreThresholds: {},
      emitSelf: false,
      maxInboundDataLength: 16 * 1024,
      messageProcessingConcurrency: 4
    })
  }

  if (options.enableDht) {
    services.dht = kadDHT({
      clientMode: false,
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper,
      allowQueryWithZeroPeers: true,
      validators: {
        xmpp: async (key: Uint8Array, value: Uint8Array) => {
          // Accept all xmpp custom records
        }
      },
      selectors: {
        xmpp: (key: Uint8Array, records: any[]) => {
          return 0
        }
      }
    })
    services.ping = ping()
  }

  return services
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

  const node = await createLibp2p({
    addresses: {
      listen: listenAddresses
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services
  })

  return node
}
