/**
 * @packageDocumentation Capacitor lifecycle glue.
 *
 * A mobile WebView is suspended in the background, which kills libp2p
 * connections. Disconnect cleanly on background and ask the React root to
 * start a fresh client on resume so the DHT mailbox can be flushed.
 */

import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export function installNativeLifecycle(): void {
  if (!Capacitor.isNativePlatform()) return

  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    const bridge = (window as any).__XMPP_P2P_BRIDGE__
    if (!isActive) {
      void bridge?.disconnect?.().catch(() => {})
      return
    }
    window.dispatchEvent(new Event('xmpp-p2p:native-resume'))
  })

  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      void CapacitorApp.exitApp()
    }
  })
}
