/**
 * @packageDocumentation Electron main process for the Nexus desktop app.
 *
 * The native libp2p node and SQLite storage live here, while the existing
 * React UI runs in a renderer loaded from a fixed localhost origin. A preload
 * IPC bridge keeps a single peer identity and avoids a second browser node.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron'
import path from 'node:path'
import { isIP, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys'
import type { Libp2p } from 'libp2p'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { keyFromRecoveryPhrase } from '../core/identity-key.js'
import { BrowserXmppRuntimeBridge } from '../bridge/browser-runtime.js'
import { IpcBridgeHost } from './bridge-ipc.js'
import { IPC, type NativeStartOptions } from './bridge-contract.js'
import { rendererRoot, startStaticServer } from './static-server.js'
import { fetchRssFeed } from './rss-feed-fetch.js'
import { loadOrCreateNostrBootstrapSecretKey } from '../core/node-nostr-bootstrap-key.js'
import { startNostrBootstrapPublisher } from '../core/nostr-bootstrap.js'
import { isPrivate } from '@libp2p/utils'
import { multiaddr } from '@multiformats/multiaddr'

// Node's 250 ms per-address dual-stack timeout aborts slow IPv4 connects when
// IPv6 is unroutable, so XMPP TCP/TLS fails with an empty AggregateError.
setDefaultAutoSelectFamilyAttemptTimeout(5000)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The app is a text UI; software rendering avoids GPU-process failures on
// headless/VM Linux sessions and saves battery on laptops.
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | undefined
let rendererServer: Awaited<ReturnType<typeof startStaticServer>> | undefined
let libp2p: Libp2p | undefined
let xmppNode: XmppNode | undefined
let bridge: BrowserXmppRuntimeBridge | undefined
let bridgeHost: IpcBridgeHost | undefined
let stopping = false
let stopRelayPublisher: (() => void) | undefined

function publicRelayAddress(hostValue: string | undefined, port: number): string | undefined {
  const host = hostValue?.trim().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return undefined
  const ipVersion = isIP(host)
  const protocol = ipVersion === 4 ? 'ip4' : ipVersion === 6 ? 'ip6' : 'dns4'
  try {
    const address = multiaddr(`/${protocol}/${host}/tcp/${port}`)
    if (isPrivate(address)) return undefined
    return address.toString()
  } catch { return undefined }
}

const storagePath = () => path.join(app.getPath('userData'), 'state.sqlite')
const xmppCredentialPath = () => path.join(app.getPath('userData'), 'xmpp-credentials.enc')

function assertSecureCredentialStorage(): void {
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('Secure XMPP password storage is unavailable. Configure a system keyring (GNOME Keyring or KWallet) and restart Nexus.')
  }
}

async function getSavedXmppCredentials(): Promise<{ jid: string; password: string; service?: string } | undefined> {
  const file = xmppCredentialPath()
  try {
    const encrypted = await import('node:fs/promises').then(fs => fs.readFile(file))
    assertSecureCredentialStorage()
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('The operating system secure storage is unavailable')
    const { result } = await safeStorage.decryptStringAsync(encrypted)
    const credentials = JSON.parse(result) as { jid?: unknown; password?: unknown; service?: unknown }
    if (typeof credentials.jid !== 'string' || typeof credentials.password !== 'string') return undefined
    return { jid: credentials.jid, password: credentials.password, service: typeof credentials.service === 'string' ? credentials.service : undefined }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function saveXmppCredentials(credentials: { jid: string; password: string; service?: string }): Promise<boolean> {
  assertSecureCredentialStorage()
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('The operating system secure storage is unavailable')
  const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(credentials))
  const fs = await import('node:fs/promises')
  const file = xmppCredentialPath()
  const temporary = `${file}.tmp`
  await fs.writeFile(temporary, encrypted, { mode: 0o600 })
  await fs.rename(temporary, file)
  return true
}

async function loadIdentityKey(storage: NodeSqliteStorage, recoveryPhrase?: string[]) {
  if (recoveryPhrase?.length) {
    const key = await keyFromRecoveryPhrase(recoveryPhrase)
    await storage.putRecord('libp2p', 'private-key', Buffer.from(privateKeyToProtobuf(key)).toString('base64'), new Date().toISOString())
    return key
  }

  const saved = await storage.getRecord('libp2p', 'private-key')
  if (saved) return privateKeyFromProtobuf(Buffer.from(saved, 'base64'))

  const key = await generateKeyPair('Ed25519')
  await storage.putRecord('libp2p', 'private-key', Buffer.from(privateKeyToProtobuf(key)).toString('base64'), new Date().toISOString())
  return key
}

async function startXmpp(options: NativeStartOptions): Promise<{ jid: string }> {
  if (bridge && xmppNode) return { jid: bridge.getLocalJid() }

  const storage = new NodeSqliteStorage(storagePath())
  const privateKey = await loadIdentityKey(storage, options.recoveryPhrase)
  const relayInput = options.relay
  const relay = {
    enabled: relayInput?.enabled === true,
    listenPort: Number.isInteger(relayInput?.listenPort) && relayInput!.listenPort >= 1 && relayInput!.listenPort <= 64535 ? relayInput!.listenPort : 4001,
    publicHost: relayInput?.publicHost,
    publicPort: Number.isInteger(relayInput?.publicPort) && relayInput!.publicPort >= 1 && relayInput!.publicPort <= 65535 ? relayInput!.publicPort : 4001,
    maxReservations: Number.isInteger(relayInput?.maxReservations) && relayInput!.maxReservations >= 1 && relayInput!.maxReservations <= 256 ? relayInput!.maxReservations : 32,
    publishToNostr: relayInput?.publishToNostr === true,
  }
  const announcedRelayAddress = relay.enabled ? publicRelayAddress(relay.publicHost, relay.publicPort) : undefined

  const node = await createP2PNode(relay.enabled ? relay.listenPort : 0, {
    // The desktop peer must accept connections from other devices. The UI
    // renderer itself remains isolated on its own localhost HTTP server.
    host: '0.0.0.0',
    enableMdns: true,
    enableDht: options.dhtEnabled !== false,
    enableWebRTC: true,
    enableRelay: relay.enabled,
    relayMaxReservations: relay.maxReservations,
    relayPublicAddress: announcedRelayAddress,
    bootstrapAddrs: options.bootstrapAddrs,
    privateKey
  }) as Libp2p

  try {
    await node.start()
  } catch (error) {
    if (!(error instanceof Error) || !/already started/i.test(error.message)) throw error
  }

  try {
    const xmpp = new XmppNode(node, storage, {
      nickname: options.nickname,
      allowNativeXmppTcp: true
    })
    await xmpp.ready
    if (relay.enabled && relay.publishToNostr && announcedRelayAddress) {
      const { secretKey } = await loadOrCreateNostrBootstrapSecretKey(path.join(app.getPath('userData'), 'nostr-relay-publisher-key'))
      const nostrRelays = options.nostrRelayUrls ?? []
      if (nostrRelays.length) {
        stopRelayPublisher = startNostrBootstrapPublisher({
          relayUrls: nostrRelays,
          secretKey,
          peerId: node.peerId.toString(),
          bootstrapAddrs: [`${announcedRelayAddress}/p2p/${node.peerId.toString()}`],
          onPublished: () => console.info('[Relay] Published this desktop relay address to Nostr'),
          onError: error => console.warn(`[Relay] Could not publish relay address to Nostr: ${error.message}`),
        })
      }
    }
    const runtimeBridge = new BrowserXmppRuntimeBridge(xmpp, async () => {
      stopRelayPublisher?.()
      stopRelayPublisher = undefined
      await node.stop()
    }, fetchRssFeed)

    libp2p = node
    xmppNode = xmpp
    bridge = runtimeBridge

    return { jid: runtimeBridge.getLocalJid() }
  } catch (error) {
    stopRelayPublisher?.()
    stopRelayPublisher = undefined
    try { await node.stop() } catch { /* already stopped */ }
    throw error
  }
}

