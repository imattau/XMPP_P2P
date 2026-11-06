/**
 * @packageDocumentation Renderer-side adapter for the Electron native shell.
 *
 * The preload exposes `window.__XMPP_P2P_NATIVE__`. We present it through the
 * same `window.XmppP2P.createBrowserXmppClient` entry point the web build uses,
 * so onboarding and Root need no platform-specific branches.
 */

import type { XmppRuntimeBridge } from './bridge/runtime'

type NativeClientResult = {
  bridge: XmppRuntimeBridge
  jid?: string
}

type NativeShellApi = {
  getRelayStatus?: () => Promise<{ enabled: boolean; running: boolean; reservations: number; publishing: boolean }>
  createClient: (options: {
    recoveryPhrase?: string[]
    nickname?: string
    dbName?: string
    bootstrapAddrs?: string[]
    dhtEnabled?: boolean
    relay?: {
      enabled: boolean
      listenPort: number
      publicHost?: string
      publicPort: number
      maxReservations: number
      publishToNostr: boolean
    }
    nostrRelayUrls?: string[]
  }) => Promise<NativeClientResult>
}

declare global {
  interface Window {
    __XMPP_P2P_NATIVE__?: NativeShellApi
  }
}

/**
 * Returns true inside the Electron shell or a Capacitor native WebView.
 */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__XMPP_P2P_NATIVE__) return true
  const capacitor = (window as any).Capacitor
  return Boolean(capacitor?.isNativePlatform?.())
}

export function isElectronShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__XMPP_P2P_NATIVE__)
}

/**
 * Installs the native `createBrowserXmppClient` shim when the preload is
 * present. No-op on the web and in the browser bundle.
 */
export function installNativeShell(): void {
  const native = window.__XMPP_P2P_NATIVE__
  if (!native) return

  window.XmppP2P = {
    createBrowserXmppClient: async (options) => {
      const result = await native.createClient({
        recoveryPhrase: options.recoveryPhrase,
        nickname: options.nickname,
        dbName: options.dbName,
        bootstrapAddrs: options.bootstrapAddrs,
        dhtEnabled: options.dhtEnabled,
        relay: options.relay,
        nostrRelayUrls: options.nostrRelayUrls
      })

      const raw = result.bridge
      const bridge = Object.assign({}, raw, {
        disconnect: async () => {
          await raw.disconnect()
          delete (window as any).__XMPP_P2P_BRIDGE__
          window.dispatchEvent(new Event('xmpp-p2p:bridge-disconnected'))
        }
      }) as XmppRuntimeBridge

      ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
      window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'))
      return { bridge }
    }
  }
}
