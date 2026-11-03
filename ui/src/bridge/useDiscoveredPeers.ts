import { useEffect, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'

export interface DiscoveredPeer {
  peerId: string
  jid: string
  nickname?: string
}

/**
 * Peers are only considered discovered here after they open an app-level
 * XMPP stream. Bootstrap/DHT peers alone are transport infrastructure and
 * are not necessarily people using the app.
 */
export function useDiscoveredPeers(): DiscoveredPeer[] {
  const runtime = useBrowserXmppBridge()
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([])
  const [nicknames, setNicknames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!runtime) {
      setConnectedPeerIds([])
      setNicknames({})
      return
    }

    setConnectedPeerIds(runtime.getConnectedPeers())
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
    }
  }, [runtime])

  return connectedPeerIds.map((peerId) => ({
    peerId,
    jid: `${peerId}@p2p`,
    nickname: nicknames[peerId],
  }))
}
