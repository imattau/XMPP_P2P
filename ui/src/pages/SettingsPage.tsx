import * as React from 'react'
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import {
  Bell, Lock, Moon, LogOut, ChevronRight, ArrowLeft, Zap,
  Server, Plus, X, Check, Loader, Save, Trash2, Wifi, WifiOff,
  Search, ChevronDown,
} from 'lucide-react'
import { useServerBridge } from '../bridge/useServerBridge'

export default function SettingsPage() {
  const navigate = useNavigate()
  const {
    connections, savedConfigs, connecting, federationEnabled,
    connectComponent, disconnectComponent, setS2SDomain, setFederationEnabled,
    resolveComponentEndpoint, saveComponentConfig, removeComponentConfig,
  } = useServerBridge()

  const [collapsed, setCollapsed] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [serverDomain, setServerDomain] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('5347')
  const [secret, setSecret] = useState('')
  const [componentDomain, setComponentDomain] = useState('')
  const [addError, setAddError] = useState('')
  const [saveToConfig, setSaveToConfig] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [s2sDomainInput, setS2sDomainInput] = useState('')

  const handleDiscover = useCallback(async () => {
    if (!serverDomain) return
    setDiscovering(true)
    setAddError('')
    try {
      const endpoint = await resolveComponentEndpoint(serverDomain)
      setHost(endpoint.host)
      setPort(String(endpoint.port))
      if (!componentDomain) setComponentDomain(serverDomain)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setDiscovering(false)
    }
  }, [serverDomain, resolveComponentEndpoint, componentDomain])

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    try {
      await connectComponent(host, Number(port), secret, componentDomain)
      if (saveToConfig) {
        await saveComponentConfig(componentDomain, secret, host, Number(port))
      }
      setShowAddForm(false)
      setServerDomain('')
      setHost('')
      setPort('5347')
      setSecret('')
      setComponentDomain('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const handleConnectSaved = async (cfg: typeof savedConfigs[number]) => {
    if (cfg.domain === componentDomain) {
      try { await connectComponent(cfg.host, cfg.port, '', cfg.domain) } catch { /* needs secret */ }
    }
  }

  const handleS2SDomainBlur = () => {
    setS2SDomain(s2sDomainInput)
  }

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
        {/* Federated Servers */}
        <div className="border-b border-border bg-card">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-secondary text-left"
          >
            <Server size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium flex-1">Federated Servers</span>
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

              {/* Active connections */}
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
                        <div className="text-xs text-muted-foreground capitalize">{conn.type} &middot; {conn.status}{conn.error ? `: ${conn.error}` : ''}</div>
                      </div>
                      {(conn.status === 'connected' || conn.status === 'error') && (
                        <button
                          onClick={() => disconnectComponent()}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Disconnect"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add form */}
              {showAddForm ? (
                <form onSubmit={handleConnect} className="px-4 py-3 space-y-3 border-b border-border">
                  {/* Domain with discover */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Server domain (e.g. jabber.example.org)"
                      value={serverDomain}
                      onChange={e => setServerDomain(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleDiscover}
                      disabled={discovering || !serverDomain}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                      title="Auto-discover host & port via DNS SRV"
                    >
                      {discovering ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
                      Discover
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Host"
                      value={host}
                      onChange={e => setHost(e.target.value)}
                      required
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <input
                      type="number"
                      placeholder="Port"
                      value={port}
                      onChange={e => setPort(e.target.value)}
                      required
                      className="w-24 px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Component domain (e.g. p2p.your-server.org)"
                    value={componentDomain}
                    onChange={e => setComponentDomain(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />

                  <input
                    type="password"
                    placeholder="Shared secret"
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />

                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveToConfig}
                      onChange={e => setSaveToConfig(e.target.checked)}
                      className="rounded border-border"
                    />
                    Save configuration for later
                  </label>
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
                  <span>Add XMPP server</span>
                </button>
              )}

              {/* S2S domain */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-muted-foreground shrink-0">S2S domain</span>
                <input
                  type="text"
                  placeholder="e.g. p2p.example.org"
                  value={s2sDomainInput}
                  onChange={e => setS2sDomainInput(e.target.value)}
                  onBlur={handleS2SDomainBlur}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </>
          )}
        </div>

        {/* Saved configs */}
        {!collapsed && savedConfigs.length > 0 && (
          <div className="border-b border-border bg-card">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Save size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">Saved Configurations</span>
            </div>
            {savedConfigs.map((cfg) => (
              <div key={cfg.domain} className="flex items-center gap-3 px-4 py-3 text-sm border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{cfg.domain}</div>
                  <div className="text-xs text-muted-foreground">{cfg.host}:{cfg.port}</div>
                </div>
                <button
                  onClick={() => handleConnectSaved(cfg)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Connect"
                >
                  <Wifi size={14} />
                </button>
                <button
                  onClick={() => removeComponentConfig(cfg.domain)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Forget"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Existing settings rows */}
        <div className="border-b border-border bg-card">
          {[
            { icon: Bell, label: 'Notifications' },
            { icon: Lock, label: 'Privacy & security' },
            { icon: Moon, label: 'Appearance' },
          ].map(({ icon: Icon, label }) => (
            <button key={label}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 transition-colors hover:bg-secondary text-left text-foreground/80">
              <Icon size={16} />
              <span className="text-sm">{label}</span>
              <ChevronRight size={14} className="ml-auto text-muted-foreground/40" />
            </button>
          ))}
        </div>

        <div className="mt-4 px-4">
          <button
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
