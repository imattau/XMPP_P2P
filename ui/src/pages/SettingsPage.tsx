import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  Bell, Lock, Moon, LogOut, ChevronRight, ArrowLeft, Globe,
  Server, Plus, Check, Loader, Wifi, WifiOff,
  ChevronDown,
} from 'lucide-react'
import { getBootstrapAddrs, getBrowserXmppBridge, getDesktopRelayConfig, getDesktopRelayStatus, getDhtEnabled, getNostrBootstrapConfig, saveBootstrapAddrs, saveDesktopRelayConfig, saveDhtEnabled, saveNostrBootstrapConfig, type DesktopRelayConfig, type DesktopRelayStatus } from '../bridge/runtime'
import { useServerBridge } from '../bridge/useServerBridge'
import { useConnectionBridge } from '../bridge/useConnectionBridge'
import { identityController } from '../bridge/identity/controller'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import Toggle from '../components/onboarding/Toggle'
import XmppConnectionError from '../components/XmppConnectionError'
import { requestNotificationPermission } from '../bridge/useNotifications'
import { getOptionalWebSocketUrl, normalizeXmppJid } from '../lib/xmpp-input'
import { normalizeBootstrapAddress } from '../lib/bootstrap-address'
import { normalizeNostrBootstrapConfig, normalizeNostrRelayUrl } from '../../../src/core/nostr-bootstrap.js'
import { isElectronShell } from '../native-shell'
import { isAndroidNative } from '../../../src/core/native-platform.js'
import { clearSavedXmppCredentials, saveXmppCredentials } from '../lib/xmpp-credential-vault'

const XMPP_ACCOUNT_SETTINGS_KEY = 'xmpp-p2p:server-account-settings'

