/**
 * @packageDocumentation Browser entry point: wires IndexedDbStorage + the browser libp2p
 * factory + XmppNode together. This is the browser counterpart to src/index.ts.
 */

import type { Libp2p } from 'libp2p'
import { createBrowserP2PNode } from './core/p2p-browser.js'
import { IndexedDbStorage } from './core/storage/indexeddb-storage.js'
import { XmppNode, type XmppNodeOptions } from './core/xmpp-node.js'
import { loadOmemoModule } from './core/omemo-runtime-browser.js'

export interface CreateBrowserXmppClientOptions {
  bootstrapAddrs: string[]
  dbName?: string
  nickname?: string
}

/**
 * Creates and initializes the browser XMPP client runtime.
 *
 * @param options - Browser bootstrap and persistence configuration.
 * @returns The started libp2p node and ready XmppNode wrapper.
 */
export async function createBrowserXmppClient(
  options: CreateBrowserXmppClientOptions
): Promise<{ libp2p: Libp2p; xmppNode: XmppNode }> {
  const storage = new IndexedDbStorage(options.dbName ?? 'xmpp-p2p')
  const libp2p = await createBrowserP2PNode({ bootstrapAddrs: options.bootstrapAddrs })
  await libp2p.start()

  const nodeOptions: XmppNodeOptions = {
    nickname: options.nickname,
    // browser build uses the browser OMEMO loader instead of XmppNode's Node-default
    omemoModuleLoader: loadOmemoModule
  }
  const xmppNode = new XmppNode(libp2p, storage, nodeOptions)

  await xmppNode.ready

  return { libp2p, xmppNode }
}