async function stopXmpp(): Promise<void> {
  if (stopping) return
  stopping = true
  try {
    bridgeHost?.dispose()
    bridgeHost = undefined
    if (bridge) await bridge.disconnect().catch(() => {})
    bridge = undefined
    xmppNode = undefined
    libp2p = undefined
  } finally {
    stopping = false
  }
}

function attachBridgeToWindow(window: BrowserWindow): void {
  if (!bridge) return
  bridgeHost?.dispose()
  bridgeHost = new IpcBridgeHost(bridge, (channel, ...args) => {
    if (!window.isDestroyed()) window.webContents.send(channel, ...args)
  })
  bridgeHost.registerEvents()
}

async function createWindow(): Promise<void> {
  if (!rendererServer) {
    rendererServer = await startStaticServer(rendererRoot(app.getAppPath()))
  }
  const server = rendererServer
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'Nexus',
    backgroundColor: '#080b12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = window

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(server.url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  window.on('closed', () => {
    mainWindow = undefined
  })

  await window.loadURL(server.url)

  if (process.env.ELECTRON_DEV === '1') window.webContents.openDevTools({ mode: 'detach' })
}

function registerIpc(): void {
  ipcMain.handle('xmpp-credentials:get', async () => await getSavedXmppCredentials())
  ipcMain.handle('xmpp-credentials:save', async (_event, credentials: { jid: string; password: string; service?: string }) => {
    if (!credentials || typeof credentials.jid !== 'string' || typeof credentials.password !== 'string') {
      throw new Error('Valid XMPP credentials are required')
    }
    return await saveXmppCredentials(credentials)
  })
  ipcMain.handle('xmpp-credentials:clear', async () => {
    const fs = await import('node:fs/promises')
    await fs.rm(xmppCredentialPath(), { force: true })
  })

  ipcMain.handle(IPC.start, async (event, options: NativeStartOptions = {}) => {
    const result = await startXmpp(options)
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (window) attachBridgeToWindow(window)
    return result
  })

  ipcMain.handle('xmpp:relay-status', () => {
    const relay = (libp2p as any)?.services?.relay
    return {
      enabled: Boolean(relay),
      running: relay?.isStarted?.() === true,
      reservations: Number(relay?.reservations?.size ?? 0),
      publishing: Boolean(stopRelayPublisher),
    }
  })

  ipcMain.handle(IPC.call, async (_event, method: string, args: unknown[] = []) => {
    if (!bridgeHost) throw new Error('The native peer is not running')
    return await bridgeHost.call(method, args)
  })

  ipcMain.on(IPC.callSync, (event, method: string, args: unknown[] = []) => {
    try {
      event.returnValue = bridgeHost ? bridgeHost.callSync(method, args) : undefined
    } catch (error) {
      console.error(`sync bridge call failed: ${method}`, error)
      event.returnValue = undefined
    }
  })

  ipcMain.handle(IPC.disconnect, async () => {
    await stopXmpp()
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setName('Nexus')
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    registerIpc()

    try {
      await createWindow()
    } catch (error) {
      dialog.showErrorBox('Nexus failed to start', error instanceof Error ? error.message : String(error))
      app.quit()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  }).catch((error) => {
    dialog.showErrorBox('Nexus failed to start', error instanceof Error ? error.message : String(error))
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    void stopXmpp()
    void rendererServer?.close()
    rendererServer = undefined
  })
}

// Keep the peer ID visible in logs for support/debugging.
process.on('uncaughtException', (error) => console.error('uncaught exception', error))
process.on('unhandledRejection', (error) => console.error('unhandled rejection', error))
