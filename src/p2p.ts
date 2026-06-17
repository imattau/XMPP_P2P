import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { yamux } from '@libp2p/yamux'
import { mdns } from '@libp2p/mdns'
import { identify } from '@libp2p/identify'
import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { multiaddr } from '@multiformats/multiaddr'

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

export async function createP2PNode(port?: number): Promise<any> {
  const node = await createLibp2p({
    addresses: {
      listen: [
        port ? `/ip4/0.0.0.0/tcp/${port}` : '/ip4/0.0.0.0/tcp/0'
      ]
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      mdns({
        interval: 2000
      })
    ],
    services: {
      identify: identify(),
      pubsub: (components: any) => {
        const gs = new GossipSub({
          allowPublishToZeroPeers: true,
          globalSignaturePolicy: 'StrictNoSign' // Disable message signing to bypass missing privateKey checks
        }) as any
        
        // Retrieve the raw unproxied components object to bypass capability sandbox checks
        const rawComponents = components.components || components
        
        // Define all standard get[Service] methods on the raw components target to provide full compatibility with Gossipsub
        const servicesList = [
          'PeerId', 'Registrar', 'ConnectionManager', 'PeerStore', 
          'Upgrader', 'Metrics', 'AddressManager', 'DHT', 'PubSub'
        ]
        for (const s of servicesList) {
          const propName = s === 'PeerId' ? 'peerId' : s.charAt(0).toLowerCase() + s.slice(1)
          rawComponents[`get${s}`] = () => {
            return rawComponents[propName]
          }
        }
        
        gs.init(rawComponents)

        // Intercept onPeerConnected to wrap the connection argument if its stat property is undefined
        const origOnPeerConnected = gs.onPeerConnected.bind(gs)
        gs.onPeerConnected = (peerId: any, conn: any) => {
          if (conn && !conn.stat) {
            conn.stat = { direction: conn.direction || 'outbound' }
          }
          return origOnPeerConnected(peerId, conn)
        }

        return gs
      }
    }
  })

  // Intercept node.dialProtocol to add .stat and source/sink properties to returned stream
  const origDialProtocol = node.dialProtocol.bind(node)
  node.dialProtocol = async (peer: any, protocols: any, options: any) => {
    const stream = await origDialProtocol(peer, protocols, options) as any
    if (stream) {
      if (!stream.stat) {
        stream.stat = { protocol: stream.protocol }
      }
      if (!stream.source) {
        stream.source = stream[Symbol.asyncIterator]()
      }
      if (!stream.sink) {
        stream.sink = async (source: any) => {
          for await (const chunk of source) {
            await stream.send(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
          }
        }
      }
      // Ensure it-pipe's isDuplex(stream) check returns true
      // isDuplex requires: stream != null && typeof stream.sink === 'function' && isIterable(stream.source)
      // where isIterable requires: obj[Symbol.asyncIterator] === 'function' or similar
      if (stream.source && !stream.source[Symbol.asyncIterator]) {
        stream.source[Symbol.asyncIterator] = function() { return this; };
      }
    }
    return stream
  }

  // Intercept registrar.handle to add .stat and source/sink properties to inbound streams
  const registrar = (node as any).components.registrar
  const origHandle = registrar.handle.bind(registrar)
  registrar.handle = async (protocol: string, handler: any, options: any) => {
    return origHandle(protocol, async (stream: any, connection: any) => {
      if (stream) {
        if (!stream.stat) {
          stream.stat = { protocol: stream.protocol }
        }
        if (!stream.source) {
          stream.source = stream[Symbol.asyncIterator]()
        }
        if (!stream.sink) {
          stream.sink = async (source: any) => {
            for await (const chunk of source) {
              await stream.send(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
            }
          }
        }
        // Ensure it-pipe's isDuplex(stream) check returns true
        if (stream.source && !stream.source[Symbol.asyncIterator]) {
          stream.source[Symbol.asyncIterator] = function() { return this; };
        }
      }
      return handler(stream, connection)
    }, options)
  }

  return node
}
