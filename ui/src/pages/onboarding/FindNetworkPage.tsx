import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Check, Globe, Hash, Loader, Search, UserPlus, Users } from 'lucide-react'
import ProgressDots from '../../components/onboarding/ProgressDots'
import { getBootstrapAddrs, saveBootstrapAddrs, useBrowserXmppBridge } from '../../bridge/runtime'
import { useRosterBridge } from '../../bridge/useRosterBridge'
import { canonicalDirectChatId } from '../../bridge/direct-chat-history'
import { normalizeXmppJid } from '../../lib/xmpp-input'
import { normalizeBootstrapAddress } from '../../lib/bootstrap-address'
import { isAndroidNative } from '../../../../src/core/native-platform.js'
import { isElectronShell } from '../../native-shell'
import { createGroupChatSession, getGroupChatSession, removeGroupChatSession } from '../chat-session'

export default function FindNetworkPage() {
  const navigate = useNavigate()
  const runtime = useBrowserXmppBridge()
  const { contacts, loading, loadError, available, refresh, addContact } = useRosterBridge()
  const [query, setQuery] = React.useState('')
  const [jid, setJid] = React.useState('')
  const [roomId, setRoomId] = React.useState('')
  const [working, setWorking] = React.useState<'contact' | 'room' | null>(null)
  const [error, setError] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [bootstrapAddress, setBootstrapAddress] = React.useState('')
  const [bootstrapSaved, setBootstrapSaved] = React.useState(false)

  React.useEffect(() => {
    void getBootstrapAddrs().then((addresses) => {
      if (addresses[0]) setBootstrapAddress(addresses[0])
    })
  }, [])

  let normalizedJid = ''
  try {
    normalizedJid = normalizeXmppJid(jid).jid.split('/')[0]
  } catch { /* keep the contact action disabled until a valid JID is entered */ }
  const validJid = Boolean(normalizedJid)
  const contactAlreadyAdded = contacts.some((contact) => canonicalDirectChatId(contact.jid) === canonicalDirectChatId(normalizedJid))
  const normalizedRoomId = roomId.trim().replace(/@muc\.p2p$/i, '').toLowerCase()
  const validRoomId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(normalizedRoomId)
  const filteredContacts = contacts.filter((contact) => {
    const term = query.trim().toLowerCase()
    return !term || [contact.name, contact.nickname, contact.jid].some((value) => value?.toLowerCase().includes(term))
  })
  const nativeTcpAvailable = isAndroidNative() || isElectronShell()
  const normalizedBootstrapAddress = normalizeBootstrapAddress(bootstrapAddress, nativeTcpAvailable)
  const validBootstrapAddress = Boolean(normalizedBootstrapAddress)
  const bootstrapAddressError = bootstrapAddress.trim() && !validBootstrapAddress
    ? nativeTcpAvailable
      ? 'Enter a valid root TCP or WebSocket address ending in /p2p/peer-id.'
      : 'Enter a valid root WebSocket address ending in /p2p/peer-id. Use wss:// for remote relays.'
    : ''

  const handleSaveBootstrap = (event: React.FormEvent) => {
    event.preventDefault()
    if (!normalizedBootstrapAddress) return
    saveBootstrapAddrs([normalizedBootstrapAddress])
    setBootstrapAddress(normalizedBootstrapAddress)
    setBootstrapSaved(true)
  }

  const handleAddContact = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validJid || working) return
    setWorking('contact')
    setError('')
    setStatus('')
    try {
      await addContact(normalizedJid, normalizedJid.split('@')[0])
      setJid('')
      const isP2pContact = normalizedJid.toLowerCase().endsWith('@p2p')
      setStatus(isP2pContact || runtime?.isServerConnected()
        ? `${normalizedJid} added to your contacts.`
        : `${normalizedJid} saved. Connect an XMPP server in Settings to message this contact.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this contact.')
    } finally {
      setWorking(null)
    }
  }

  const handleJoinRoom = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validRoomId || working) return
    if (!runtime) {
      setError('The peer network is still starting. Try again in a moment.')
      return
    }
    setWorking('room')
    setError('')
    setStatus('')
    let createdSession = false
    try {
      const existing = getGroupChatSession(normalizedRoomId)
      await runtime.joinMucRoom(normalizedRoomId, runtime.getLocalJid().split('@')[0])
      if (!existing) {
        const settings = await runtime.getMucRoomSettings(normalizedRoomId).catch(() => undefined)
        createGroupChatSession(normalizedRoomId, [], normalizedRoomId, {
          encrypted: settings?.defaultSecure ?? true,
          localJid: runtime.getLocalJid(),
          type: 'muc',
        })
        createdSession = true
      }
      setRoomId('')
      setStatus(`Joined #${normalizedRoomId}.`)
    } catch (cause) {
      if (createdSession) removeGroupChatSession(normalizedRoomId)
      setError(cause instanceof Error ? cause.message : 'Could not join this room.')
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Find your network</h1>
          <p className="text-[12px] text-muted-foreground">Connect using a contact or room address</p>
        </div>
        <div className="mt-3"><ProgressDots current={5} /></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nexus has no public people or community directory. Add someone with their P2P address or XMPP JID. Standard XMPP contacts need a connected server account; you can also connect one later in Settings. Join a P2P room using an ID shared with you.
        </p>
        <form onSubmit={handleSaveBootstrap} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Globe size={16} className="text-primary" /> Peer network relay</div>
          <p className="text-xs leading-relaxed text-muted-foreground">{nativeTcpAvailable ? 'A TCP or WebSocket address bootstraps the peer network. Native builds can dial root TCP addresses directly; browser clients need WebSockets.' : 'A relay address connects this browser to the P2P network and gives peers a route back to you. Ask your operator for a root WebSocket multiaddress; addresses with an HTTP path such as /ws cannot route WebRTC peer connections.'}</p>
          <input value={bootstrapAddress} onChange={(event) => { setBootstrapAddress(event.target.value); setBootstrapSaved(false) }}
            type="text" autoComplete="off" spellCheck={false} placeholder="/dns4/relay.example/tcp/443/wss/p2p/…" aria-label="Peer network relay address"
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          {bootstrapAddressError && <p role="status" className="text-[11px] text-destructive">{bootstrapAddressError}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">{bootstrapSaved ? 'Saved. The peer network will reconnect with this relay when setup is complete.' : 'You can continue setup without a relay, but peer messaging will stay offline.'}</p>
            <button type="submit" disabled={!validBootstrapAddress} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">Save relay</button>
          </div>
        </form>
        {!runtime && <p role="status" className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">The peer network is unavailable. You can continue setup and add contacts or join rooms later.</p>}

        <form onSubmit={(event) => void handleAddContact(event)} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><UserPlus size={16} className="text-primary" /> Add a contact</div>
          <label className="block">
            <span className="sr-only">Contact XMPP address</span>
            <input value={jid} onChange={(event) => { setJid(event.target.value); setError(''); setStatus('') }}
              type="text" autoComplete="off" placeholder="name@example.org" aria-label="Contact XMPP address"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          </label>
          <button type="submit" disabled={!validJid || contactAlreadyAdded || Boolean(working) || !runtime}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
            {working === 'contact' ? <Loader size={15} className="animate-spin" /> : <UserPlus size={15} />}
            {working === 'contact' ? 'Adding contact…' : contactAlreadyAdded ? 'Already in contacts' : 'Add contact'}
          </button>
        </form>

        <form onSubmit={(event) => void handleJoinRoom(event)} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Hash size={16} className="text-primary" /> Join a P2P room</div>
          <p className="text-xs text-muted-foreground">Enter a room ID shared by its creator. Room IDs are public addresses.</p>
          <label className="block">
            <span className="sr-only">P2P room ID</span>
            <input value={roomId} onChange={(event) => { setRoomId(event.target.value.toLowerCase()); setError(''); setStatus('') }}
              type="text" autoComplete="off" placeholder="room-id or room-id@muc.p2p" aria-label="P2P room ID"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          </label>
          <button type="submit" disabled={!validRoomId || Boolean(working) || !runtime}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40">
            {working === 'room' ? <Loader size={15} className="animate-spin" /> : <Users size={15} />}
            {working === 'room' ? 'Joining…' : 'Join room'}
          </button>
        </form>

        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Users size={16} className="text-muted-foreground" /> Your contacts</div>
          {available && loadError && (
            <div role="alert" className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{loadError}</p>
              <button onClick={refresh} className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10">Retry</button>
            </div>
          )}
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
            <Search size={14} className="text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your contacts…" aria-label="Search your contacts"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          {loading && contacts.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground" role="status">Loading contacts…</p>
          ) : filteredContacts.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {filteredContacts.map((contact) => (
                <li key={contact.jid} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{(contact.nickname || contact.name || contact.jid)[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{contact.nickname || contact.name || contact.jid}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{contact.jid}</span>
                  </span>
                  {contact.online && <span className="flex items-center gap-1 text-[10px] text-accent"><Check size={12} /> Online</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
              {loadError && available
                ? 'Your contacts could not be loaded.'
                : query
                  ? 'No contacts match your search.'
                  : 'No contacts yet. Add someone by their XMPP address above.'}
            </p>
          )}
        </section>

        {(error || status) && <p role={error ? 'alert' : 'status'} className={`text-xs ${error ? 'text-destructive' : 'text-accent'}`}>{error || status}</p>}
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button onClick={() => navigate('/onboarding/preferences')} disabled={Boolean(working)} className="w-full rounded-xl bg-primary h-[50px] font-semibold text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          Continue
        </button>
      </div>
    </div>
  )
}
