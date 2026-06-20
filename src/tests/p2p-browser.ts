import assert from 'node:assert/strict'
import { createP2PNode } from '../core/p2p.js'
import { createBrowserP2PNode } from '../core/p2p-browser.js'

async function main() {
  const nodePeer = await createP2PNode(0, { enableMdns: false, enableDht: true, host: '127.0.0.1' })
  await nodePeer.start()

  const wsAddr = nodePeer.getMultiaddrs().find((ma: any) => ma.toString().includes('/ws'))
  assert.ok(wsAddr, 'Node peer must expose a /ws multiaddr for browser-style transports to dial')

  const browserPeer = await createBrowserP2PNode({ bootstrapAddrs: [wsAddr.toString()] })
  await browserPeer.start()

  // WebRTC-specific (browser-to-browser) dialing is exercised by a future
  // browser-environment (e.g. Playwright) test, not this Node-side script.
  // This dial only exercises the websockets path, which is sufficient to
  // prove Node/browser-factory interop for this task.
  await browserPeer.dial(wsAddr)
  const connections = browserPeer.getConnections(nodePeer.peerId)
  assert.ok(connections.length > 0, 'browser peer must successfully connect to the node peer over websockets')

  await browserPeer.stop()
  await nodePeer.stop()
  console.log('Browser/Node p2p interop test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
