import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, User, ChevronDown, X, MoreHorizontal, UserMinus, UserPlus, LoaderCircle, Check } from 'lucide-react'
import { useRosterBridge } from '../bridge/useRosterBridge'
import { useDiscoveredPeers } from '../bridge/useDiscoveredPeers'
import type { RosterContact } from '../bridge/useRosterBridge'
import { emitToast } from '../lib/toast-events'

function ContactRow({ contact, removeContact, onOpen }: {
  contact: RosterContact
  removeContact: (jid: string) => Promise<void>
  onOpen: () => void
}) {
  const [removing, setRemoving] = useState(false)
  const label = contact.nickname || contact.name || contact.jid.split('@')[0]

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await removeContact(contact.jid)
      emitToast(`${label} removed from contacts`, 'success')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not remove contact', 'error')
      setRemoving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border hover:bg-white/[0.02] transition-colors">
      <button type="button" onClick={onOpen} aria-label={`Open chat with ${label}, ${contact.jid}, ${contact.online ? 'online' : 'offline'}`} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
        <div className={`w-10 h-10 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-sm font-semibold text-foreground border border-border ${contact.online ? '' : 'opacity-60'}`}>
          {label[0]?.toUpperCase() || '?'}
        </div>
        <span className={`flex-1 min-w-0 ${contact.online ? '' : 'opacity-60'}`}>
          <span className="block text-sm font-medium text-foreground truncate">{label}</span>
          <span className="hidden truncate font-mono text-[10px] text-muted-foreground sm:block">{contact.jid}</span>
        </span>
      </button>
      <details className="group relative flex-shrink-0">
        <summary aria-label={`More actions for ${label}`} title="More actions"
          className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
          <MoreHorizontal size={18} />
        </summary>
        <div className="absolute right-0 top-full z-20 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl">
          <button type="button" onClick={() => void handleRemove()} disabled={removing}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">
            {removing ? <LoaderCircle size={15} className="animate-spin" /> : <UserMinus size={15} />}
            Remove contact
          </button>
        </div>
      </details>
    </div>
  )
}

