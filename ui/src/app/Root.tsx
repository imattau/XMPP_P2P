import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router'
import { Home, Hash, PlusSquare, MessageCircle, User, Zap, FileText, Users, Settings, MoreHorizontal } from 'lucide-react'
import { ensureBrowserXmppClient, getBootstrapAddrs, getBrowserXmppBridge, useBrowserXmppBridge, watchBootstrapAddrs } from '../bridge/runtime'
import NavigationSidebar from '../components/NavigationSidebar'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { identityController } from '../bridge/identity/controller'
import { useNotifications } from '../bridge/useNotifications'
import { markDirectChatMessageDelivered, markDirectChatMessageReceiptReceived } from '../bridge/direct-chat-history'
import { flushOutbox, getPendingMessages } from '../lib/message-queue'
import { appendGroupChatMessage, getGroupChatSession, isActiveGroupChat, markActiveGroupChatRead, updateGroupChatSession } from '../pages/chat-session'
import { getMessageKind, parseAttachmentReferences } from '../bridge/chat/attachments'
import { getPeerAddress } from '../lib/peer-addresses'

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Zap size={20} className="text-muted-foreground animate-pulse" />
        <span className="font-mono text-[10px] text-muted-foreground">Loading…</span>
      </div>
    </div>
  )
}

const NAV = [
  { to: '/', icon: Home, label: 'Feed' },
  { to: '/topics', icon: Hash, label: 'Topics' },
  { to: '/compose', icon: PlusSquare, label: 'Write' },
  { to: '/chats', icon: MessageCircle, label: 'Chats' },
  { to: '/profile', icon: User, label: 'Profile' }
]

