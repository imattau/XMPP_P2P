import * as React from 'react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Check, Loader, ExternalLink } from 'lucide-react'
import ProgressDots from '../../components/onboarding/ProgressDots'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import { getBrowserXmppBridge } from '../../bridge/runtime'
import { fetchPublicServers, PublicServer } from '../../constants'

type Tab = 'login' | 'register' | 'skip'

export default function ServerSetupPage() {
  const navigate = useNavigate()
  const { identity } = useIdentityBridge()
  const [initializing, setInitializing] = useState(true)
  const [initError, setInitError] = useState('')
  const [tab, setTab] = useState<Tab>('skip')
  const [connecting, setConnecting] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectedDomain, setConnectedDomain] = useState('')
  const [error, setError] = useState('')

  // Login form
  const [jid, setJid] = useState('')
  const [password, setPassword] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')

  // Register form
  const [servers, setServers] = useState<PublicServer[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [selectedServer, setSelectedServer] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')

  const displayName = identity?.displayName ?? 'User'

  useEffect(() => {
    if (getBrowserXmppBridge()) {
      setInitializing(false)
      return
    }
    const bootstrapAddrs = window.__XMPP_P2P_CONFIG__?.bootstrapAddrs ?? []
    const client = window.XmppP2P?.createBrowserXmppClient
    if (client) {
      client({ bootstrapAddrs, dbName: 'xmpp-p2p', nickname: displayName })
        .then(() => setInitializing(false))
        .catch((err: unknown) => {
          setInitError(err instanceof Error ? err.message : 'Failed to start P2P node')
          setInitializing(false)
        })
    } else {
      setInitError('XMPP client not available')
      setInitializing(false)
    }
    fetchPublicServers().then(list => {
      setServers(list)
      setServersLoading(false)
      if (list.length > 0 && !selectedServer) setSelectedServer(list[0].domain)
    })
  }, [displayName])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setConnecting(true)
    try {
      const bridge = getBrowserXmppBridge()
      if (!bridge?.connectServer) throw new Error('Bridge not available')
      await bridge.connectServer(jid, password, serviceUrl || undefined)
      const domain = jid.includes('@') ? jid.split('@')[1] : jid
      setConnectedDomain(domain)
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (regPassword !== regConfirm) {
      setError('Passwords do not match')
      return
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setError('')
    setRegistering(true)
    try {
      const server = servers.find(s => s.domain === selectedServer)
      if (!server) throw new Error('Please select a server')
      const fullJid = `${regUsername}@${server.domain}`
      const bridge = getBrowserXmppBridge()
      if (!bridge?.registerServer) throw new Error('Bridge not available')
      await bridge.registerServer(fullJid, regPassword, server.wsUrl || server.domain)
      setConnectedDomain(server.domain)
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  const handleContinue = () => {
    navigate('/onboarding/preferences')
  }

  const selectedServerInfo = servers.find(s => s.domain === selectedServer)

  const tabClass = (t: Tab) =>
    `flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors cursor-pointer ${
      tab === t
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Connect to Servers</h1>
          <p className="text-[12px] text-muted-foreground">Optional — connect to an XMPP server or skip and use P2P only</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={5} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {initializing ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3">
            <Loader size={24} className="text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Starting P2P node…</p>
          </div>
        ) : initError ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center px-4">
            <span className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Loader size={20} className="text-destructive" />
            </span>
            <p className="text-sm text-destructive">{initError}</p>
            <p className="text-xs text-muted-foreground">You can still continue and set up a server later in Settings.</p>
            <button onClick={handleContinue} className="mt-4 bg-primary text-white rounded-xl h-[50px] font-semibold text-sm px-8 transition-opacity hover:opacity-90">
              Continue
            </button>
          </div>
        ) : connected ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center px-4">
            <span className="w-14 h-14 rounded-full bg-green2 flex items-center justify-center">
              <Check size={28} className="text-accent" />
            </span>
            <h2 className="text-[20px] font-semibold text-foreground mt-2">Connected to {connectedDomain}</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your XMPP connection is active. Messages to {connectedDomain} contacts will be routed through the server.
            </p>
            <button onClick={handleContinue} className="mt-6 bg-primary text-white rounded-xl h-[50px] font-semibold text-sm px-8 transition-opacity hover:opacity-90">
              Continue
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border px-4">
              <div className={tabClass('login')} onClick={() => setTab('login')}>Sign In</div>
              <div className={tabClass('register')} onClick={() => setTab('register')}>Create Account</div>
              <div className={tabClass('skip')} onClick={() => setTab('skip')}>Skip</div>
            </div>

            <div className="px-4 pb-4 pt-4">
              {tab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    Sign in with an existing XMPP account.
                  </p>
                  <input
                    type="text"
                    placeholder="JID (user@example.com)"
                    value={jid}
                    onChange={e => { setJid(e.target.value); setError('') }}
                    required
                    autoComplete="username"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="text"
                    placeholder="Server URL (optional, e.g. wss://example.com:5443/ws)"
                    value={serviceUrl}
                    onChange={e => { setServiceUrl(e.target.value); setError('') }}
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <button
                    type="submit"
                    disabled={connecting || !jid || !password}
                    className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {connecting ? <><Loader size={16} className="animate-spin" /> Connecting…</> : 'Connect'}
                  </button>
                  <button
                    type="button"
                    onClick={handleContinue}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    Skip this step
                  </button>
                </form>
              )}

              {tab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    Create a new account on a public XMPP server.
                  </p>

                  <select
                    value={selectedServer}
                    onChange={e => { setSelectedServer(e.target.value); setError('') }}
                    disabled={serversLoading}
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  >
                    {serversLoading ? (
                      <option value="">Loading servers…</option>
                    ) : servers.length === 0 ? (
                      <option value="">No servers available</option>
                    ) : (
                      servers.map(s => (
                        <option key={s.domain} value={s.domain}>{s.label}{s.category ? ` (Cat ${s.category})` : ''}</option>
                      ))
                    )}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Username"
                      value={regUsername}
                      onChange={e => { setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, '')); setError('') }}
                      required
                      className="flex-1 px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="flex items-center text-sm text-muted-foreground px-2 bg-secondary rounded-xl">
                      @{selectedServer}
                    </div>
                  </div>

                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    value={regPassword}
                    onChange={e => { setRegPassword(e.target.value); setError('') }}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={regConfirm}
                    onChange={e => { setRegConfirm(e.target.value); setError('') }}
                    required
                    autoComplete="new-password"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  {error && (
                    <p className="text-xs text-destructive">
                      {selectedServerInfo?.registerUrl ? (
                        <>{error}. You can register on the web:{' '}
                          <a href={selectedServerInfo.registerUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline ml-1">
                            Register on web <ExternalLink size={10} />
                          </a>
                        </>
                      ) : (
                        error
                      )}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={registering || !regUsername || !regPassword || !regConfirm}
                    className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {registering ? (
                      <><Loader size={16} className="animate-spin" /> Creating account…</>
                    ) : (
                      'Create Account & Connect'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleContinue}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    Skip this step
                  </button>
                </form>
              )}

              {tab === 'skip' && (
                <div className="flex flex-col items-center pt-8 gap-4 text-center">
                  <p className="text-sm text-muted-foreground max-w-xs">
                    You can connect to an XMPP server later from Settings to access the standard XMPP network.
                    For now, you'll use the peer-to-peer network only.
                  </p>
                  <button
                    onClick={handleContinue}
                    className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
                  >
                    Continue with P2P only
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
