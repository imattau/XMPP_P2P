import { useEffect, useRef } from 'react'
import { getBrowserXmppBridge } from './runtime'

export function useNotifications() {
  const grantedRef = useRef(false)

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    grantedRef.current = Notification.permission === 'granted'
  }, [])

  useEffect(() => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.onMessage) return

    const unsub = bridge.onMessage((msg) => {
      if (typeof Notification === 'undefined') return
      if (document.visibilityState === 'visible') return
      if (Notification.permission !== 'granted') return

      const sender = msg.from.split('@')[0] || msg.from
      try {
        const notification = new Notification(sender, {
          body: msg.body || 'New message',
          icon: '/favicon.ico',
          silent: false,
        })
        setTimeout(() => notification.close(), 5000)
      } catch {
        // Notification may fail in some contexts
      }
    })

    return unsub
  }, [])
}

export function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return Promise.resolve(false)
  if (Notification.permission === 'granted') return Promise.resolve(true)
  if (Notification.permission === 'denied') return Promise.resolve(false)
  return Notification.requestPermission().then((result) => result === 'granted')
}
