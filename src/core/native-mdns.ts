import { registerPlugin, type Plugin, type PluginListenerHandle } from '@capacitor/core'
import { peerDiscoverySymbol, serviceCapabilities, type PeerDiscovery } from '@libp2p/interface'
import { peerIdFromString } from '@libp2p/peer-id'
import { CODE_P2P, multiaddr } from '@multiformats/multiaddr'
import { isAndroidNative } from './native-platform.js'

interface NativeMdnsPlugin extends Plugin {
  startDiscovery(): Promise<void>
  setAdvertisedAddresses(options: { multiaddrs: string[] }): Promise<void>
  stopDiscovery(): Promise<void>
  addListener(eventName: 'peerDiscovered', listener: (event: { dnsaddr?: string }) => void): Promise<PluginListenerHandle>
}

const nativeMdns = registerPlugin<NativeMdnsPlugin>('NativeMdns')

class AndroidMdnsPeerDiscovery extends EventTarget {
  [peerDiscoverySymbol] = this;
  [serviceCapabilities] = ['@libp2p/peer-discovery'];
  [Symbol.toStringTag] = '@nexus/android-mdns';

  private listener?: PluginListenerHandle
  private addressListener?: () => void

  constructor(private readonly components: any) {
    super()
  }

  async start(): Promise<void> {
    this.listener = await nativeMdns.addListener('peerDiscovered', ({ dnsaddr }) => {
      if (!dnsaddr?.startsWith('/')) return
      try {
        const address = multiaddr(dnsaddr)
        const peerId = address.getComponents().filter((component) => component.code === CODE_P2P).at(-1)?.value
        if (!peerId) return
        this.dispatchEvent(new CustomEvent('peer', {
          detail: { id: peerIdFromString(peerId), multiaddrs: [address.decapsulateCode(CODE_P2P)] },
        }))
      } catch {
        // Ignore malformed or incompatible mDNS records from the local network.
      }
    })
    try {
      this.addressListener = () => { void this.updateAdvertisements() }
      this.components.events.addEventListener('self:peer:update', this.addressListener)
      await nativeMdns.startDiscovery()
      await this.updateAdvertisements()
    } catch (error) {
      if (this.addressListener) this.components.events.removeEventListener('self:peer:update', this.addressListener)
      this.addressListener = undefined
      await this.listener.remove()
      this.listener = undefined
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.addressListener) this.components.events.removeEventListener('self:peer:update', this.addressListener)
    this.addressListener = undefined
    await this.listener?.remove()
    this.listener = undefined
    await nativeMdns.setAdvertisedAddresses({ multiaddrs: [] })
    await nativeMdns.stopDiscovery()
  }

  private async updateAdvertisements(): Promise<void> {
    const multiaddrs = this.components.addressManager.getAddresses().map((address: { toString(): string }) => address.toString())
    await nativeMdns.setAdvertisedAddresses({ multiaddrs })
  }
}

export function nativeMdnsAndroid(): ((components: any) => PeerDiscovery) | undefined {
  if (!isAndroidNative()) return undefined
  return (components) => new AndroidMdnsPeerDiscovery(components) as unknown as PeerDiscovery
}