function loadXmppAccountSettings(): { jid: string; serviceUrl: string } | undefined {
  try {
    const raw = localStorage.getItem(XMPP_ACCOUNT_SETTINGS_KEY)
    if (!raw) return undefined
    const value = JSON.parse(raw) as { jid?: unknown; serviceUrl?: unknown }
    if (typeof value.jid !== 'string') return undefined
    return { jid: value.jid, serviceUrl: typeof value.serviceUrl === 'string' ? value.serviceUrl : '' }
  } catch {
    return undefined
  }
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const {
    connections, connecting, disconnecting,
    gatewayOnline, gatewayConnections,
    connectServer, disconnectServer,
  } = useServerBridge()
  const { connected, connectedPeers, nodeAvailable } = useConnectionBridge()
  const { permissions, preferences, setPermissions, setPreferences, setTheme } = useIdentityBridge()
  const notificationsGranted = permissions.notifications
    && typeof Notification !== 'undefined'
    && Notification.permission === 'granted'

  const [collapsed, setCollapsed] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [settingsSection, setSettingsSection] = useState<string | null>(null)
  const [jid, setJid] = useState('')
  const [password, setPassword] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [addError, setAddError] = useState('')
  const [serverActionError, setServerActionError] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [bootstrapAddress, setBootstrapAddress] = useState('')
  const [bootstrapSaved, setBootstrapSaved] = useState(false)
  const [bootstrapPeersConfigured, setBootstrapPeersConfigured] = useState<boolean | null>(null)
  const [nostrRelays, setNostrRelays] = useState('')
  const [nostrSaved, setNostrSaved] = useState(false)
  const [desktopRelay, setDesktopRelay] = useState<DesktopRelayConfig>(() => getDesktopRelayConfig())
  const [desktopRelaySaved, setDesktopRelaySaved] = useState(false)
  const [dhtEnabled, setDhtEnabled] = useState(() => getDhtEnabled())
  const [desktopRelayStatus, setDesktopRelayStatus] = useState<DesktopRelayStatus>()
  const signOutTriggerRef = useRef<HTMLButtonElement>(null)
  const signOutDialogWasOpen = useRef(false)

  useEffect(() => {
    const saved = loadXmppAccountSettings()
    if (!saved) return
    setJid(saved.jid)
    setServiceUrl(saved.serviceUrl)
  }, [])

  useEffect(() => {
    if (confirmSignOut) {
      signOutDialogWasOpen.current = true
    } else if (signOutDialogWasOpen.current) {
      signOutDialogWasOpen.current = false
      signOutTriggerRef.current?.focus()
    }
  }, [confirmSignOut])

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    try {
      const { jid: normalizedJid } = normalizeXmppJid(jid)
      const normalizedService = getOptionalWebSocketUrl(serviceUrl, isAndroidNative() || isElectronShell())
      await connectServer(normalizedJid, password, normalizedService)
      let securePasswordSaved = false
      try {
        securePasswordSaved = await saveXmppCredentials({ jid: normalizedJid, password, service: normalizedService })
      } catch (error) {
        console.warn('[XMPP] Connected, but could not securely save the password:', error)
      }
      try {
        localStorage.setItem(XMPP_ACCOUNT_SETTINGS_KEY, JSON.stringify({ jid: normalizedJid, serviceUrl: normalizedService ?? '' }))
      } catch {
        // Keep the active XMPP connection even if browser storage is unavailable.
      }
      if (!securePasswordSaved) {
        setServerActionError('Connected, but the XMPP password could not be saved securely. You will need to reconnect after restarting.')
        setShowAddForm(false)
        setCollapsed(false)
        setPassword('')
        return
      }
      setShowAddForm(false)
      setJid('')
      setPassword('')
      setServiceUrl('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const handleDisconnect = async () => {
    setServerActionError('')
    try {
      await disconnectServer()
      await clearSavedXmppCredentials()
    } catch (error) {
      setServerActionError(error instanceof Error ? error.message : 'Could not disconnect from the XMPP server.')
    }
  }

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError('')
    try {
      await getBrowserXmppBridge()?.disconnect()
      await clearSavedXmppCredentials()
      try { localStorage.removeItem(XMPP_ACCOUNT_SETTINGS_KEY) } catch { /* optional saved account label */ }
      identityController.resetIdentity()
      navigate('/onboarding')
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not stop the peer network')
      setSigningOut(false)
    }
  }

  const handleSignOutDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !signingOut) {
      setConfirmSignOut(false)
      setSignOutError('')
      return
    }
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const isServerConnected = connections.some(c => c.status === 'connected')
  const nativeTcpAvailable = isAndroidNative() || isElectronShell()
  const normalizedBootstrapAddress = normalizeBootstrapAddress(bootstrapAddress, nativeTcpAvailable)
  const validBootstrapAddress = Boolean(normalizedBootstrapAddress)
  const bootstrapAddressError = bootstrapAddress.trim() && !validBootstrapAddress
    ? nativeTcpAvailable
      ? 'Enter a valid root TCP or WebSocket address ending in /p2p/peer-id.'
      : 'Enter a valid root WebSocket address ending in /p2p/peer-id. Use wss:// for remote relays.'
    : ''

  useEffect(() => {
    let active = true
    const refreshBootstrapStatus = () => {
      void getBootstrapAddrs().then((addresses) => {
        if (active) setBootstrapPeersConfigured(addresses.length > 0)
      })
    }
    void getBootstrapAddrs().then((addresses) => {
      if (!active) return
      setBootstrapAddress(addresses[0] ?? '')
      setBootstrapPeersConfigured(addresses.length > 0)
    })
    window.addEventListener('xmpp-p2p:bootstrap-config-changed', refreshBootstrapStatus)
    return () => {
      active = false
      window.removeEventListener('xmpp-p2p:bootstrap-config-changed', refreshBootstrapStatus)
    }
  }, [])

  useEffect(() => {
    if (!isElectronShell()) return
    let active = true
    const refresh = () => { void getDesktopRelayStatus().then(status => { if (active && status) setDesktopRelayStatus(status) }) }
    refresh()
    const timer = window.setInterval(refresh, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let active = true
    void getNostrBootstrapConfig().then((config) => {
      if (active) setNostrRelays(config.relayUrls.join('\n'))
    })
    return () => { active = false }
  }, [])

  const handleSaveBootstrap = (event: React.FormEvent) => {
    event.preventDefault()
    if (!normalizedBootstrapAddress) return
    saveBootstrapAddrs([normalizedBootstrapAddress])
    setBootstrapAddress(normalizedBootstrapAddress)
    setBootstrapSaved(true)
  }

  const normalizedNostrConfig = normalizeNostrBootstrapConfig({ relayUrls: nostrRelays })
  const nostrConfigHasInvalidEntries = nostrRelays.split(/[\n,;]+/).some((entry) => entry.trim() && !normalizeNostrRelayUrl(entry))
  const handleSaveNostr = (event: React.FormEvent) => {
    event.preventDefault()
    if (nostrConfigHasInvalidEntries) return
    saveNostrBootstrapConfig(normalizedNostrConfig)
    setNostrRelays(normalizedNostrConfig.relayUrls.join('\n'))
    setNostrSaved(true)
  }

  const relayPortValid = Number.isInteger(desktopRelay.listenPort) && desktopRelay.listenPort > 0 && desktopRelay.listenPort <= 64535
  const relayPublicPortValid = Number.isInteger(desktopRelay.publicPort) && desktopRelay.publicPort > 0 && desktopRelay.publicPort <= 65535
  const publicHost = desktopRelay.publicHost.trim().replace(/^\[|\]$/g, '').toLowerCase()
  const privateIpv4 = (() => {
    const parts = publicHost.split('.').map(Number)
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  })()
  const privateIpv6 = publicHost === '::' || publicHost === '::1' || /^(fc|fd|fe80:|ff)/.test(publicHost)
  const publicHostValid = Boolean(publicHost) && !privateIpv4 && !privateIpv6
    && !publicHost.endsWith('.localhost') && !publicHost.endsWith('.local')
  const relayHostValid = !desktopRelay.publishToNostr || publicHostValid
  const relayLimitsValid = Number.isInteger(desktopRelay.maxReservations) && desktopRelay.maxReservations >= 1 && desktopRelay.maxReservations <= 256
  const handleSaveDesktopRelay = (event: React.FormEvent) => {
    event.preventDefault()
    if (!relayPortValid || !relayPublicPortValid || !relayHostValid || !relayLimitsValid) return
    saveDesktopRelayConfig(desktopRelay)
    setDesktopRelaySaved(true)
    window.setTimeout(() => setDesktopRelaySaved(false), 5000)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center px-4 py-2.5">
        {settingsSection ? (
          <div className="flex items-center gap-3">
            <button onClick={() => setSettingsSection(null)} aria-label="Back to settings" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-sm font-semibold text-foreground">{settingsSection}</h1>
          </div>
        ) : (
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-4">
        {!settingsSection && <>
        {/* Network Status */}
        <div className="border-b border-border bg-card">
          <div className="flex items-center gap-3 px-4 py-3">
            <Wifi size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">Peer network</span>
            <span aria-hidden="true" className={`ml-auto h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-accent' : nodeAvailable ? 'bg-warn' : 'bg-destructive'}`} />
            <span role="status" aria-live="polite" aria-atomic="true" className={`text-xs ${connected ? 'text-accent' : nodeAvailable ? 'text-warn' : 'text-destructive'}`}>
              {connected
                ? `${connectedPeers} connected`
                : nodeAvailable
                  ? bootstrapPeersConfigured === false ? 'No relay' : 'Discovering peers'
                  : 'Unavailable'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Distributed hash table (DHT)</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Supports peer discovery and features such as offline message delivery. Changing this restarts the peer network.</p>
          </div>
          <Toggle label="Enable distributed hash table" checked={dhtEnabled} onChange={enabled => { setDhtEnabled(enabled); saveDhtEnabled(enabled) }} />
        </div>

        <details className="border-b border-border bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-foreground">
            <Globe size={15} className="text-primary" />
            <span className="flex-1">Peer network relay</span>
            {normalizedBootstrapAddress && <span className="text-[11px] font-normal text-muted-foreground">Configured</span>}
            <ChevronDown size={14} className="text-muted-foreground/50" />
          </summary>
          <form onSubmit={handleSaveBootstrap} className="space-y-3 px-4 pb-3">
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-primary">Relay address requirements</summary>
            <p className="pb-2 text-xs leading-relaxed text-muted-foreground">{nativeTcpAvailable ? 'Use a root TCP or WebSocket multiaddress from your network operator. Native transports can dial TCP peers directly; WebSocket addresses also support browser clients.' : 'Use a root WebSocket multiaddress from your network operator. Addresses with an HTTP path such as /ws cannot route WebRTC peer connections.'} Saving restarts the peer network; active XMPP sessions may need to reconnect.</p>
          </details>
          <input value={bootstrapAddress} onChange={(event) => { setBootstrapAddress(event.target.value); setBootstrapSaved(false) }}
            type="text" autoComplete="off" spellCheck={false} placeholder="/dns4/relay.example/tcp/443/wss/p2p/…" aria-label="Peer network relay address"
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          {bootstrapAddressError && <p role="status" className="text-[11px] text-destructive">{bootstrapAddressError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="min-w-0 text-[11px] text-muted-foreground">{bootstrapSaved
              ? 'Saved. Reconnecting to the peer network…'
              : <>Current: <span className="break-all">{normalizedBootstrapAddress ?? 'no relay configured'}</span></>}</p>
            <button type="submit" disabled={!validBootstrapAddress || bootstrapSaved} className="min-h-11 w-full shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">Save and reconnect</button>
          </div>
          </form>
        </details>

        {isElectronShell() && <details className="border-b border-border bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-foreground">
            <Wifi size={15} className="text-primary" />
            <span className="flex-1">Relay from this desktop</span>
            <span className="text-[11px] font-normal text-muted-foreground">{desktopRelayStatus?.running ? `${desktopRelayStatus.reservations} reserved` : desktopRelay.enabled ? 'Starting' : 'Off'}</span>
            <ChevronDown size={14} className="text-muted-foreground/50" />
          </summary>
          <form onSubmit={handleSaveDesktopRelay} className="space-y-3 px-4 pb-4">
            <div className="flex items-center gap-3 rounded-lg bg-background px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">Allow this desktop to relay peer connections</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Forwards end-to-end encrypted peer traffic. Your connection uses bandwidth while peers are relayed.</p>
              </div>
              <Toggle label="Allow this desktop to relay peer connections" checked={desktopRelay.enabled} onChange={enabled => { setDesktopRelay(current => ({ ...current, enabled })); setDesktopRelaySaved(false) }} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">Local TCP port
                <input type="number" min={1} max={64535} value={desktopRelay.listenPort} onChange={event => { setDesktopRelay(current => ({ ...current, listenPort: Number(event.target.value) })); setDesktopRelaySaved(false) }} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground" />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">Maximum peer reservations
                <input type="number" min={1} max={256} value={desktopRelay.maxReservations} onChange={event => { setDesktopRelay(current => ({ ...current, maxReservations: Number(event.target.value) })); setDesktopRelaySaved(false) }} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground" />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">Public DNS name or IP address (optional)
                <input value={desktopRelay.publicHost} onChange={event => { setDesktopRelay(current => ({ ...current, publicHost: event.target.value })); setDesktopRelaySaved(false) }} placeholder="relay.example.org" autoComplete="off" spellCheck={false} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground" />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">Public TCP port
                <input type="number" min={1} max={65535} value={desktopRelay.publicPort} onChange={event => { setDesktopRelay(current => ({ ...current, publicPort: Number(event.target.value) })); setDesktopRelaySaved(false) }} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground" />
              </label>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">Public relaying requires this TCP port to be reachable through your firewall and router. The app cannot verify port forwarding automatically. Relayed connections are limited to 15 minutes and 256 MB per connection.</p>
            <div className="flex items-center gap-3 rounded-lg bg-background px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">Advertise this relay through Nostr</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Publishes a signed, expiring address announcement to your configured Nostr relays. Nostr helps peers find the address; peer traffic still goes through this desktop. When switched off, an existing announcement can remain visible for up to 24 hours.</p>
              </div>
              <Toggle label="Advertise this relay through Nostr" checked={desktopRelay.publishToNostr} onChange={publishToNostr => { setDesktopRelay(current => ({ ...current, publishToNostr })); setDesktopRelaySaved(false) }} />
            </div>
            {desktopRelay.publishToNostr && !publicHostValid && <p role="status" className="text-[11px] text-destructive">Enter a public DNS name or globally reachable IP address before publishing.</p>}
            {desktopRelayStatus?.enabled && !desktopRelayStatus.running && <p role="status" className="text-[11px] text-destructive">The relay service did not start. Check that the local TCP port is available.</p>}
            {desktopRelaySaved && <p role="status" className="text-[11px] text-accent">Saved. Restarting the peer network…</p>}
            {desktopRelayStatus?.publishing && <p className="text-[11px] text-muted-foreground">Nostr address publishing is active.</p>}
            <button type="submit" disabled={!relayPortValid || !relayPublicPortValid || !relayHostValid || !relayLimitsValid} className="min-h-11 w-full rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">Save and restart peer network</button>
          </form>
        </details>}

        <details className="border-b border-border bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-foreground">
            <Globe size={15} className="text-primary" />
            <span className="flex-1">Nostr peer discovery</span>
            <span className="text-[11px] font-normal text-muted-foreground">{normalizedNostrConfig.relayUrls.length} relays</span>
            <ChevronDown size={14} className="text-muted-foreground/50" />
          </summary>
          <form onSubmit={handleSaveNostr} className="space-y-3 px-4 pb-3">
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-primary">How Nostr peer discovery works</summary>
            <p className="pb-2 text-xs leading-relaxed text-muted-foreground">Nostr relays provide potential bootstrap addresses. Nexus filters for its dedicated event kind and identifier, checks the event signature, expiry and address shape, then attempts a libp2p connection. Publisher identity is not allowlisted; Nostr relays do not carry peer traffic.</p>
          </details>
          <label className="block space-y-1 text-xs text-muted-foreground">Nostr WebSocket relays
            <textarea value={nostrRelays} onChange={(event) => { setNostrRelays(event.target.value); setNostrSaved(false) }} rows={2} spellCheck={false} placeholder="wss://relay.example" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          </label>
          {nostrConfigHasInvalidEntries && <p role="status" className="text-[11px] text-destructive">Use secure wss:// relay URLs (ws:// is allowed only on localhost).</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-[11px] text-muted-foreground">{nostrSaved ? 'Saved. Reconnecting to the peer network…' : `${normalizedNostrConfig.relayUrls.length} relay(s) · any publisher using the Nexus bootstrap identifier`}</p>
            <button type="submit" disabled={nostrSaved || nostrConfigHasInvalidEntries} className="min-h-11 w-full shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">Save Nostr relays</button>
          </div>
          </form>
        </details>

        {/* XMPP Server Connection */}
        <div className="border-b border-border bg-card">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            className="min-h-11 w-full flex items-center gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-secondary text-left"
          >
            <Server size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">XMPP Server</span>
            <span className={`ml-auto text-xs ${gatewayOnline ? 'text-accent' : 'text-muted-foreground'}`}>
              {gatewayOnline ? `${gatewayConnections.length} online` : 'Disconnected'}
            </span>
            <ChevronDown size={14} className={`text-muted-foreground/40 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>

          {!collapsed && (
            <>
              {/* Active connection */}
              {connections.length > 0 && (
                <div className="border-b border-border">
                  {connections.map((conn) => (
                    <div key={conn.domain} className="flex items-center gap-3 px-4 py-3 text-sm">
                      {conn.status === 'connected' ? (
                        <Wifi size={14} className="text-accent" />
                      ) : conn.status === 'connecting' ? (
                        <Loader size={14} className="text-warn animate-spin" />
                      ) : conn.status === 'error' ? (
                        <WifiOff size={14} className="text-destructive" />
                      ) : (
                        <WifiOff size={14} className="text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{conn.domain}</div>
                        <div className="text-xs text-muted-foreground capitalize">{conn.status}{conn.error ? `: ${conn.error}` : ''}</div>
                      </div>
                      {(conn.status === 'connected' || conn.status === 'error') && (
                        <button
                          type="button"
                          onClick={() => void handleDisconnect()}
                          disabled={connecting || disconnecting}
                          aria-label={conn.status === 'error' ? `Clear failed connection to ${conn.domain}` : `Disconnect from ${conn.domain}`}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:cursor-wait disabled:opacity-50"
                          title={disconnecting ? 'Disconnecting…' : conn.status === 'error' ? 'Clear failed connection' : 'Disconnect'}
                        >
                          {disconnecting ? <Loader size={14} className="animate-spin" /> : <WifiOff size={14} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {serverActionError && <p role="alert" className="border-b border-border px-4 py-2 text-xs text-destructive">{serverActionError}</p>}

              {/* Add form / Login */}
              {!isServerConnected && (showAddForm ? (
                <form onSubmit={handleConnect} className="px-4 py-3 space-y-3 border-b border-border">
                  <input
                    type="text"
                    aria-label="XMPP account JID"
                    placeholder="JID (user@example.com)"
                    value={jid}
                    onChange={e => setJid(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full px-3 py-3 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="password"
                    aria-label="XMPP account password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-3 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <details className="text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3">Advanced connection settings</summary>
                    <input
                      type="text"
                      aria-label="XMPP server URL (optional)"
                      placeholder={isAndroidNative() || isElectronShell() ? 'Server URL (wss://…, xmpp://… or xmpps://…)' : 'Server URL (optional, e.g. wss://example.com:5443/ws)'}
                      value={serviceUrl}
                      onChange={e => setServiceUrl(e.target.value)}
                      className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </details>
                  {addError && <XmppConnectionError message={addError} />}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={connecting}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 sm:flex-none"
                    >
                      {connecting ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                      {connecting ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddForm(false); setAddError('') }}
                      className="min-h-11 flex-1 rounded-lg border border-border px-4 text-sm text-muted-foreground hover:text-foreground transition-colors sm:flex-none"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="min-h-11 w-full flex items-center gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-secondary text-left text-muted-foreground hover:text-foreground text-sm"
                >
                  <Plus size={16} />
                  <span>{jid ? `Connect to ${jid}` : 'Connect to XMPP server'}</span>
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
        </>}

        {/* Settings section content */}
        {settingsSection && (
          <div className="border-b border-border bg-card">
            {settingsSection === 'Notifications' && <div className="p-4 space-y-3">
              <PreferenceToggle label="Message notifications" description="Notify when a direct or group message arrives" checked={preferences.messageNotifications && notificationsGranted} pendingLabel="Waiting for browser permission…" onChange={async (checked) => {
                if (checked) {
                  const granted = await requestNotificationPermission()
                  if (!granted) {
                    const preferenceSaved = setPreferences({ messageNotifications: false })
                    const permissionSaved = setPermissions({ notifications: false })
                    return preferenceSaved && permissionSaved
                  }
                  if (!setPermissions({ notifications: true })) return false
                }
                return setPreferences({ messageNotifications: checked })
              }} />
              <PreferenceToggle label="Feed notifications" description="Notify when a new feed post arrives" checked={preferences.feedNotifications && notificationsGranted} pendingLabel="Waiting for browser permission…" onChange={async (checked) => {
                if (checked) {
                  const granted = await requestNotificationPermission()
                  if (!granted) {
                    const preferenceSaved = setPreferences({ feedNotifications: false })
                    const permissionSaved = setPermissions({ notifications: false })
                    return preferenceSaved && permissionSaved
                  }
                  if (!setPermissions({ notifications: true })) return false
                }
                return setPreferences({ feedNotifications: checked })
              }} />
              {!notificationsGranted && <p role="status" className="text-xs text-muted-foreground">
                {typeof Notification === 'undefined'
                  ? 'This browser does not support notifications.'
                  : Notification.permission === 'denied'
                    ? 'Notifications are blocked by your browser. Allow them in site permissions to receive alerts.'
                    : Notification.permission === 'granted'
                      ? 'Notifications are turned off for this app. Turn on an alert above to enable them.'
                      : 'Browser permission has not been granted. Turn on an alert above to request access.'}
              </p>}
            </div>}
            {settingsSection === 'Privacy & Security' && <div className="p-4 space-y-3">
              <PreferenceToggle label="Photos and files" description="Allow uploads for messages, article covers, and your profile" checked={permissions.photosAndFiles} onChange={(checked) => setPermissions({ photosAndFiles: checked })} />
              <button type="button" onClick={() => navigate('/settings/recovery')} className="w-full rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-secondary">
                <span className="block text-sm font-medium text-foreground">Recovery phrase & backup</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Review your recovery words or download an encrypted backup.</span>
              </button>
            </div>}
            {settingsSection === 'Appearance' && <div className="p-4">
              <div role="group" aria-label="Appearance" className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={preferences.theme === 'system'} onClick={() => setTheme('system')}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${preferences.theme === 'system' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                  System
                </button>
                <button type="button" aria-pressed={preferences.theme === 'dark'} onClick={() => setTheme('dark')}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${preferences.theme === 'dark' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                  Dark
                </button>
              </div>
            </div>}
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

        {!settingsSection && <div className="mt-4 px-4">
          <button
            ref={signOutTriggerRef}
            onClick={() => { setSignOutError(''); setConfirmSignOut(true) }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border transition-colors hover:bg-destructive/10 text-destructive text-left"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>}
      </main>

      {confirmSignOut && (
        <div className="safe-area-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            aria-describedby="sign-out-description"
            onKeyDown={handleSignOutDialogKeyDown}
            className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <LogOut size={17} />
              </div>
              <div>
                <h2 id="sign-out-title" className="text-base font-semibold text-foreground">Sign out of Nexus?</h2>
                <p id="sign-out-description" className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  This clears your local profile and saved recovery phrase. Review your{' '}
                  <a href="/settings/recovery" onClick={(event) => { event.preventDefault(); setConfirmSignOut(false); navigate('/settings/recovery') }} className="text-primary underline underline-offset-2">recovery options</a>{' '}
                  before signing out so you can restore this identity later.
                </p>
              </div>
            </div>
            {signOutError && <p role="alert" className="mt-3 text-xs text-destructive">{signOutError}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                disabled={signingOut}
                onClick={() => { setConfirmSignOut(false); setSignOutError('') }}
                className="min-h-11 w-full rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="min-h-11 w-full rounded-lg bg-destructive px-3 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50 sm:w-auto"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreferenceToggle({ label, description, checked, onChange, pendingLabel }: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void | boolean | Promise<void | boolean>
  pendingLabel?: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const handleChange = async (next: boolean) => {
    if (pending) return
    setPending(true)
    setError('')
    try {
      const saved = await onChange(next)
      if (saved === false) setError('Could not save this setting. Check browser storage and try again.')
    } catch {
      setError('Could not save this setting. Try again.')
    } finally {
      setPending(false)
    }
  }

  return <div className="flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      {pending && <p role="status" className="mt-1 text-xs text-primary">{pendingLabel ?? 'Saving…'}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
    <Toggle label={label} checked={checked} disabled={pending} onChange={(value) => { void handleChange(value) }} />
  </div>
}
