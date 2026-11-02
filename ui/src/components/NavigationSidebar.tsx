import { NavLink } from 'react-router'
import { Home, Hash, PlusSquare, MessageCircle, User, Users, Settings, Zap, FileText } from 'lucide-react'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useBrowserXmppBridge } from '../bridge/runtime'

const NAV = [
  { to: '/', icon: Home, label: 'Feed' },
  { to: '/topics', icon: Hash, label: 'Topics' },
  { to: '/compose', icon: PlusSquare, label: 'Write' },
  { to: '/drafts', icon: FileText, label: 'Drafts' },
  { to: '/chats', icon: MessageCircle, label: 'Chats' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/profile', icon: User, label: 'Profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function NavigationSidebar({ bootstrapPeersConfigured }: { bootstrapPeersConfigured: boolean | null }) {
  const { connected, connectedPeers, nodeAvailable } = useConnectionBridge()
  const { identity } = useIdentityBridge()
  const runtime = useBrowserXmppBridge()
  const localJid = runtime?.getLocalJid()

  return (
    <div className="hidden md:flex w-56 flex-col border-r border-border bg-card flex-shrink-0 h-full">
      <div className="px-5 pt-5 pb-4">
        <div className="text-[20px] font-bold tracking-tight text-foreground">Nexus</div>
        <div className="text-[11px] font-mono text-muted-foreground">XMPP P2P</div>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 px-3 rounded-lg text-sm transition-colors ${
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
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent' : nodeAvailable ? 'bg-warn' : 'bg-destructive'}`} />
            <span className={`text-[12px] font-mono ${connected ? 'text-accent' : nodeAvailable ? 'text-warn' : 'text-destructive'}`}>
              {connected
                ? `${connectedPeers} peer${connectedPeers !== 1 ? 's' : ''} connected`
                : nodeAvailable && bootstrapPeersConfigured === false
                  ? 'No relay configured'
                  : nodeAvailable ? 'Looking for peers' : 'Node unavailable'}
            </span>
          </div>
          <div className="text-[12px] font-mono text-muted-foreground mt-0.5">
            {nodeAvailable && bootstrapPeersConfigured === false
              ? 'Add a peer directly or configure a relay'
              : nodeAvailable ? 'Peer discovery in progress' : 'Start or retry the peer node'}
          </div>
          {nodeAvailable && bootstrapPeersConfigured === false && (
            <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10px]">
              <NavLink to="/contacts" className="inline-flex min-h-11 items-center px-1 text-primary hover:underline">Add peer</NavLink>
              <NavLink to="/settings" className="inline-flex min-h-11 items-center px-1 text-primary hover:underline">Set up relay</NavLink>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground flex-shrink-0">
          {identity?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground truncate">{identity?.displayName ?? 'XMPP P2P'}</div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">{localJid ?? (identity?.handle ? `@${identity.handle}` : 'Identity unavailable')}</div>
        </div>
      </div>
    </div>
  )
}
