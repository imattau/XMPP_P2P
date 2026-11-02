/**
 * @packageDocumentation Sandboxed preload that exposes the native bridge.
 *
 * The renderer's existing `XmppRuntimeBridge` interface is preserved: method
 * calls are proxied to the main process and event subscriptions fan out from
 * one `xmpp:event` IPC channel.
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  ASYNC_METHODS,
  EVENT_METHODS,
  IPC,
  SYNC_METHODS,
  type NativeStartOptions
} from './bridge-contract.js'

type Listener = (...args: any[]) => void
const listeners = new Map<string, Set<Listener>>()

ipcRenderer.on(IPC.event, (_event, name: string, args: unknown[]) => {
  const set = listeners.get(name)
  if (!set) return
  for (const listener of set) {
    try { listener(...args) } catch { /* keep other subscribers alive */ }
  }
})

function eventMethod(name: string): (cb: Listener) => () => void {
  return (cb: Listener) => {
    let set = listeners.get(name)
    if (!set) {
      set = new Set()
      listeners.set(name, set)
    }
    set.add(cb)
    return () => {
      set?.delete(cb)
      if (set && set.size === 0) listeners.delete(name)
    }
  }
}

async function uploadFile(file: File | Uint8Array, recipient?: string, fileName?: string, mimeType?: string) {
  if (file instanceof Uint8Array) {
    return await ipcRenderer.invoke(IPC.call, 'uploadFile', [file, recipient, fileName, mimeType])
  }
  const data = new Uint8Array(await file.arrayBuffer())
  return await ipcRenderer.invoke(IPC.call, 'uploadFile', [data, recipient, file.name, file.type])
}

function createBridge(): Record<string, unknown> {
  const bridge: Record<string, unknown> = {}

  for (const name of EVENT_METHODS) bridge[name] = eventMethod(name)

  for (const name of SYNC_METHODS) {
    bridge[name] = (...args: unknown[]) => ipcRenderer.sendSync(IPC.callSync, name, args)
  }

  for (const name of ASYNC_METHODS) {
    if (name === 'uploadFile') {
      bridge[name] = uploadFile
    } else {
      bridge[name] = (...args: unknown[]) => ipcRenderer.invoke(IPC.call, name, args)
    }
  }

  bridge.disconnect = async () => {
    await ipcRenderer.invoke(IPC.disconnect)
  }

  return bridge
}

contextBridge.exposeInMainWorld('__XMPP_P2P_NATIVE__', {
  createClient: async (options: NativeStartOptions) => {
    const result = await ipcRenderer.invoke(IPC.start, options)
    return { bridge: createBridge(), jid: result?.jid }
  }
})
