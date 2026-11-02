import { useEffect, useState } from 'react'
import { getBrowserXmppBridge } from './runtime'

export function useResolvedUploadUrl(url?: string): { url?: string; loading: boolean; retry: () => void } {
  const [state, setState] = useState<{ source?: string; value?: string; loading: boolean }>({ loading: false })
  const [bridgeRevision, setBridgeRevision] = useState(0)
  const [retryRevision, setRetryRevision] = useState(0)
  const current = state.source === url ? state : { loading: Boolean(url) }

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined
    const bridgeReady = () => setBridgeRevision((revision) => revision + 1)
    const uploadAvailable = (event: Event) => {
      const cid = (event as CustomEvent<string>).detail
      if (url?.startsWith('upload://') && cid === url.slice('upload://'.length)) {
        setBridgeRevision((revision) => revision + 1)
      }
    }
    window.addEventListener('xmpp-p2p:bridge-ready', bridgeReady)
    window.addEventListener('xmpp-p2p:upload-available', uploadAvailable)
    setState({ source: url, value: undefined, loading: Boolean(url) })
    if (!url) return () => {
      cancelled = true
      window.removeEventListener('xmpp-p2p:bridge-ready', bridgeReady)
      window.removeEventListener('xmpp-p2p:upload-available', uploadAvailable)
    }
    if (!url.startsWith('upload://')) {
      let validUrl = false
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          setState({ source: url, value: parsed.toString(), loading: false })
          validUrl = true
        }
      } catch { /* invalid media URLs stay unavailable */ }
      if (!validUrl) setState({ source: url, loading: false })
      return () => {
        cancelled = true
        window.removeEventListener('xmpp-p2p:bridge-ready', bridgeReady)
        window.removeEventListener('xmpp-p2p:upload-available', uploadAvailable)
      }
    }

    const bridge = getBrowserXmppBridge()
    if (!bridge?.resolveUploadUrl) {
      setState({ source: url, loading: false })
      return () => {
        cancelled = true
        window.removeEventListener('xmpp-p2p:bridge-ready', bridgeReady)
        window.removeEventListener('xmpp-p2p:upload-available', uploadAvailable)
      }
    }

    void (async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
        try {
          const resolved = await bridge.resolveUploadUrl(url)
          if (resolved) {
            if (cancelled) URL.revokeObjectURL(resolved)
            else {
              objectUrl = resolved
              setState({ source: url, value: resolved, loading: false })
            }
            return
          }
        } catch { /* retry while the P2P upload cache arrives */ }
        await new Promise((resolve) => setTimeout(resolve, 900))
      }
      if (!cancelled) setState({ source: url, loading: false })
    })()

    return () => {
      cancelled = true
      window.removeEventListener('xmpp-p2p:bridge-ready', bridgeReady)
      window.removeEventListener('xmpp-p2p:upload-available', uploadAvailable)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, bridgeRevision, retryRevision])

  return { url: current.value, loading: current.loading, retry: () => setRetryRevision((revision) => revision + 1) }
}
