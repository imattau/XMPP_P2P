/**
 * @packageDocumentation Electron main process for the Nexus desktop app.
 *
 * The native libp2p node and SQLite storage live here, while the existing
 * React UI runs in a renderer loaded from a fixed localhost origin. A preload
 * IPC bridge keeps a single peer identity and avoids a second browser node.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import path from 'node:path'
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

const storagePath = () => path.join(app.getPath('userData'), 'state.sqlite')

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

  const node = await createP2PNode(0, {
    host: '127.0.0.1',
    enableDht: true,
    enableWebRTC: true,
    privateKey
  }) as Libp2p

  try {
    await node.start()
  } catch (error) {
    if (!(error instanceof Error) || !/already started/i.test(error.message)) throw error
  }

  try {
    const xmpp = new XmppNode(node, storage, { nickname: options.nickname })
    await xmpp.ready
    const runtimeBridge = new BrowserXmppRuntimeBridge(xmpp, async () => { await node.stop() })

    libp2p = node
    xmppNode = xmpp
    bridge = runtimeBridge

    return { jid: runtimeBridge.getLocalJid() }
  } catch (error) {
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
  ipcMain.handle(IPC.start, async (event, options: NativeStartOptions = {}) => {
    const result = await startXmpp(options)
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (window) attachBridgeToWindow(window)
    return result
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
