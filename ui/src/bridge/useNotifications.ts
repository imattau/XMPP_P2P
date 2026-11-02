import { useEffect } from 'react'
import { getBrowserXmppBridge } from './runtime'
import { identityController } from './identity/controller'
import { isDirectChatMuted } from './direct-chat-history'
import { getGroupChatSession } from '../pages/chat-session'

export function useNotifications() {
  useEffect(() => {
    let unsubscribers: Array<() => void> = []
    const attach = () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      unsubscribers = []
      const bridge = getBrowserXmppBridge()
      if (!bridge) return

      if (bridge.onMessage) unsubscribers.push(bridge.onMessage((msg) => {
        if (msg.mam || msg.type === 'groupchat' || !msg.body) return
        if (typeof Notification === 'undefined') return
        if (document.visibilityState === 'visible') return
        if (Notification.permission !== 'granted') return
        const identity = identityController.getState()
        if (!identity.permissions.notifications || !identity.preferences.messageNotifications) return
        const bareFrom = msg.from.split('/')[0]
        if (bareFrom === bridge.getLocalJid().split('/')[0]) return
        const chatId = bareFrom.includes('@') ? bareFrom : `${bareFrom}@p2p`
        if (isDirectChatMuted(chatId)) return

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
      }))
      if (bridge.onMucMessage) unsubscribers.push(bridge.onMucMessage((event: any) => {
        if (event.mam || event.fromSelf) return
        if (typeof Notification === 'undefined' || document.visibilityState === 'visible') return
        if (Notification.permission !== 'granted') return
        const identity = identityController.getState()
        if (!identity.permissions.notifications || !identity.preferences.messageNotifications) return
        const roomId = String(event.room ?? event.roomJid ?? '').replace(/@muc\.p2p$/, '')
        const session = roomId ? getGroupChatSession(roomId) : undefined
        if (!event.body || session?.chat.muted) return
        const localJid = bridge.getLocalJid()
        if (event.peerJid === localJid || (!event.peerJid && event.from === localJid.split('@')[0])) return
        try {
          const notification = new Notification(event.from || 'Group message', {
            body: event.body,
            icon: '/favicon.ico',
            silent: false,
          })
          setTimeout(() => notification.close(), 5000)
        } catch { /* Notification may fail in some contexts */ }
      }))
      if (bridge.onFeedPost) unsubscribers.push(bridge.onFeedPost((post) => {
        if (typeof Notification === 'undefined' || document.visibilityState === 'visible') return
        const identity = identityController.getState()
        if (Notification.permission !== 'granted' || !identity.permissions.notifications || !identity.preferences.feedNotifications) return
        try {
          const notification = new Notification(post.author ?? post.from, {
            body: post.title ?? post.body,
            icon: '/favicon.ico',
            silent: false,
          })
          setTimeout(() => notification.close(), 5000)
        } catch { /* Notification may fail in some contexts */ }
      }))
    }

    attach()
    window.addEventListener('xmpp-p2p:bridge-ready', attach)
    window.addEventListener('xmpp-p2p:bridge-disconnected', attach)

    return () => {
      window.removeEventListener('xmpp-p2p:bridge-ready', attach)
      window.removeEventListener('xmpp-p2p:bridge-disconnected', attach)
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])
}

export function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return Promise.resolve(false)
  if (Notification.permission === 'granted') return Promise.resolve(true)
  if (Notification.permission === 'denied') return Promise.resolve(false)
  return Notification.requestPermission()
    .then((result) => result === 'granted')
    .catch(() => false)
}
