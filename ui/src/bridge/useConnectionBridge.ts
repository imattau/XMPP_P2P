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
    let unsubscribe: (() => void) | undefined
    let poll: ReturnType<typeof setInterval> | undefined

    const attach = () => {
      const runtime = getBrowserXmppBridge()
      if (!runtime?.onConnectionChange || unsubscribe) return

      // Initial scan: pick up connections established before this hook mounted.
      for (const peerId of runtime.getConnectedPeers?.() ?? []) {
        peerSetRef.current.add(peerId)
      }
      setState({
        connected: peerSetRef.current.size > 0,
        connectedPeers: peerSetRef.current.size
      })

      unsubscribe = runtime.onConnectionChange((peerId: string, connected: boolean) => {
        const peerSet = peerSetRef.current
        if (connected) peerSet.add(peerId)
        else peerSet.delete(peerId)
        setState({ connected: peerSet.size > 0, connectedPeers: peerSet.size })
      })
      if (poll) clearInterval(poll)
    }

    attach()
    if (!unsubscribe) poll = setInterval(attach, 100)

    return () => {
      if (poll) clearInterval(poll)
      unsubscribe?.()
    }
  }, [])

  return state
}
