import * as React from 'react'
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import {
  Bell, Lock, Moon, LogOut, ChevronRight, ArrowLeft, Zap,
  Server, Plus, Check, Loader, Wifi, WifiOff,
  ChevronDown,
} from 'lucide-react'
import { getBrowserXmppBridge } from '../bridge/runtime'
import { useServerBridge } from '../bridge/useServerBridge'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { identityController } from '../bridge/identity/controller'

export default function SettingsPage() {
  const navigate = useNavigate()
  const {
    connections, connecting, federationEnabled,
    gatewayOnline, gatewayConnections,
    connectServer, disconnectServer, setFederationEnabled,
  } = useServerBridge()
  const { connected, connectedPeers } = useConnectionBridge()

  const [collapsed, setCollapsed] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [settingsSection, setSettingsSection] = useState<string | null>(null)
  const [jid, setJid] = useState('')
  const [password, setPassword] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [addError, setAddError] = useState('')

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    try {
      await connectServer(jid, password, serviceUrl || undefined)
      setShowAddForm(false)
      setJid('')
      setPassword('')
      setServiceUrl('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const isServerConnected = connections.some(c => c.status === 'connected')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center gap-3 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Settings</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Network Status */}
        <div className="border-b border-border bg-card">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Wifi size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">Network Status</span>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={`w-2 h-2 rounded-full ${getBrowserXmppBridge() ? 'bg-accent' : 'bg-destructive'}`} />
              <span className="text-muted-foreground w-28 shrink-0">Bridge</span>
              <span className={getBrowserXmppBridge() ? 'text-accent' : 'text-destructive'}>
                {getBrowserXmppBridge() ? 'Available' : 'Not available'}
              </span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-accent' : 'bg-destructive'}`} />
              <span className="text-muted-foreground w-28 shrink-0">P2P Node</span>
              <span className={connected ? 'text-accent' : 'text-destructive'}>
                {connected ? `${connectedPeers} peer${connectedPeers !== 1 ? 's' : ''}` : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={`w-2 h-2 rounded-full ${gatewayOnline ? 'bg-accent' : 'text-muted-foreground'}`} />
              <span className="text-muted-foreground w-28 shrink-0">XMPP Server</span>
              <span className={gatewayOnline ? 'text-accent' : 'text-muted-foreground'}>
                {gatewayOnline
                  ? `Online — ${gatewayConnections.length} server${gatewayConnections.length !== 1 ? 's' : ''}`
                  : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* XMPP Server Connection */}
        <div className="border-b border-border bg-card">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-secondary text-left"
          >
            <Server size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium flex-1">XMPP Server</span>
            <ChevronDown size={14} className={`text-muted-foreground/40 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>

          {!collapsed && (
            <>
              {/* Federation enable toggle */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Wifi size={16} className={federationEnabled ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-sm flex-1">Federation</span>
                <button
                  onClick={() => setFederationEnabled(!federationEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    federationEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    federationEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Active connection */}
              {connections.length > 0 && (
                <div className="border-b border-border">
                  {connections.map((conn) => (
                    <div key={conn.domain} className="flex items-center gap-3 px-4 py-3 text-sm">
                      {conn.status === 'connected' ? (
                        <Wifi size={14} className="text-green-500" />
                      ) : conn.status === 'connecting' ? (
                        <Loader size={14} className="text-yellow-500 animate-spin" />
                      ) : conn.status === 'error' ? (
                        <WifiOff size={14} className="text-red-500" />
                      ) : (
                        <WifiOff size={14} className="text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{conn.domain}</div>
                        <div className="text-xs text-muted-foreground capitalize">{conn.status}{conn.error ? `: ${conn.error}` : ''}</div>
                      </div>
                      {(conn.status === 'connected' || conn.status === 'error') && (
                        <button
                          onClick={() => disconnectServer()}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Disconnect"
                        >
                          <WifiOff size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add form / Login */}
              {!isServerConnected && (showAddForm ? (
                <form onSubmit={handleConnect} className="px-4 py-3 space-y-3 border-b border-border">
                  <input
                    type="text"
                    placeholder="JID (user@example.com)"
                    value={jid}
                    onChange={e => setJid(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="text"
                    placeholder="Server URL (optional, e.g. wss://example.com:5443/ws)"
                    value={serviceUrl}
                    onChange={e => setServiceUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {addError && <p className="text-xs text-destructive">{addError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={connecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {connecting ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                      {connecting ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddForm(false); setAddError('') }}
                      className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-secondary text-left text-muted-foreground hover:text-foreground text-sm"
                >
                  <Plus size={16} />
                  <span>Connect to XMPP server</span>
                </button>
              ))}

              {isServerConnected && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Connected. Messages to server contacts will be routed through the XMPP connection.
                </div>
              )}
            </>
          )}
        </div>

        {/* Settings section content */}
        {settingsSection && (
          <div className="border-b border-border bg-card">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <button onClick={() => setSettingsSection(null)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <ArrowLeft size={16} />
              </button>
              <span className="text-sm font-medium">{settingsSection}</span>
            </div>
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">Settings section coming soon</p>
              <p className="font-mono text-[10px] text-muted-foreground/50">{settingsSection} preferences will be configurable here.</p>
            </div>
          </div>
        )}

        {/* Existing settings rows */}
        {!settingsSection && (
          <div className="border-b border-border bg-card">
            {[
              { icon: Bell, label: 'Notifications', section: 'Notifications' },
              { icon: Lock, label: 'Privacy & security', section: 'Privacy & Security' },
              { icon: Moon, label: 'Appearance', section: 'Appearance' },
            ].map(({ icon: Icon, label, section }) => (
              <button key={label} onClick={() => setSettingsSection(section)}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 transition-colors hover:bg-secondary text-left text-foreground/80">
                <Icon size={16} />
                <span className="text-sm">{label}</span>
                <ChevronRight size={14} className="ml-auto text-muted-foreground/40" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 px-4">
          <button
            onClick={() => {
              const bridge = getBrowserXmppBridge()
              if (bridge?.disconnect) {
                void bridge.disconnect()
              }
              identityController.resetIdentity()
              navigate('/onboarding')
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border transition-colors hover:bg-destructive/10 text-destructive text-left"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </main>
    </div>
  )
}
