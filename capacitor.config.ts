import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor shell for the Android build.
 *
 * The WebView serves the Vite output from `https://localhost`, which is a
 * secure context (crypto.subtle + WASM work). Do not change `hostname` or
 * `androidScheme` after the first release: the origin is the storage key for
 * localStorage/IndexedDB.
 */
const config: CapacitorConfig = {
  appId: 'app.nexus.xmpp',
  appName: 'Nexus',
  webDir: 'ui/dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css'
    }
  }
}

export default config
