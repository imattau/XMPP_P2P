import { identify } from '@libp2p/identify'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { StrictSign, gossipsub } from '@libp2p/gossipsub'
import { ping } from '@libp2p/ping'
import { multiaddr } from '@multiformats/multiaddr'

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

export interface BaseLibp2pConfigOptions {
  enableDht?: boolean
}

export function createBaseLibp2pServices(options: BaseLibp2pConfigOptions = {}): Record<string, any> {
  const services: Record<string, any> = {
    identify: identify(),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      globalSignaturePolicy: StrictSign,
      emitSelf: false,
      maxInboundDataLength: 64 * 1024,
      messageProcessingConcurrency: 8,
      scoreParams: {
        topics: {},
        topicScoreCap: 32,
        IPColocationFactorThreshold: 10,
        IPColocationFactorWeight: -10,
        behaviourPenaltyWeight: -10,
        behaviourPenaltyThreshold: 6,
        behaviourPenaltyDecay: 0.5,
        decayInterval: 1000,
        decayToZero: 0.01,
        retainScore: 3600,
        appSpecificScore: () => 0,
        appSpecificWeight: 0
      },
      scoreThresholds: {
        gossipThreshold: -20,
        publishThreshold: -40,
        graylistThreshold: -80,
        acceptPXThreshold: 10
      }
    })
  }

  if (options.enableDht) {
    services.dht = kadDHT({
      clientMode: false,
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper,
      allowQueryWithZeroPeers: true,
      validators: {
        xmpp: async (_key: Uint8Array, _value: Uint8Array) => { }
      },
      selectors: {
        xmpp: (_key: Uint8Array, _records: any[]) => 0
      }
    })
    services.ping = ping()
  }

  return services
}
