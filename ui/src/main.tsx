import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './app/App'
import { initializeAccountStorage } from './lib/account-storage'
import { installNativeLifecycle } from './lib/native-lifecycle'
import { installNativeShell, isNativeShell } from './native-shell'
import './styles.css'

const PRELOAD_RECOVERY_KEY = 'xmpp-p2p:preload-recovery-at'

installNativeShell()
installNativeLifecycle()

// Native shells (Electron/Capacitor) must not cache their bundled assets in a
// service worker; a stale cache survives an app update. Register only on web.
if (!isNativeShell()) {
  registerSW({ immediate: true })

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()

    const now = Date.now()
    try {
      const previousAttempt = Number(sessionStorage.getItem(PRELOAD_RECOVERY_KEY) ?? 0)
      if (previousAttempt && now - previousAttempt < 10_000) return
      sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(now))
    } catch {
      // Avoid a possible reload loop when the session cannot persist the guard.
      return
    }

    window.location.reload()
  })
}

initializeAccountStorage()

createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
