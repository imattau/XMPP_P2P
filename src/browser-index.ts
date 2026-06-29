/**
 * @packageDocumentation Browser entry point: wires IndexedDbStorage + the browser libp2p
 * factory + XmppNode + bridge together. This is the browser counterpart to src/index.ts.
 */

import type { Libp2p } from 'libp2p'
import { createBrowserP2PNode } from './core/p2p-browser.js'
import { IndexedDbStorage } from './core/storage/indexeddb-storage.js'
import { EncryptedStorage } from './core/storage/encrypted-storage.js'
import { XmppNode, type XmppNodeOptions } from './core/xmpp-node.js'
import { loadOmemoModule } from './core/omemo-runtime-browser.js'
import { BrowserXmppRuntimeBridge } from './bridge/browser-runtime.js'

export interface CreateBrowserXmppClientOptions {
  bootstrapAddrs: string[]
  dbName?: string
  nickname?: string
  passphrase?: string
}

/**
 * Creates and initializes the browser XMPP client runtime.
 *
 * @param options - Browser bootstrap and persistence configuration.
 * @returns The started libp2p node, ready XmppNode wrapper, and runtime bridge.
 */
export async function createBrowserXmppClient(
  options: CreateBrowserXmppClientOptions
): Promise<{ libp2p: Libp2p; xmppNode: XmppNode; bridge: BrowserXmppRuntimeBridge }> {
  const innerStorage = new IndexedDbStorage(options.dbName ?? 'xmpp-p2p')

  let storage = innerStorage as any
  if (options.passphrase) {
    const encrypted = new EncryptedStorage(innerStorage)
    const isEncrypted = await encrypted.isStorageEncrypted()
    if (!isEncrypted) {
      await encrypted.initialize(options.passphrase)
    } else {
      const valid = await encrypted.verifyPassphrase(options.passphrase)
      if (!valid) {
        throw new Error('Invalid passphrase — cannot decrypt local key storage')
      }
      await encrypted.initialize(options.passphrase)
    }
    // initialize() is idempotent — it derives the key if salt exists,
    // or creates a new salt+key if not.
    storage = encrypted
  }

  const libp2p = await createBrowserP2PNode({ bootstrapAddrs: options.bootstrapAddrs })
  await libp2p.start()

  const nodeOptions: XmppNodeOptions = {
    nickname: options.nickname,
    omemoModuleLoader: loadOmemoModule
  }
  const xmppNode = new XmppNode(libp2p, storage, nodeOptions)

  await xmppNode.ready

  const bridge = new BrowserXmppRuntimeBridge(xmppNode)

  if (typeof window !== 'undefined') {
    (window as any).__XMPP_P2P_BRIDGE__ = bridge
  }

  return { libp2p, xmppNode, bridge }
}
