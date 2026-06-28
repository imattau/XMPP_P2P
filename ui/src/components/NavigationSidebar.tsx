import { NavLink } from 'react-router'
import { Home, Hash, PlusSquare, MessageCircle, User, Settings, Zap } from 'lucide-react'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'

const NAV = [
  { to: '/', icon: Home, label: 'Feed' },
  { to: '/topics', icon: Hash, label: 'Topics' },
  { to: '/compose', icon: PlusSquare, label: 'Compose' },
  { to: '/chats', icon: MessageCircle, label: 'Chats' },
  { to: '/profile', icon: User, label: 'Profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function NavigationSidebar() {
  const { connected, connectedPeers } = useConnectionBridge()
  const { identity } = useIdentityBridge()

  return (
    <div className="w-56 flex flex-col border-r border-border bg-card flex-shrink-0 h-full">
      <div className="px-5 pt-5 pb-4">
        <div className="text-[20px] font-bold tracking-tight text-foreground">Nexus</div>
        <div className="text-[11px] font-mono text-muted-foreground">XMPP P2P</div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue2 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="rounded-xl bg-secondary p-3.5">
          <div className="text-[13px] font-semibold text-foreground">Peer node</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-destructive'}`} />
            <span className="text-[12px] font-mono text-accent">
              {connected ? `Online · ${connectedPeers} peers` : 'Disconnected'}
            </span>
          </div>
          <div className="text-[12px] font-mono text-muted-foreground mt-0.5">
            {connected ? 'DHT synced' : 'Connecting...'}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground flex-shrink-0">
          {identity?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground truncate">{identity?.displayName ?? 'XMPP P2P'}</div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">{identity?.jid ?? 'you@jabber.de'}</div>
        </div>
      </div>
    </div>
  )
}
