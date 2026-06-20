/**
 * @packageDocumentation Browser test fixture that exposes createBrowserXmppClient on
 * window and records outbound connections for the browser OMEMO/runtime tests.
 */

import { createBrowserXmppClient } from '../../browser-index.js'

;(window as unknown as { createBrowserXmppClient: typeof createBrowserXmppClient }).createBrowserXmppClient = createBrowserXmppClient

;(window as unknown as { __connections: string[] }).__connections = []
const originalCreate = (window as any).createBrowserXmppClient
;(window as any).createBrowserXmppClient = async (opts: Parameters<typeof createBrowserXmppClient>[0]) => {
  const result = await originalCreate(opts)
  result.libp2p.addEventListener('connection:open', (evt: any) => {
    ;(window as any).__connections.push(evt.detail.remotePeer.toString())
  })
  return result
}
