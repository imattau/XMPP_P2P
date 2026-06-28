import { Suspense, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router'
import { Home, Hash, PlusSquare, MessageCircle, User, Zap } from 'lucide-react'
import { getBrowserXmppBridge } from '../bridge/runtime'
import NavigationSidebar from '../components/NavigationSidebar'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { identityController } from '../bridge/identity/controller'
import { useNotifications } from '../bridge/useNotifications'
import { flushOutbox, getPendingMessages } from '../lib/message-queue'

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
  { to: '/compose', icon: PlusSquare, label: 'Post' },
  { to: '/chats', icon: MessageCircle, label: 'Chats' },
  { to: '/profile', icon: User, label: 'Profile' }
]

export default function Root() {
  const { connected, connectedPeers } = useConnectionBridge()
  const navigate = useNavigate()
  const isOnboarding = window.location.pathname.startsWith('/onboarding')
  useNotifications()

  useEffect(() => {
    if (!connected) return
    const bridge = getBrowserXmppBridge()
    if (!bridge?.sendChatMessage) return
    void flushOutbox(async (msg) => {
      try {
        await bridge.sendChatMessage(
          { id: msg.chatId, type: 'direct', name: msg.target, handle: msg.target },
          msg.body,
          { attachments: msg.attachments as any }
        )
        return true
      } catch {
        return false
      }
    })
  }, [connected])

  useEffect(() => {
    const path = window.location.pathname
    if (!path.startsWith('/onboarding') && !identityController.isOnboardingComplete()) {
      navigate('/onboarding')
    }
  }, [navigate])

  if (isOnboarding) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <Outlet />
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="sticky top-0 z-50 flex-shrink-0 flex items-center gap-2 px-4 py-1 text-[10px] font-mono border-b border-border bg-background/80 backdrop-blur">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-destructive'}`} />
        <span className="text-muted-foreground">
          {connected ? `${connectedPeers} peer${connectedPeers !== 1 ? 's' : ''}` : 'disconnected'}
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        <NavigationSidebar />

        <div className="flex-1 flex flex-col min-w-0 relative max-w-full">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
          <div className="flex-1 flex flex-col min-h-0 relative">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>

          <nav className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur z-30 flex-shrink-0 md:hidden">
            <div className="flex items-center justify-around py-2">
              {NAV.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
                  }
                >
                  <Icon size={20} />
                  <span className="text-[9px] font-mono">{label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  )
}