export default function Root() {
  const bridge = useBrowserXmppBridge()
  const { connected, connectedPeers, nodeAvailable } = useConnectionBridge()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [showMobileMore, setShowMobileMore] = useState(false)
  const mobileMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileMoreMenuRef = useRef<HTMLDivElement>(null)
  const isOnboarding = pathname.startsWith('/onboarding')
  const [initializing, setInitializing] = useState(false)
  const [bridgeError, setBridgeError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [bootstrapPeersConfigured, setBootstrapPeersConfigured] = useState<boolean | null>(null)
  const bootstrapRevisionRef = useRef(0)
  const pendingBootstrapRestartRef = useRef(false)
  const showDiscoveryWarning = nodeAvailable && !connected && bootstrapPeersConfigured === false
  useNotifications()

  useEffect(() => {
    let active = true
    const refreshBootstrapStatus = () => {
      bootstrapRevisionRef.current += 1
      void getBootstrapAddrs().then(addresses => {
        if (active) setBootstrapPeersConfigured(addresses.length > 0)
      })
      if (isOnboarding) pendingBootstrapRestartRef.current = true
      const currentBridge = getBrowserXmppBridge()
      if (currentBridge) {
        if (isOnboarding) {
          // Keep the node available for contact and room setup. Recreate it
          // with the updated bootstrap list after onboarding is complete.
          return
        }
        setInitializing(true)
        void currentBridge.disconnect()
          .then(() => setRetryCount(count => count + 1))
          .catch((error: unknown) => {
            setBridgeError(error instanceof Error ? error.message : 'Could not restart the peer network')
          })
      }
    }
    getBootstrapAddrs()
      .then(addresses => {
        if (active) setBootstrapPeersConfigured(addresses.length > 0)
      })
      .catch(() => {
        if (active) setBootstrapPeersConfigured(false)
      })
    window.addEventListener('xmpp-p2p:bootstrap-config-changed', refreshBootstrapStatus)
    const stopWatchingBootstrapAddrs = watchBootstrapAddrs(() => {
      window.dispatchEvent(new Event('xmpp-p2p:bootstrap-config-changed'))
    })
    return () => {
      active = false
      window.removeEventListener('xmpp-p2p:bootstrap-config-changed', refreshBootstrapStatus)
      stopWatchingBootstrapAddrs()
    }
  }, [isOnboarding])

  useEffect(() => {
    if (!showMobileMore) return
    const closeWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (mobileMoreMenuRef.current?.contains(target) || mobileMoreTriggerRef.current?.contains(target)) return
      setShowMobileMore(false)
    }
    document.addEventListener('pointerdown', closeWhenClickingOutside)
    return () => document.removeEventListener('pointerdown', closeWhenClickingOutside)
  }, [showMobileMore])

  useEffect(() => {
    if (!bridge?.broadcastPresence) return
    const nickname = identityController.getState().identity?.displayName
    void bridge.broadcastPresence('available', undefined, undefined, nickname).catch(() => {})
    return () => {
      void bridge.broadcastPresence('unavailable', undefined, undefined, nickname).catch(() => {})
    }
  }, [bridge])

  useEffect(() => {
    if (!bridge?.onMucMessage) return
    const unsubscribe = bridge.onMucMessage((event: any) => {
      const roomId = String(event.room ?? event.roomJid ?? '').replace(/@muc\.p2p$/, '')
      const session = roomId ? getGroupChatSession(roomId) : undefined
      if (!session || !event.id || !event.body) return
      const localJid = bridge.getLocalJid()
      const isSelf = event.fromSelf === true
        || event.peerJid === localJid
        || (!event.peerJid && event.from === localJid.split('@')[0])
      if (isSelf || session.messages.some((message) => message.id === event.id)) return
      const parsed = parseAttachmentReferences(event.body)
      const message = {
        id: event.id,
        senderId: event.peerJid ?? event.fromPeerId ?? event.from ?? 'participant',
        senderName: event.nick ?? String(event.from ?? '').split('/').pop() ?? 'Participant',
        content: parsed.content,
        timestamp: event.timestamp
          ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        activityAt: event.timestamp ?? new Date().toISOString(),
        kind: getMessageKind(parsed.attachments),
        delivered: true,
        read: isActiveGroupChat(roomId),
        encrypted: event.encrypted ?? false,
        thread: event.thread,
        replyTo: event.reply ? { messageId: event.reply.id, to: event.reply.to } : undefined,
        fileName: parsed.attachments.length > 0 ? parsed.attachments.map((attachment) => attachment.alt).join(', ') : undefined,
        attachments: parsed.attachments.length > 0 ? parsed.attachments : undefined,
      }
      if (event.replace) {
        updateGroupChatSession(roomId, (current) => ({
          ...current,
          messages: current.messages.some((entry) => entry.id === event.replace)
            ? current.messages.map((entry) => entry.id === event.replace ? message : entry)
            : [...current.messages, message],
        }))
      } else {
        appendGroupChatMessage(roomId, message)
      }
    })
    return unsubscribe
  }, [bridge])

  useEffect(() => {
    if (!bridge?.onMessage) return
    return bridge.onMessage((message) => {
      if (message.receipt?.type !== 'received' || !message.receipt.id || !message.from) return
      markDirectChatMessageReceiptReceived(message.from.split('/')[0], message.receipt.id)
    })
  }, [bridge])

  useEffect(() => {
    document.addEventListener('visibilitychange', markActiveGroupChatRead)
    return () => document.removeEventListener('visibilitychange', markActiveGroupChatRead)
  }, [])

  // Capacitor disconnects the node when the app is backgrounded. On resume,
  // re-run the client bootstrap so libp2p reconnects and flushes the mailbox.
  useEffect(() => {
    const resume = () => setRetryCount(count => count + 1)
    window.addEventListener('xmpp-p2p:native-resume', resume)
    return () => window.removeEventListener('xmpp-p2p:native-resume', resume)
  }, [])

  useEffect(() => {
    if (isOnboarding) return
    if (!identityController.isOnboardingComplete()) return

    const currentBridge = getBrowserXmppBridge()
    if (currentBridge && !pendingBootstrapRestartRef.current) return
    if (currentBridge && pendingBootstrapRestartRef.current) {
      pendingBootstrapRestartRef.current = false
      let active = true
      setInitializing(true)
      void currentBridge.disconnect()
        .then(() => {
          if (active) setRetryCount(count => count + 1)
        })
        .catch((error: unknown) => {
          if (active) setBridgeError(error instanceof Error ? error.message : 'Could not restart the peer network')
        })
      return () => { active = false }
    }

    pendingBootstrapRestartRef.current = false
    let active = true
    const bootstrapRevision = bootstrapRevisionRef.current
    setBridgeError('')
    setInitializing(true)
    const identity = identityController.getState().identity
    void (async () => {
      try {
        const bootstrapAddrs = await getBootstrapAddrs()
        const startedBridge = await ensureBrowserXmppClient({
          bootstrapAddrs,
          dbName: 'xmpp-p2p',
          recoveryPhrase: identity?.recoveryPhraseKeyed ? identity.recoveryPhrase : undefined,
        })
        if (!active || !identityController.isOnboardingComplete()) {
          await startedBridge.disconnect()
          return
        }
        if (bootstrapRevision !== bootstrapRevisionRef.current) {
          await startedBridge.disconnect()
          if (active) setRetryCount(count => count + 1)
        }
      } catch (error: unknown) {
        if (active) setBridgeError(error instanceof Error ? error.message : 'Could not start the peer network')
      } finally {
        if (active) setInitializing(false)
      }
    })()
    return () => { active = false }
  }, [isOnboarding, retryCount])

  useEffect(() => {
    // A started node can dial a queued recipient even when it has no open
    // peer streams yet. Waiting for `connected` here strands the outbox when
    // the recipient is the first peer this node needs to contact.
    if (!bridge) return
    const activeBridge = getBrowserXmppBridge()
    if (!activeBridge?.sendChatMessage) return
    let stopped = false
    let flushing = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryDelay = 5_000
    const flushPending = async () => {
      if (flushing || stopped) return
      flushing = true
      try {
        await flushOutbox(async (msg) => {
          try {
            const peerId = msg.target.toLowerCase().endsWith('@p2p')
              ? msg.target.slice(0, -4)
              : msg.target
            const deliveredId = await activeBridge.sendChatMessage(
              {
                id: msg.chatId,
                type: 'direct',
                name: msg.name,
                handle: msg.target,
                peerAddress: msg.peerAddress ?? (msg.target.toLowerCase().endsWith('@p2p') ? getPeerAddress(peerId) : undefined),
                encrypted: msg.encrypted,
              },
              msg.body,
              { originId: msg.id, attachments: msg.attachments, reply: msg.reply, thread: msg.thread }
            )
            markDirectChatMessageDelivered(msg.chatId, msg.id, deliveredId)
            return deliveredId
          } catch {
            return false
          }
        })
      } finally {
        flushing = false
      }
      if (stopped || getPendingMessages().length === 0) return
      retryTimer = setTimeout(() => { void flushPending() }, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 60_000)
    }
    const unsubscribeServer = activeBridge.onServerConnection((info) => {
      if (info.status !== 'connected') return
      retryDelay = 5_000
      if (retryTimer) clearTimeout(retryTimer)
      void flushPending()
    })
    void flushPending()
    return () => {
      stopped = true
      unsubscribeServer()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [bridge])

  useEffect(() => {
    const path = pathname
    if (!path.startsWith('/onboarding') && !identityController.isOnboardingComplete()) {
      navigate('/onboarding')
    }
  }, [navigate, pathname])

  // Guard against deep-linking into onboarding steps without prerequisites
  const pathForGuard = pathname
  useEffect(() => {
    if (!pathForGuard.startsWith('/onboarding')) return
    const identity = identityController.getState().identity
    const deepLinkPaths = ['/onboarding/recovery', '/onboarding/permissions', '/onboarding/network', '/onboarding/find-network', '/onboarding/preferences', '/onboarding/ready']
    if (deepLinkPaths.includes(pathForGuard) && !identity) {
      navigate('/onboarding')
    }
  }, [pathForGuard, navigate])

  if (isOnboarding) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {!showDiscoveryWarning && (
        <div className="sticky top-0 z-50 flex-shrink-0 flex items-center gap-2 px-4 py-1 text-[10px] font-mono border-b border-border bg-background/80 backdrop-blur">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent' : nodeAvailable ? 'bg-warn' : 'bg-destructive'}`} />
          <span className="text-muted-foreground">
            {connected
              ? `${connectedPeers} peer${connectedPeers !== 1 ? 's' : ''}`
              : nodeAvailable ? 'searching for peers' : 'peer node unavailable'}
          </span>
        </div>
      )}

      {showDiscoveryWarning && !pathname.startsWith('/settings') && (
        <div role="status" className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-warn/20 bg-warn/5 px-4 py-2 text-xs md:hidden">
          <span className="text-muted-foreground">
            No relay configured. Add a peer or set up a relay.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => navigate('/settings')} className="min-h-11 rounded-md px-2 font-medium text-foreground hover:bg-warn/10">
              Set up relay
            </button>
            <button onClick={() => navigate('/contacts')} className="min-h-11 rounded-md border border-warn/30 px-3 font-medium text-foreground hover:bg-warn/10">
              Add peer
            </button>
          </div>
        </div>
      )}

      {(initializing || bridgeError) && (
        <div className={`flex items-center justify-between gap-3 px-4 py-2 text-xs border-b ${bridgeError ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-card text-muted-foreground'}`}>
          <span>{initializing ? 'Starting peer network…' : `Peer network unavailable: ${bridgeError}`}</span>
          {bridgeError && <button onClick={() => setRetryCount((count) => count + 1)} className="min-h-11 shrink-0 rounded-md border border-current/20 px-3 font-medium hover:bg-secondary">Retry</button>}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <NavigationSidebar bootstrapPeersConfigured={bootstrapPeersConfigured} />

        <div className="flex-1 flex flex-col min-w-0 relative max-w-full">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
          <div className="flex-1 flex flex-col min-h-0 relative">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>

          <nav
            aria-label="Mobile navigation"
            className="relative sticky bottom-0 border-t border-border bg-background/90 backdrop-blur z-30 flex-shrink-0 md:hidden"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && showMobileMore) {
                event.preventDefault()
                setShowMobileMore(false)
                mobileMoreTriggerRef.current?.focus()
              }
            }}
          >
            <div className="flex items-center justify-around py-2">
              {NAV.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setShowMobileMore(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
                  }
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-mono">{label}</span>
                </NavLink>
              ))}
              <button
                ref={mobileMoreTriggerRef}
                type="button"
                aria-label="More navigation options"
                aria-controls="mobile-more-menu"
                aria-expanded={showMobileMore}
                onClick={() => setShowMobileMore((open) => !open)}
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 transition-colors ${showMobileMore || ['/contacts', '/drafts', '/settings'].some((path) => pathname.startsWith(path)) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <MoreHorizontal size={20} />
                <span className="text-[10px] font-mono">More</span>
              </button>
            </div>
            {showMobileMore && (
              <div ref={mobileMoreMenuRef} id="mobile-more-menu" className="absolute bottom-full right-2 mb-2 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl">
                {[
                  { to: '/contacts', icon: Users, label: 'Contacts' },
                  { to: '/drafts', icon: FileText, label: 'Drafts' },
                  { to: '/settings', icon: Settings, label: 'Settings' },
                ].map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setShowMobileMore(false)}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive ? 'bg-blue2 text-primary font-semibold' : 'text-foreground hover:bg-secondary'}`
                    }
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </nav>
        </div>
      </div>
    </div>
  )
}
