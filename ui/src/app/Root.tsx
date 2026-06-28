import { Outlet, NavLink } from 'react-router'
import { Home, Hash, PlusSquare, MessageCircle, User } from 'lucide-react'
import { useConnectionBridge } from '../bridge/useConnectionBridge'

const NAV = [
  { to: '/', icon: Home, label: 'Feed' },
  { to: '/topics', icon: Hash, label: 'Topics' },
  { to: '/compose', icon: PlusSquare, label: 'Post' },
  { to: '/chats', icon: MessageCircle, label: 'Chats' },
  { to: '/profile', icon: User, label: 'Profile' }
]

export default function Root() {
  const { connected, connectedPeers } = useConnectionBridge()

  return (
    <div
      className="h-screen overflow-hidden bg-background text-foreground"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="flex justify-center h-screen">
        <div className="relative w-full max-w-[430px] flex flex-col h-screen border-x border-border bg-background/92 backdrop-blur">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
          <div className="sticky top-0 z-40 flex-shrink-0 flex items-center gap-2 px-4 py-1 text-[10px] font-mono border-b border-border bg-background/80 backdrop-blur">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-destructive'}`} />
            <span className="text-muted-foreground">
              {connected ? `${connectedPeers} peer${connectedPeers !== 1 ? 's' : ''}` : 'disconnected'}
            </span>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
            <Outlet />
          </div>

          <nav className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur z-30 flex-shrink-0">
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
