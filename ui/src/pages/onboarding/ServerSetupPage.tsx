import * as React from 'react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Check, Loader, ExternalLink, RotateCcw, AlertTriangle } from 'lucide-react'
import ProgressDots from '../../components/onboarding/ProgressDots'
import XmppConnectionError from '../../components/XmppConnectionError'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import { ensureBrowserXmppClient, getBootstrapAddrs, getBrowserXmppBridge } from '../../bridge/runtime'
import { fetchPublicServers, PublicServer } from '../../constants'
import { getOptionalWebSocketUrl, normalizeXmppJid } from '../../lib/xmpp-input'

type Tab = 'login' | 'register' | 'skip'

export default function ServerSetupPage() {
  const navigate = useNavigate()
  const { identity } = useIdentityBridge()
  const [initializing, setInitializing] = useState(true)
  const [initError, setInitError] = useState('')
  const [initializationAttempt, setInitializationAttempt] = useState(0)
  const [tab, setTab] = useState<Tab>('skip')
  const [connecting, setConnecting] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectedDomain, setConnectedDomain] = useState('')
  const [bootstrapPeersAvailable, setBootstrapPeersAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [registrationAttempted, setRegistrationAttempted] = useState(false)

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
  const [regEmail, setRegEmail] = useState('')
  const [regServiceUrl, setRegServiceUrl] = useState('')
  const serverTabRefs = React.useRef<Record<Tab, HTMLButtonElement | null>>({
    login: null,
    register: null,
    skip: null,
  })

  const displayName = identity?.displayName ?? 'User'

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab)
    setError('')
    setRegistrationAttempted(false)
  }

  useEffect(() => {
    setInitializing(true)
    setInitError('')
    const bootstrapAddresses = getBootstrapAddrs()
    void bootstrapAddresses
      .then(addresses => setBootstrapPeersAvailable(addresses.length > 0))
      .catch(() => setBootstrapPeersAvailable(false))
    if (getBrowserXmppBridge()) {
      setInitializing(false)
    } else {
      bootstrapAddresses
        .then(bootstrapAddrs => ensureBrowserXmppClient({
          bootstrapAddrs,
          dbName: 'xmpp-p2p',
          nickname: displayName,
          recoveryPhrase: identity?.recoveryPhraseKeyed ? identity.recoveryPhrase : undefined,
        }))
        .then(() => setInitializing(false))
        .catch((err: unknown) => {
          setInitError(err instanceof Error ? err.message : 'Failed to start P2P node')
          setInitializing(false)
        })
    }
    fetchPublicServers().then(list => {
      setServers(list)
      setServersLoading(false)
      if (list.length > 0 && !selectedServer) setSelectedServer(list[0].domain)
    })
  }, [displayName, initializationAttempt])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setConnecting(true)
    try {
      const { jid: normalizedJid, domain: jidDomain } = normalizeXmppJid(jid)
      const bridge = getBrowserXmppBridge()
      if (!bridge?.connectServer) throw new Error('Bridge not available')
      await bridge.connectServer(normalizedJid, password, getOptionalWebSocketUrl(serviceUrl))
      setConnectedDomain(jidDomain)
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegistrationAttempted(false)
    const server = servers.find(s => s.domain === selectedServer)
    if (server?.supportsInBandRegistration !== true) {
      setError(server?.registerUrl
        ? 'This server requires account creation on its website. Register there, then sign in here.'
        : 'This server does not advertise in-app registration. Choose a server that supports it or sign in with an existing account.')
      return
    }
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
      if (!server) throw new Error('Please select a server')
      const { jid: fullJid } = normalizeXmppJid(`${regUsername}@${server.domain}`)
      const bridge = getBrowserXmppBridge()
      if (!bridge?.registerServer) throw new Error('Bridge not available')
      const service = getOptionalWebSocketUrl(regServiceUrl) || server.wsUrl || server.domain
      setRegistrationAttempted(true)
      const registrationFields = regEmail.trim() ? { email: regEmail.trim() } : undefined
      await bridge.registerServer(fullJid, regPassword, service, registrationFields)
      setConnectedDomain(server.domain)
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  const handleContinue = () => {
    navigate('/onboarding/find-network')
  }

  const selectedServerInfo = servers.find(s => s.domain === selectedServer)

  const tabClass = (t: Tab) =>
    `flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-50 ${
      tab === t
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: Tab) => {
    const tabs: Tab[] = ['login', 'register', 'skip']
    let nextIndex = tabs.indexOf(current)
    if (event.key === 'ArrowRight') nextIndex = (nextIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (nextIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    selectTab(nextTab)
    serverTabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Connect to Servers</h1>
          <p className="text-[12px] text-muted-foreground">Optional — connect to an XMPP server or skip and use P2P only</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={4} />
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
              <AlertTriangle size={20} className="text-destructive" />
            </span>
            <p role="alert" className="text-sm text-destructive">{initError}</p>
            <p className="text-xs text-muted-foreground">You can still continue and set up a server later in Settings.</p>
            <button type="button" onClick={() => setInitializationAttempt((attempt) => attempt + 1)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-5 h-[46px] text-sm font-medium text-foreground hover:bg-secondary">
              <RotateCcw size={15} /> Retry P2P startup
            </button>
            <button onClick={handleContinue} className="bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm px-8 transition-opacity hover:opacity-90">
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
            <button onClick={handleContinue} className="mt-6 bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm px-8 transition-opacity hover:opacity-90">
              Continue
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border px-4" role="tablist" aria-label="XMPP server setup">
              <button
                ref={(element) => { serverTabRefs.current.login = element }}
                id="server-setup-tab-login"
                type="button"
                role="tab"
                disabled={connecting || registering}
                aria-selected={tab === 'login'}
                aria-controls="server-setup-panel"
                tabIndex={tab === 'login' ? 0 : -1}
                className={tabClass('login')}
                onClick={() => selectTab('login')}
                onKeyDown={(event) => handleTabKeyDown(event, 'login')}
              >Sign In</button>
              <button
                ref={(element) => { serverTabRefs.current.register = element }}
                id="server-setup-tab-register"
                type="button"
                role="tab"
                disabled={connecting || registering}
                aria-selected={tab === 'register'}
                aria-controls="server-setup-panel"
                tabIndex={tab === 'register' ? 0 : -1}
                className={tabClass('register')}
                onClick={() => selectTab('register')}
                onKeyDown={(event) => handleTabKeyDown(event, 'register')}
              >Create Account</button>
              <button
                ref={(element) => { serverTabRefs.current.skip = element }}
                id="server-setup-tab-skip"
                type="button"
                role="tab"
                disabled={connecting || registering}
                aria-selected={tab === 'skip'}
                aria-controls="server-setup-panel"
                tabIndex={tab === 'skip' ? 0 : -1}
                className={tabClass('skip')}
                onClick={() => selectTab('skip')}
                onKeyDown={(event) => handleTabKeyDown(event, 'skip')}
              >Skip</button>
            </div>

            {bootstrapPeersAvailable === false && tab !== 'skip' && (
              <div role="status" className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-left">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-warn" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Automatic peer discovery is not configured for this deployment. You can still connect using a peer’s full address; the app administrator needs to add bootstrap peers to enable discovery.
                </p>
              </div>
            )}

            <div id="server-setup-panel" role="tabpanel" aria-labelledby={`server-setup-tab-${tab}`} className="px-4 pb-4 pt-4">
              {tab === 'login' && (
                <form onSubmit={handleLogin} aria-busy={connecting} className="space-y-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    Sign in with an existing XMPP account.
                  </p>
                  <input
                    type="text"
                    aria-label="XMPP account JID"
                    placeholder="JID (user@example.com)"
                    value={jid}
                    disabled={connecting}
                    onChange={e => { setJid(e.target.value); setError('') }}
                    required
                    autoComplete="username"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="password"
                    aria-label="XMPP account password"
                    placeholder="Password"
                    value={password}
                    disabled={connecting}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    type="text"
                    aria-label="XMPP server WebSocket URL (optional)"
                    placeholder="Server URL (optional, e.g. wss://example.com:5443/ws)"
                    value={serviceUrl}
                    disabled={connecting}
                    onChange={e => { setServiceUrl(e.target.value); setError('') }}
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                    If discovery fails, enter the server’s secure XMPP WebSocket address (wss://). Native XMPP ports such as 5222 or 5223 cannot be used by a browser.
                  </p>
                  {error && <XmppConnectionError message={error} />}
                  <button
                    type="submit"
                    disabled={connecting || !jid || !password}
                    className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {connecting ? <><Loader size={16} className="animate-spin" /> Connecting…</> : 'Connect'}
                  </button>
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={handleContinue}
                    className="w-full min-h-11 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    Skip this step
                  </button>
                </form>
              )}

              {tab === 'register' && (
                <form onSubmit={handleRegister} aria-busy={registering} className="space-y-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    Create a new account on a public XMPP server.
                  </p>

                  <select
                    aria-label="XMPP registration server"
                    value={selectedServer}
                    disabled={serversLoading || registering}
                    onChange={e => { setSelectedServer(e.target.value); setError('') }}
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

                  {selectedServerInfo?.supportsInBandRegistration !== true && selectedServerInfo && (
                    <div role="status" className="rounded-xl border border-border bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
                      {selectedServerInfo.registerUrl ? (
                        <>
                          This server requires account creation on its website.{' '}
                          <a href={selectedServerInfo.registerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                            Register on {selectedServerInfo.label} <ExternalLink size={11} />
                          </a>
                          {' '}Then return here and sign in.
                        </>
                      ) : (
                        'This server does not advertise in-app registration and has no registration website listed. Choose another server or sign in with an existing account.'
                      )}
                    </div>
                  )}

                  {selectedServerInfo?.supportsInBandRegistration === true && <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      aria-label="New XMPP account username"
                      placeholder="Username"
                      value={regUsername}
                      disabled={registering}
                      onChange={e => { setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, '')); setError('') }}
                      required
                      className="flex-1 px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="flex items-center text-sm text-muted-foreground px-2 bg-secondary rounded-xl">
                      @{selectedServer}
                    </div>
                  </div>

                  <input
                    type="password"
                    aria-label="New XMPP account password"
                    placeholder="Password (min 6 characters)"
                    value={regPassword}
                    disabled={registering}
                    onChange={e => { setRegPassword(e.target.value); setError('') }}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  <input
                    type="password"
                    aria-label="Confirm new XMPP account password"
                    placeholder="Confirm password"
                    value={regConfirm}
                    disabled={registering}
                    onChange={e => { setRegConfirm(e.target.value); setError('') }}
                    required
                    autoComplete="new-password"
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Email address (if required by the server)</span>
                    <input
                      type="email"
                      aria-label="Registration email address"
                      placeholder="you@example.org"
                      value={regEmail}
                      disabled={registering}
                      onChange={e => { setRegEmail(e.target.value); setError('') }}
                      autoComplete="email"
                      className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </label>

                  <input
                    type="text"
                    aria-label="Registration server WebSocket URL (optional)"
                    placeholder="Server URL (optional, e.g. wss://example.com:5443/ws)"
                    value={regServiceUrl}
                    disabled={registering}
                    onChange={e => { setRegServiceUrl(e.target.value); setError('') }}
                    className="w-full px-3 py-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />

                  {error && (
                    <p role="alert" className="text-xs text-destructive">
                      {registrationAttempted && selectedServerInfo?.registerUrl ? (
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
                    disabled={serversLoading || !selectedServer || registering || !regUsername || !regPassword || !regConfirm}
                    className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {registering ? (
                      <><Loader size={16} className="animate-spin" /> Creating account…</>
                    ) : (
                      'Create Account & Connect'
                    )}
                  </button>
                  </>}

                  <button
                    type="button"
                    disabled={registering}
                    onClick={handleContinue}
                    className="w-full min-h-11 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
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
                  {bootstrapPeersAvailable === false && (
                    <p role="status" className="max-w-xs rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-relaxed text-muted-foreground">
                      This deployment has no peer relay configured, so peer messaging will stay offline until you add a relay in Settings or the app operator configures one.
                    </p>
                  )}
                  <button
                    onClick={handleContinue}
                    className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
                  >
                    {bootstrapPeersAvailable === false ? 'Continue without XMPP' : 'Continue with P2P only'}
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
