import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { mdns } from '@libp2p/mdns'
import { identify } from '@libp2p/identify'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { StrictSign, gossipsub } from '@libp2p/gossipsub'
import { ping } from '@libp2p/ping'
import { multiaddr } from '@multiformats/multiaddr'

export interface CreateP2PNodeOptions {
  enableMdns?: boolean
  enableDht?: boolean
}

// Polyfill Multiaddr.prototype.toOptions since older @multiformats/multiaddr versions used in libp2p
// don't have it, but GossipSub expects it on remoteAddr.
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

export async function createP2PNode(port?: number, options: CreateP2PNodeOptions = {}): Promise<any> {
  const listenHost = '127.0.0.1'
  const peerDiscovery = []

  if (options.enableMdns !== false) {
    peerDiscovery.push(
      mdns({
        interval: 2000
      })
    )
  }

  const services: Record<string, any> = {
    identify: identify()
  }

  if (options.enableDht) {
    services.dht = kadDHT({
      clientMode: false,
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper
    })
    services.ping = ping()
  }

  const node = await createLibp2p({
    addresses: {
      listen: [
        port ? `/ip4/${listenHost}/tcp/${port}` : `/ip4/${listenHost}/tcp/0`
      ]
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      ...services,
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
  })

  return node
}
