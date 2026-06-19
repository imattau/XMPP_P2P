import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowLeft, Search, User, Users, Hash, X, Plus, Check,
  Shield, Zap, ChevronRight, AlertCircle,
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

const RECENT_CONTACTS: Contact[] = [
  { id: 'maren', name: 'Maren Holdt', handle: 'maren@social.coop', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', server: 'social.coop', online: true, verified: true },
  { id: 'felix', name: 'Felix Bergström', handle: 'felixb@chaos.social', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', server: 'chaos.social', online: false },
  { id: 'ingrid', name: 'Ingrid Larsen', handle: 'ingridl@sigmoid.social', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', server: 'sigmoid.social', online: true },
  { id: 'kaspar', name: 'Kaspar Vold', handle: 'kvold@fosstodon.org', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', server: 'fosstodon.org', online: false, verified: true },
  { id: 'theo', name: 'Theo Nakashima', handle: 'theo_n@hachyderm.io', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', server: 'hachyderm.io', online: true },
  { id: 'yuki', name: 'Yuki Tanaka', handle: 'yukitan@infosec.exchange', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=48&h=48&fit=crop&auto=format', server: 'infosec.exchange', online: false },
  { id: 'elif', name: 'Elif Şahin', handle: 'elif_dev@mastodon.social', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', server: 'mastodon.social', online: true },
  { id: 'amara', name: 'Amara Diallo', handle: 'amara_d@blacktwitter.io', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=48&h=48&fit=crop&auto=format', server: 'blacktwitter.io', online: false },
]

const KNOWN_MUCS = [
  { jid: 'fedidev@conference.fosstodon.org', name: '#fedidev', members: 341, description: 'Federated dev community' },
  { jid: 'opensourcedev@muc.hachyderm.io', name: '#opensourcedev', members: 1204, description: 'Open source development' },
  { jid: 'privacy@conference.infosec.exchange', name: '#privacy', members: 892, description: 'Privacy, security & digital rights' },
  { jid: 'xmpp@conference.jabber.org', name: '#xmpp', members: 2341, description: 'Official XMPP community room' },
  { jid: 'prosody@conference.prosody.im', name: '#prosody', members: 188, description: 'Prosody XMPP server support' },
]

function ContactRow({ contact, selected, onToggle }: { contact: Contact; selected?: boolean; onToggle?: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors text-left border-b border-border last:border-0">
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary border border-border">
          {contact.avatar
            ? <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-foreground">{contact.name[0]}</div>
          }
        </div>
        <span className={`absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full border-2 border-background ${contact.online ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground truncate">{contact.name}</span>
          {contact.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground truncate block">{contact.handle}</span>
      </div>
      {onToggle && (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? 'bg-primary border-primary' : 'border-border'}`}>
          {selected && <Check size={11} className="text-white" />}
        </div>
      )}
      {!onToggle && <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />}
    </button>
  )
}

function DirectFlow() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const filtered = RECENT_CONTACTS.filter((c) =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.handle.toLowerCase().includes(query.toLowerCase())
  )

  const isJid = query.includes('@') && query.split('@').length === 2 && query.split('@')[1].includes('.')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or enter JID (user@server.tld)…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isJid && (
          <div className="px-4 py-3 border-b border-border">
            <button onClick={() => navigate('/chat/new')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/30 hover:bg-primary/10 transition-colors text-left">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20 flex-shrink-0">
                <User size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{query}</p>
                <p className="font-mono text-[10px] text-muted-foreground">Start conversation with this JID</p>
              </div>
              <ChevronRight size={14} className="text-primary flex-shrink-0" />
            </button>
          </div>
        )}

        <div>
          <div className="px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {query ? 'Results' : 'Recent contacts'}
            </span>
          </div>
          {filtered.map((c) => (
            <ContactRow key={c.id} contact={c} onToggle={() => navigate(`/chat/${c.id}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No contacts found.</p>
              <p className="font-mono text-[11px] text-muted-foreground/60 mt-1">Enter a full JID to start a new conversation.</p>
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
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Contact[]>([])

  const toggle = (c: Contact) =>
    setSelected((prev) => prev.find((p) => p.id === c.id) ? prev.filter((p) => p.id !== c.id) : [...prev, c])

  const filtered = RECENT_CONTACTS.filter((c) =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.handle.toLowerCase().includes(query.toLowerCase())
  )

  const canCreate = groupName.trim().length > 0 && selected.length >= 1

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Group name</p>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. Protocol Working Group"
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors" />
      </div>

      {selected.length > 0 && (
        <div className="px-4 py-2.5 border-b border-border flex-shrink-0 flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span key={c.id} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-[11px] font-mono px-2 py-1 rounded-full">
              {c.name.split(' ')[0]}
              <button onClick={() => toggle(c)} className="hover:text-primary/60 transition-colors"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Add participants…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Contacts · {selected.length} selected
          </span>
        </div>
        {filtered.map((c) => (
          <ContactRow key={c.id} contact={c} selected={!!selected.find((s) => s.id === c.id)} onToggle={() => toggle(c)} />
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        {!canCreate && (
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertCircle size={12} className="text-amber-400 flex-shrink-0" />
            <span className="text-[11px] text-amber-400">
              {!groupName.trim() ? 'Add a group name' : 'Add at least one participant'}
            </span>
          </div>
        )}
        <button
          disabled={!canCreate}
          onClick={() => navigate('/chat/2')}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${canCreate ? 'bg-primary text-white hover:bg-primary/90' : 'bg-primary/20 text-primary/40 cursor-not-allowed'}`}>
          <Users size={15} />
          Create group · {selected.length + 1} members
        </button>
      </div>
    </div>
  )
}

function MucFlow() {
  const navigate = useNavigate()
  const [jidInput, setJidInput] = useState('')
  const [query, setQuery] = useState('')

  const isValidJid = jidInput.includes('@') && jidInput.split('@')[1]?.includes('.')

  const filtered = KNOWN_MUCS.filter((m) =>
    !query || m.name.toLowerCase().includes(query.toLowerCase()) || m.jid.toLowerCase().includes(query.toLowerCase()) || m.description.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Join by room JID</p>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-colors">
            <Hash size={13} className="ml-3 text-muted-foreground flex-shrink-0" />
            <input value={jidInput} onChange={(e) => setJidInput(e.target.value)}
              placeholder="room@conference.server.tld"
              className="flex-1 bg-transparent px-2 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          <button
            disabled={!isValidJid}
            onClick={() => navigate('/chat/3')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${isValidJid ? 'bg-primary text-white hover:bg-primary/90' : 'bg-secondary text-muted-foreground cursor-not-allowed'}`}>
            Join
          </button>
        </div>
        {jidInput && !isValidJid && (
          <p className="font-mono text-[10px] text-muted-foreground/60 mt-1.5">Format: roomname@conference.server.tld</p>
        )}
      </div>

      <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={() => navigate('/communities/new')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0">
            <Plus size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Create a new channel</p>
            <p className="font-mono text-[10px] text-muted-foreground">Configure a new MUC room on your server</p>
          </div>
          <ChevronRight size={14} className="ml-auto text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channel directory…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            {query && <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>}
          </div>
        </div>

        <div className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Public channels</span>
            <span className="font-mono text-[10px] text-muted-foreground/50">· via jabber.de</span>
          </div>
        </div>

        {filtered.map((m) => (
          <button key={m.jid} onClick={() => navigate('/chat/3')}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary transition-colors text-left">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center border border-primary/20 flex-shrink-0">
              <Hash size={15} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{m.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground truncate">{m.description}</p>
              <p className="font-mono text-[10px] text-muted-foreground/50 truncate">{m.jid}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="font-mono text-[10px] text-muted-foreground">{m.members.toLocaleString()}</span>
              <span className="font-mono text-[9px] text-muted-foreground/50">members</span>
            </div>
          </button>
        ))}
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
  const [flow, setFlow] = useState<FlowType>('direct')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="font-semibold text-sm">New conversation</span>
        </div>
      </header>

      <div className="flex border-b border-border flex-shrink-0">
        {FLOWS.map((f) => {
          const Icon = f.icon
          const active = flow === f.id
          return (
            <button key={f.id} onClick={() => setFlow(f.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors relative ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon size={15} />
              {f.label}
              {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
            </button>
          )
        })}
      </div>

      {flow === 'direct' && <DirectFlow />}
      {flow === 'group' && <GroupFlow />}
      {flow === 'muc' && <MucFlow />}
    </div>
  )
}
