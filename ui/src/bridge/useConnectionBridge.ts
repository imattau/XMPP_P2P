import { useEffect, useState } from 'react'
import { getBrowserXmppBridge } from './runtime'

export interface ConnectionState {
  connected: boolean
  connectedPeers: number
}

export function useConnectionBridge(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ connected: false, connectedPeers: 0 })

  useEffect(() => {
    const runtime = getBrowserXmppBridge()
    if (!runtime?.onConnectionChange) return

    const unsub = runtime.onConnectionChange((_peerId: string, connected: boolean) => {
      setState((prev) => ({
        connected: connected || prev.connected,
        connectedPeers: prev.connectedPeers + (connected ? 1 : -1)
      }))
    })

    return unsub
  }, [])

  return state
}
