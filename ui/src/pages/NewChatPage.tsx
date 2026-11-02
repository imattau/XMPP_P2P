import * as React from 'react'
import { multiaddr } from '@multiformats/multiaddr'
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { getBrowserXmppBridge } from '../bridge'
import { createGroupChatSession, createPrivateGroupRoomName, getGroupChatSession } from './chat-session'
import { useRosterBridge } from '../bridge/useRosterBridge'
import { canonicalDirectChatId } from '../bridge/direct-chat-history'
import { normalizeXmppJid } from '../lib/xmpp-input'
import { savePeerAddress } from '../lib/peer-addresses'
import { emitToast } from '../lib/toast-events'
import {
  ArrowLeft, Search, User, Users, Hash, X, Plus, Check, UserPlus,
  Shield, Zap, ChevronRight,
} from 'lucide-react'

type FlowType = 'direct' | 'group' | 'muc'

interface Contact {
  id: string
  name: string
  handle: string
  avatar?: string
  server: string
  online?: boolean
  verified?: boolean
}

function ContactRow({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors text-left border-b border-border last:border-0">
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary border border-border">
          {contact.avatar
            ? <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-foreground">{contact.name[0]}</div>
          }
        </div>
        <span aria-hidden="true" className={`absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-background ${contact.online ? 'bg-accent' : 'bg-muted-foreground/40'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground truncate">{contact.name}</span>
          {contact.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground truncate block">{contact.handle}</span>
        <span className="sr-only">{contact.online ? 'Online' : 'Offline'}</span>
      </div>
      <ChevronRight size={14} aria-hidden="true" className="text-muted-foreground/40 flex-shrink-0" />
    </button>
  )
}

function DirectFlow() {
  const navigate = useNavigate()
  const { contacts, addContact, serverConnected } = useRosterBridge()
  const [query, setQuery] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const recentContacts: Contact[] = contacts.map((contact) => ({
    id: contact.jid,
    name: contact.nickname || contact.name || contact.jid.split('@')[0],
    handle: contact.jid,
    server: contact.jid.split('@')[1] || 'p2p',
    online: contact.online,
  }))

  const filtered = recentContacts.filter((c) =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.handle.toLowerCase().includes(query.toLowerCase())
  )

  const normalizedQuery = query.trim()
  let bareJid = ''
  try {
    bareJid = normalizeXmppJid(normalizedQuery).jid.split('/')[0]
  } catch { /* invalid JIDs remain ordinary search text */ }
  let peerAddressPeerId: string | undefined
  if (normalizedQuery.startsWith('/')) {
    try {
      multiaddr(normalizedQuery)
      peerAddressPeerId = normalizedQuery.match(/\/p2p\/([^/]+)$/)?.[1]
    } catch { /* malformed multiaddresses stay in the search field */ }
  }
  const isPeerAddress = Boolean(peerAddressPeerId)
  const isJid = Boolean(bareJid)
  const isServerJid = isJid && !bareJid.toLowerCase().endsWith('@p2p')
  const canStartChat = !isServerJid || serverConnected
  const canAddContact = !isServerJid || serverConnected
  const isContact = contacts.some((contact) => canonicalDirectChatId(contact.jid) === canonicalDirectChatId(bareJid))

  const handleAddContact = async () => {
    if (!isJid || isContact || addingContact) return
    setAddingContact(true)
    try {
      await addContact(bareJid, bareJid.split('@')[0])
      const isP2pContact = bareJid.toLowerCase().endsWith('@p2p')
      emitToast(isP2pContact || serverConnected
        ? 'Contact added'
        : 'Contact saved. Connect an XMPP server in Settings to message this JID.', isP2pContact || serverConnected ? 'success' : 'info')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not add contact', 'error')
    } finally {
      setAddingContact(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input autoFocus aria-label="Search contacts, enter a JID, or paste a peer address" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts, enter a JID, or paste a peer address…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear contact search" className="text-muted-foreground hover:text-foreground"><X size={13} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isPeerAddress && peerAddressPeerId && (
          <div className="px-4 py-3 border-b border-border space-y-2">
            <button type="button" onClick={() => {
              savePeerAddress(peerAddressPeerId, normalizedQuery)
              navigate(`/chat/${encodeURIComponent(`${peerAddressPeerId}@p2p`)}?address=${encodeURIComponent(normalizedQuery)}`)
            }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/30 hover:bg-primary/10 transition-colors text-left">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20 flex-shrink-0"><User size={16} className="text-primary" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Start peer conversation</p>
                <p className="font-mono text-[10px] text-muted-foreground truncate">{peerAddressPeerId}</p>
              </div>
              <ChevronRight size={14} className="text-primary flex-shrink-0" />
            </button>
            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">This address is used for the first connection. Encrypted messaging may require the peer’s P2P ID contact first.</p>
          </div>
        )}
        {isJid && (
          <div className="px-4 py-3 border-b border-border space-y-2">
            <button type="button" disabled={!canStartChat} onClick={() => navigate(`/chat/${encodeURIComponent(bareJid)}`)}
              aria-describedby={!canStartChat ? 'server-jid-connection-hint' : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/30 hover:bg-primary/10 transition-colors text-left disabled:cursor-not-allowed disabled:opacity-50">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20 flex-shrink-0">
                <User size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{bareJid}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{canStartChat ? 'Start conversation with this JID' : 'Connect an XMPP server to message this JID'}</p>
              </div>
              <ChevronRight size={14} className="text-primary flex-shrink-0" />
            </button>
            {!canStartChat && <p id="server-jid-connection-hint" className="sr-only">Connect an XMPP server in Settings to start this conversation.</p>}
            {isContact ? (
              <div className="flex items-center gap-1.5 px-1 text-xs text-accent" role="status">
                <Check size={14} /> Already in your contacts
              </div>
            ) : (
              <button
                type="button"
                onClick={() => canAddContact ? void handleAddContact() : navigate('/settings')}
                disabled={addingContact}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-wait disabled:opacity-50"
              >
                <UserPlus size={14} /> {addingContact ? 'Adding contact…' : canAddContact ? 'Add to contacts' : 'Connect XMPP in Settings'}
              </button>
            )}
          </div>
        )}

        <div>
          <div className="px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {query ? 'Results' : 'Recent contacts'}
            </span>
          </div>
          {filtered.map((c) => (
            <ContactRow key={c.id} contact={c} onOpen={() => navigate(`/chat/${encodeURIComponent(c.handle)}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No contacts found.</p>
              <p className="font-mono text-[11px] text-muted-foreground mt-1">
                {serverConnected
                  ? 'Enter a full JID or paste a peer address to start a conversation.'
                  : 'Enter a full JID or paste a peer address. Connect an XMPP server in Settings to message server contacts.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupFlow() {
  const navigate = useNavigate()
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const canCreate = groupName.trim().length > 0 && !creating
  const handleCreate = async () => {
    if (!canCreate) return

    const bridge = getBrowserXmppBridge()
    if (!bridge?.createPrivateMucRoom) {
      emitToast('Connect to the peer network before creating a group', 'error')
      return
    }
    const localJid = bridge.getLocalJid()
    setCreating(true)
    const sessionId = createPrivateGroupRoomName(groupName)
    try {
      const subject = 'P2P group room · 1 member'
      await bridge.createPrivateMucRoom(sessionId, {
        topic: subject,
        nick: localJid.split('@')[0],
        communityId: sessionId,
        defaultMode: 'secure',
      })
      const session = createGroupChatSession(groupName.trim(), [], sessionId, { encrypted: true, localJid, role: 'owner' })
      emitToast(`Room ready to share: ${session.chat.id}@muc.p2p`, 'success')
      navigate(`/chat/${encodeURIComponent(session.chat.id)}`)
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not create the group', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-4 border-b border-border flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Group name</p>
        <input aria-label="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. Protocol Working Group"
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors" />
      </div>
      <div className="flex-1 px-4 py-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Users size={16} className="text-primary" /> P2P group room</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Create the room first, then share its room ID with people you want to join. Anyone who learns the ID can try to join; the network does not support invitations or private membership lists.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Secure mode is on by default. It encrypts messages but does not restrict who can join. Sending requires a joined member to have an OMEMO device, and members without one cannot read secure messages.</p>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        <button disabled={!canCreate} onClick={() => void handleCreate()}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          <Users size={15} /> {creating ? 'Creating…' : 'Create group room'}
        </button>
      </div>
    </div>
  )
}

function MucFlow() {
  const navigate = useNavigate()
  const [roomInput, setRoomInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [discoveringRooms, setDiscoveringRooms] = useState(false)
  const [serverRooms, setServerRooms] = useState<Array<{ roomJid: string; name: string; serviceJid: string }>>([])
  const [browseMessage, setBrowseMessage] = useState('')
  const [error, setError] = useState('')
  const input = roomInput.trim()
  const roomId = input.replace(/@muc\.p2p$/i, '').toLowerCase()
  let serverRoomJid = ''
  try {
    const normalized = normalizeXmppJid(input).jid
    if (!normalized.toLowerCase().endsWith('@p2p') && !normalized.toLowerCase().endsWith('@muc.p2p')) {
      serverRoomJid = normalized.toLowerCase()
    }
  } catch { /* input can still be a P2P room ID */ }
  const isValidRoom = Boolean(serverRoomJid) || /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(roomId)

  const handleJoin = async (serverRoomOverride?: string) => {
    if ((!serverRoomOverride && !isValidRoom) || joining) return
    const bridge = getBrowserXmppBridge()
    if (!bridge) {
      setError('Connect to the peer network before joining a room.')
      return
    }
    setJoining(true)
    setError('')
    try {
      const targetServerRoomJid = serverRoomOverride ?? serverRoomJid
      if (targetServerRoomJid) {
        if (!bridge.isServerConnected()) {
          setError('Connect your XMPP server in Settings before joining this room.')
          return
        }
        if (!bridge.joinServerMuc) {
          setError('XMPP room support is unavailable in this browser.')
          return
        }
        const accountJid = bridge.getServerJid?.()
        const session = getGroupChatSession(targetServerRoomJid) ?? createGroupChatSession(targetServerRoomJid.split('@')[0], [], targetServerRoomJid, {
          encrypted: false,
          localJid: accountJid ?? bridge.getLocalJid(),
          type: 'muc',
          roomJid: targetServerRoomJid,
          systemMessage: 'Joined XMPP room',
        })
        navigate(`/chat/${encodeURIComponent(session.chat.id)}`)
        return
      }
      let room = getGroupChatSession(roomId)
      await bridge.joinMucRoom(roomId, bridge.getLocalJid().split('@')[0])
      if (!room) {
        const settings = await bridge.getMucRoomSettings(roomId)
        room = createGroupChatSession(roomId, [], roomId, {
          encrypted: settings?.defaultSecure ?? true,
          localJid: bridge.getLocalJid(),
          type: 'muc',
        })
      }
      navigate(`/chat/${encodeURIComponent(room.chat.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join this room.')
    } finally {
      setJoining(false)
    }
  }

  const handleBrowseRooms = async () => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.isServerConnected()) {
      setBrowseMessage('Connect an XMPP server account in Settings to browse its rooms.')
      return
    }
    if (!bridge.discoverServerMucRooms) {
      setBrowseMessage('XMPP room discovery is unavailable in this browser.')
      return
    }
    setDiscoveringRooms(true)
    setBrowseMessage('')
    try {
      const rooms = await bridge.discoverServerMucRooms()
      setServerRooms(rooms.slice(0, 50))
      setBrowseMessage(rooms.length ? '' : 'No public rooms were listed by this server. You can still enter a full room JID above.')
    } catch (browseError) {
      setBrowseMessage(browseError instanceof Error ? browseError.message : 'Could not browse XMPP rooms.')
      setServerRooms([])
    } finally {
      setDiscoveringRooms(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <form className="px-4 py-5 border-b border-border" onSubmit={(event) => { event.preventDefault(); void handleJoin() }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Join a room</p>
        <p className="text-xs text-muted-foreground mb-3">Enter a P2P room ID, or a full XMPP room JID such as <span className="font-mono">room@conference.example.org</span>. XMPP rooms require a connected server account.</p>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-colors">
            <Hash size={13} className="ml-3 text-muted-foreground flex-shrink-0" />
            <input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toLowerCase())}
              placeholder="room-id or room-id@muc.p2p"
              aria-label="P2P room ID or XMPP room JID"
              className="flex-1 bg-transparent px-2 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          <button type="submit" disabled={!isValidRoom || joining}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {joining ? 'Joining…' : 'Join'}
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-destructive mt-2">{error}</p>}
      </form>
      <div className="space-y-3 px-4 py-5">
        <button type="button" onClick={() => void handleBrowseRooms()} disabled={discoveringRooms || joining}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border bg-card hover:bg-secondary transition-all text-left disabled:cursor-wait disabled:opacity-60">
          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
            <Search size={15} className="text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{discoveringRooms ? 'Browsing XMPP rooms…' : 'Browse XMPP rooms'}</p>
            <p className="font-mono text-[10px] text-muted-foreground">Find public rooms on your connected server</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/50 flex-shrink-0" />
        </button>
        {browseMessage && <p role="status" className="px-1 text-xs leading-relaxed text-muted-foreground">{browseMessage}</p>}
        {serverRooms.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border" aria-label="XMPP rooms">
            {serverRooms.map((room) => (
              <button key={`${room.serviceJid}:${room.roomJid}`} type="button" onClick={() => { setRoomInput(room.roomJid); void handleJoin(room.roomJid) }} disabled={joining}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-secondary disabled:cursor-wait disabled:opacity-60">
                <Hash size={14} className="text-primary flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{room.name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{room.roomJid}</span>
                </span>
                <ChevronRight size={14} className="text-muted-foreground/50 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
        <button onClick={() => navigate('/communities/new')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0">
            <Plus size={15} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Create a room</p>
            <p className="font-mono text-[10px] text-muted-foreground">Create a room on the peer network</p>
          </div>
          <ChevronRight size={14} className="ml-auto text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </button>
      </div>
    </div>
  )
}

const FLOWS: { id: FlowType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'direct', label: 'Direct', icon: User },
  { id: 'group', label: 'Group', icon: Users },
  { id: 'muc', label: 'Channel', icon: Hash },
]

export default function NewChatPage() {
  const navigate = useNavigate()
  const initialFlow = new URLSearchParams(window.location.search).get('flow')
  const [flow, setFlow] = useState<FlowType>(initialFlow === 'group' || initialFlow === 'muc' ? initialFlow : 'direct')
  const flowTabRefs = useRef<Record<FlowType, HTMLButtonElement | null>>({ direct: null, group: null, muc: null })

  const handleFlowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: FlowType) => {
    const tabs: FlowType[] = ['direct', 'group', 'muc']
    const currentIndex = tabs.indexOf(current)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    const nextTab = tabs[nextIndex]
    setFlow(nextTab)
    flowTabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <h1 className="font-semibold text-sm">New conversation</h1>
        </div>
      </header>

      <div role="tablist" aria-label="Conversation type" className="flex border-b border-border flex-shrink-0">
        {FLOWS.map((f) => {
          const Icon = f.icon
          const active = flow === f.id
          return (
            <button key={f.id} ref={(element) => { flowTabRefs.current[f.id] = element }} id={`new-chat-tab-${f.id}`}
              type="button" role="tab" aria-selected={active} aria-controls="new-chat-panel" tabIndex={active ? 0 : -1}
              onClick={() => setFlow(f.id)} onKeyDown={(event) => handleFlowKeyDown(event, f.id)}
              className={`min-h-11 flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors relative ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon size={15} />
              {f.label}
              {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
            </button>
          )
        })}
      </div>

      <div id="new-chat-panel" role="tabpanel" aria-labelledby={`new-chat-tab-${flow}`} tabIndex={0} className="flex flex-1 min-h-0 flex-col">
        {flow === 'direct' && <DirectFlow />}
        {flow === 'group' && <GroupFlow />}
        {flow === 'muc' && <MucFlow />}
      </div>
    </div>
  )
}
