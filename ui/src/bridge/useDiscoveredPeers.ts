import { useEffect, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'

export interface DiscoveredPeer {
  peerId: string
  jid: string
  nickname?: string
  address?: string
}

/**
 * Includes local peers found through mDNS and app-level connections. Bootstrap
 * and DHT peers are omitted because they are network infrastructure.
 */
export function useDiscoveredPeers(): DiscoveredPeer[] {
  const runtime = useBrowserXmppBridge()
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([])
  const [discoveredPeerAddresses, setDiscoveredPeerAddresses] = useState<Record<string, string>>({})
  const [nicknames, setNicknames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!runtime) {
      setConnectedPeerIds([])
      setDiscoveredPeerAddresses({})
      setNicknames({})
      return
    }

    setConnectedPeerIds(runtime.getConnectedPeers())
    setDiscoveredPeerAddresses(Object.fromEntries((runtime.getDiscoveredPeers?.() ?? []).map((peer) => [peer.peerId, peer.address])))
    const unsubscribeDiscovery = runtime.onDiscoveredPeer?.((peer) => {
      setDiscoveredPeerAddresses((current) => ({ ...current, [peer.peerId]: peer.address }))
    })
    const unsubscribeConnection = runtime.onConnectionChange((peerId, connected) => {
      setConnectedPeerIds((current) => connected
        ? current.includes(peerId) ? current : [...current, peerId]
        : current.filter((id) => id !== peerId))
    })
    const unsubscribePresence = runtime.onPresence((presence) => {
      const jid = presence.from.split('/')[0]
      if (!jid.toLowerCase().endsWith('@p2p') || !presence.nickname?.trim()) return
      const peerId = jid.slice(0, -'@p2p'.length)
      setNicknames((current) => ({ ...current, [peerId]: presence.nickname!.trim() }))
    })

    return () => {
      unsubscribeConnection()
      unsubscribePresence()
      unsubscribeDiscovery?.()
    }
  }, [runtime])

  const peerIds = [...new Set([...Object.keys(discoveredPeerAddresses), ...connectedPeerIds])]
  return peerIds.map((peerId) => ({
    peerId,
    jid: `${peerId}@p2p`,
    nickname: nicknames[peerId],
    address: discoveredPeerAddresses[peerId],
  }))
}