export default function ContactsPage() {
  const navigate = useNavigate()
  const { contacts, serverSubscriptionRequests, answerServerSubscriptionRequest, loading, loadError, available, refresh, addContact, removeContact } = useRosterBridge()
  const discoveredPeers = useDiscoveredPeers()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAvailablePeers, setShowAvailablePeers] = useState(false)
  const [answeringRequest, setAnsweringRequest] = useState<string | null>(null)
  const [addingPeer, setAddingPeer] = useState<string | null>(null)

  const handleSubscriptionRequest = async (jid: string, approve: boolean) => {
    setAnsweringRequest(jid)
    try {
      await answerServerSubscriptionRequest(jid, approve)
      emitToast(approve ? `Approved ${jid}'s XMPP contact request` : `Declined ${jid}'s XMPP contact request`, approve ? 'success' : 'info')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not respond to this XMPP contact request', 'error')
    } finally {
      setAnsweringRequest(null)
    }
  }

  const filtered = contacts.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.nickname || '').toLowerCase().includes(q) ||
      c.jid.toLowerCase().includes(q)
    )
  })

  const online = filtered.filter((c) => c.online)
  const offline = filtered.filter((c) => !c.online)
  const savedContactIds = new Set(contacts.map((contact) => contact.jid.toLowerCase().split('/')[0]))
  const availablePeers = discoveredPeers.filter((peer) => {
    if (savedContactIds.has(peer.jid.toLowerCase())) return false
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return peer.jid.toLowerCase().includes(query) || (peer.nickname || '').toLowerCase().includes(query)
  })

  const handleAddDiscoveredPeer = async (peer: { jid: string; nickname?: string }) => {
    setAddingPeer(peer.jid)
    try {
      await addContact(peer.jid, peer.nickname || peer.jid.split('@')[0])
      emitToast('Peer added to contacts', 'success')
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not add peer', 'error')
    } finally {
      setAddingPeer(null)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Contacts</h1>
          {!searchOpen && <div className="flex items-center gap-0.5">
            <button onClick={() => setSearchOpen(true)} aria-label="Search contacts" aria-expanded={searchOpen}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
              <Search size={17} />
            </button>
          </div>}
        </div>
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input aria-label="Search contacts" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setShowAvailablePeers(Boolean(e.target.value)) }}
                placeholder="Search contacts…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              <button onClick={() => {
                if (searchQuery) {
                  setSearchQuery('')
                  setShowAvailablePeers(false)
                } else {
                  setSearchOpen(false)
                  setShowAvailablePeers(false)
                }
              }} aria-label={searchQuery ? 'Clear contact search' : 'Close contact search'} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"><X size={14} />
                <span className="sr-only">{searchQuery ? 'Clear' : 'Close search'}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {serverSubscriptionRequests.length > 0 && (
          <section aria-labelledby="server-contact-requests-title" className="border-b border-border bg-primary/[0.04] px-4 py-4">
            <h2 id="server-contact-requests-title" className="text-sm font-semibold text-foreground">XMPP contact requests</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Accepting shares your online status and unlocks XMPP microblogs that require a subscription.
            </p>
            <div className="mt-3 space-y-2">
              {serverSubscriptionRequests.map((request) => (
                <div key={request.jid} className="rounded-xl border border-border bg-card p-3">
                  <p className="break-all font-mono text-xs text-foreground">{request.jid}</p>
                  {request.server.toLowerCase() !== request.jid.split('@')[1]?.split('/')[0]?.toLowerCase() && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Server: {request.server}</p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void handleSubscriptionRequest(request.jid, true)} disabled={answeringRequest !== null}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {answeringRequest === request.jid ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                      Accept
                    </button>
                    <button type="button" onClick={() => void handleSubscriptionRequest(request.jid, false)} disabled={answeringRequest !== null}
                      className="min-h-11 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {loadError && (
          <div role="alert" className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p className="min-w-0 flex-1 break-words text-xs text-destructive">{loadError}</p>
            {available ? (
              <button onClick={refresh} className="min-h-11 shrink-0 rounded-md border border-current/20 px-3 text-xs font-medium text-destructive hover:bg-destructive/10">Retry</button>
            ) : null}
          </div>
        )}
        {loading && contacts.length === 0 ? (
          <div className="py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border animate-pulse">
                <div className="w-10 h-10 rounded-full bg-secondary flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-secondary rounded w-1/3" />
                  <div className="h-3 bg-secondary rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && availablePeers.length === 0 && !searchQuery && loadError ? null : filtered.length === 0 && availablePeers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 gap-3 text-center sm:py-20">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <User size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No contacts or available peers match your search' : 'No contacts yet'}
            </p>
            {!searchQuery && (
              <>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Find someone by peer address or XMPP JID.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/chats/new')}
                  className="mt-1 min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Start a conversation
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {availablePeers.length > 0 && (
              <details open={showAvailablePeers} onToggle={(event) => setShowAvailablePeers(event.currentTarget.open)} className="group border-b border-border">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/[0.02]">
                  <span>Available on P2P</span>
                  <span className="text-xs font-normal text-muted-foreground">{availablePeers.length}</span>
                  <ChevronDown size={15} className="ml-auto text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">Connected peers you haven’t added to your contacts.</p>
                <div>
                {availablePeers.map((peer) => {
                  const label = peer.nickname || peer.peerId
                  const isAdding = addingPeer === peer.jid
                  return (
                    <div key={peer.peerId} className="flex items-center gap-3 border-t border-border px-4 py-2">
                      <div aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-semibold text-foreground">
                        {label[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{label}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{peer.jid}</p>
                      </div>
                      <button type="button" onClick={() => void handleAddDiscoveredPeer(peer)} disabled={addingPeer !== null}
                        aria-label={`Add ${label} to contacts`} title="Add to contacts"
                        className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50">
                        {isAdding ? <LoaderCircle size={15} className="animate-spin" /> : <UserPlus size={15} />}
                        <span className="sr-only">Add</span>
                      </button>
                    </div>
                  )
                })}
                </div>
              </details>
            )}
            {online.length > 0 && (
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Online — {online.length}
                </span>
              </div>
            )}
            {online.map((c) => <ContactRow key={c.jid} contact={c} removeContact={removeContact} onOpen={() => navigate(`/chat/${encodeURIComponent(c.jid)}`)} />)}
            {offline.length > 0 && (
              <div className="px-4 py-2 border-b border-border">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Offline — {offline.length}
                </span>
              </div>
            )}
            {offline.map((c) => <ContactRow key={c.jid} contact={c} removeContact={removeContact} onOpen={() => navigate(`/chat/${encodeURIComponent(c.jid)}`)} />)}
          </>
        )}
      </main>
    </div>
  )
}
