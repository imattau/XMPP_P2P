import { useEffect, useRef, useState } from 'react'
import { getBrowserXmppBridge } from './runtime'

export interface ConnectionState {
  connected: boolean
  connectedPeers: number
}

export function useConnectionBridge(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ connected: false, connectedPeers: 0 })
  const peerSetRef = useRef(new Set<string>())

  useEffect(() => {
    const runtime = getBrowserXmppBridge()

    // Initial scan: pick up any pre-existing connections before the hook mounted.
    if (runtime?.getConnectedPeers) {
      const existing = runtime.getConnectedPeers()
      for (const peerId of existing) {
        peerSetRef.current.add(peerId)
      }
      if (existing.length > 0) {
        setState({ connected: true, connectedPeers: existing.length })
      }
    }

    if (!runtime?.onConnectionChange) return

    const unsub = runtime.onConnectionChange((peerId: string, connected: boolean) => {
      const peerSet = peerSetRef.current
      if (connected) {
        peerSet.add(peerId)
      } else {
        peerSet.delete(peerId)
      }
      setState({
        connected: peerSet.size > 0,
        connectedPeers: peerSet.size
      })
    })

    return unsub
  }, [])

  return state
}
