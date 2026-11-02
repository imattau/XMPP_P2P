import { useEffect, useRef, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'

export interface ConnectionState {
  connected: boolean
  connectedPeers: number
  nodeAvailable: boolean
}

export function useConnectionBridge(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ connected: false, connectedPeers: 0, nodeAvailable: false })
  const peerSetRef = useRef(new Set<string>())
  const runtime = useBrowserXmppBridge()

  useEffect(() => {
    peerSetRef.current = new Set(runtime?.getConnectedPeers?.() ?? [])
    const update = () => setState({
      connected: peerSetRef.current.size > 0,
      connectedPeers: peerSetRef.current.size,
      nodeAvailable: !!runtime,
    })
    update()
    if (!runtime?.onConnectionChange) return
    const unsubscribe = runtime.onConnectionChange((peerId: string, connected: boolean) => {
      if (connected) peerSetRef.current.add(peerId)
      else peerSetRef.current.delete(peerId)
      update()
    })
    return () => unsubscribe()
  }, [runtime])

  return state
}
