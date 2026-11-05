/**
 * @packageDocumentation Browser entry point: wires IndexedDbStorage + the browser libp2p
 * factory + XmppNode + bridge together. This is the browser counterpart to src/index.ts.
 */

import type { Libp2p } from 'libp2p'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { Buffer } from 'buffer'
import { createBrowserP2PNode } from './core/p2p-browser.js'
import { IndexedDbStorage } from './core/storage/indexeddb-storage.js'
import { EncryptedStorage } from './core/storage/encrypted-storage.js'
import { XmppNode, type XmppNodeOptions } from './core/xmpp-node.js'
import { loadOmemoModule } from './core/omemo-runtime-browser.js'
import { BrowserXmppRuntimeBridge } from './bridge/browser-runtime.js'
import { keyFromRecoveryPhrase, type IdentityKeyStore } from './core/identity-key.js'
import type { RssFeedFetcher } from './core/rss-feeds.js'

/** Use native HTTP on Android/iOS so feed servers do not need WebView CORS headers. */
const rssFeedFetcher: RssFeedFetcher = async (url, init) => {
  // Check at request time because the Capacitor bridge may initialize after this
  // module is evaluated in the WebView.
  if (!Capacitor.isNativePlatform()) {
    return fetch(url, init)
  }

  const requestHeaders = Object.fromEntries(new Headers(init.headers).entries())
  requestHeaders.accept ??= 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
  const response = await CapacitorHttp.request({
    url,
    method: 'GET',
    headers: requestHeaders,
    responseType: 'text',
    connectTimeout: 12_000,
    readTimeout: 12_000,
    disableRedirects: true,
  })
  const headers = new Headers()
  for (const [name, value] of Object.entries(response.headers)) {
    // Android's HttpURLConnection includes a null-key HTTP status line.
    if (name.toLowerCase() !== 'null') headers.set(name, value)
  }
  const nativeResponse = new Response(typeof response.data === 'string' ? response.data : String(response.data ?? ''), {
    status: response.status,
    headers,
  })
  // A native client may return the final URL if the server ignored the manual
  // redirect setting; preserve it so feed identity uses the canonical address.
  if (response.url) Object.defineProperty(nativeResponse, 'url', { value: response.url })
  return nativeResponse
}

export interface CreateBrowserXmppClientOptions {
  bootstrapAddrs: string[]
  dbName?: string
  nickname?: string
  passphrase?: string
  recoveryPhrase?: string[]
  dhtClientMode?: boolean
  /** Native secure-storage mirror used when IndexedDB has no key. */
  keyStore?: IdentityKeyStore
}

function storageMarkerKey(dbName: string, marker: 'active-peer-id' | 'legacy-owner-peer-id'): string {
  return `${dbName}:${marker}`
}

function readStorageMarker(key: string): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key) } catch { return null }
}

function writeStorageMarker(key: string, value: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value) } catch { /* IndexedDB remains authoritative */ }
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
  const dbName = options.dbName ?? 'xmpp-p2p'
  const legacyStorage = new IndexedDbStorage(dbName)

  let legacyRecords = legacyStorage as any
  if (options.passphrase) {
    const encrypted = new EncryptedStorage(legacyStorage)
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
    legacyRecords = encrypted
  }

  const activePeerMarker = storageMarkerKey(dbName, 'active-peer-id')
  const legacyOwnerMarker = storageMarkerKey(dbName, 'legacy-owner-peer-id')
  const activePeerId = options.passphrase || options.recoveryPhrase?.length
    ? null
    : readStorageMarker(activePeerMarker)
  const activeStorage = activePeerId
    ? new IndexedDbStorage(`${dbName}:account:${activePeerId}`)
    : undefined
  const savedKey = activeStorage
    ? await activeStorage.getRecord('libp2p', 'private-key')
    : await legacyRecords.getRecord('libp2p', 'private-key')
  const mirroredKey = !savedKey && !options.passphrase && options.keyStore
    ? await options.keyStore.get()
    : undefined
  if (activePeerId && !savedKey && !mirroredKey && !options.recoveryPhrase?.length) {
    throw new Error('This browser is missing the saved identity key. Import the recovery phrase to restore this identity.')
  }
  const privateKey = options.recoveryPhrase?.length
    ? await keyFromRecoveryPhrase(options.recoveryPhrase)
    : (savedKey ?? mirroredKey)
      ? privateKeyFromProtobuf(Buffer.from(savedKey ?? mirroredKey!, 'base64'))
      : await generateKeyPair('Ed25519')
  const peerId = peerIdFromPrivateKey(privateKey).toString()
  if (activePeerId && activePeerId !== peerId) {
    throw new Error('The saved browser identity key does not match the active profile. Import the matching recovery phrase.')
  }

  let storage = legacyRecords
  if (!options.passphrase) {
    const accountStorage = activeStorage ?? new IndexedDbStorage(`${dbName}:account:${peerId}`)
    let accountKey = await accountStorage.getRecord('libp2p', 'private-key')
    if (!accountKey) {
      const legacyKey = await legacyStorage.getRecord('libp2p', 'private-key')
      const legacyPeerId = legacyKey
        ? peerIdFromPrivateKey(privateKeyFromProtobuf(Buffer.from(legacyKey, 'base64'))).toString()
        : undefined
      let legacyOwner = readStorageMarker(legacyOwnerMarker)
      if (legacyOwner === null) {
        legacyOwner = legacyPeerId ?? peerId
        writeStorageMarker(legacyOwnerMarker, legacyOwner)
      }
      if (legacyOwner === peerId && (!legacyPeerId || legacyPeerId === peerId)) {
        await legacyStorage.copyAllTo(accountStorage)
        accountKey = await accountStorage.getRecord('libp2p', 'private-key')
      }
    }

    if (accountKey) {
      const storedPeerId = peerIdFromPrivateKey(privateKeyFromProtobuf(Buffer.from(accountKey, 'base64'))).toString()
      if (storedPeerId !== peerId) throw new Error('Stored browser data belongs to a different identity.')
    } else {
      await accountStorage.putRecord(
        'libp2p',
        'private-key',
        Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'),
        new Date().toISOString()
      )
    }
    writeStorageMarker(activePeerMarker, peerId)
    storage = accountStorage
  } else if (!savedKey || options.recoveryPhrase?.length) {
    await legacyRecords.putRecord(
      'libp2p',
      'private-key',
      Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'),
      new Date().toISOString()
    )
  }

  if (!options.passphrase && options.keyStore) {
    try {
      await options.keyStore.set(Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'))
    } catch {
      // The IndexedDB copy remains authoritative; a mirror failure must not
      // prevent the peer from starting.
    }
  }

  const libp2p = await createBrowserP2PNode({ bootstrapAddrs: options.bootstrapAddrs, privateKey, dhtClientMode: options.dhtClientMode })
  let xmppNode: XmppNode | undefined
  try {
    await libp2p.start()

    const nodeOptions: XmppNodeOptions = {
      nickname: options.nickname,
      omemoModuleLoader: loadOmemoModule,
      httpUploadServer: false
    }
    xmppNode = new XmppNode(libp2p, storage, nodeOptions)
    await xmppNode.ready

    const bridge = new BrowserXmppRuntimeBridge(xmppNode, async () => {
      await libp2p.stop()
    }, rssFeedFetcher)

    if (typeof window !== 'undefined') {
      (window as any).__XMPP_P2P_BRIDGE__ = bridge
      window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'))
    }

    return { libp2p, xmppNode, bridge }
  } catch (error) {
    // A rejected initialization must not leave transports and handlers alive;
    // the UI exposes retry and can otherwise create a second P2P node.
    if (xmppNode) {
      await Promise.resolve(xmppNode.clientBridge.disconnect()).catch(() => {})
      await xmppNode.muc.close().catch(() => {})
    }
    await Promise.resolve(libp2p.stop()).catch(() => {})
    throw error
  }
}
