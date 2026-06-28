import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  X, Zap, Hash, Users, Globe, Lock, Shield, Eye, EyeOff,
  ChevronDown, AlertCircle, Check, Info, Clock, UserCheck, UserX, Key,
  MessageSquare, Archive, Loader,
} from 'lucide-react'
import { getBrowserXmppBridge } from '../bridge/runtime'
import { emitToast } from '../lib/toast-events'

type Privacy = 'public' | 'members-only'
type Moderation = 'unmoderated' | 'moderated'
type Visibility = 'visible' | 'hidden'
type HistoryPolicy = 'none' | 'limited' | 'all'
type SubjectRole = 'anyone' | 'moderators' | 'admins'

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {hint && (
        <span className="group relative cursor-help">
          <Info size={10} className="text-muted-foreground/50" />
          <span className="absolute left-0 bottom-full mb-1 w-48 p-2 rounded bg-popover border border-border text-[10px] text-muted-foreground leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
            {hint}
          </span>
        </span>
      )}
    </div>
  )
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between w-full py-2.5 text-left group">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm text-foreground/80">{label}</p>
        {description && <p className="font-mono text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className={`w-8 h-4.5 rounded-full transition-colors flex-shrink-0 relative ${checked ? 'bg-primary' : 'bg-muted'}`}
        style={{ height: '18px', width: '32px' }}>
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm ${checked ? 'translate-x-[14px]' : 'translate-x-0.5'}`} />
      </div>
    </button>
  )
}

function RadioGroup<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; description?: string; icon?: React.ComponentType<{ size?: number; className?: string }> }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => {
        const Icon = opt.icon
        const active = value === opt.id
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${active ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-foreground/20 hover:bg-secondary/50'}`}>
            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${active ? 'border-primary' : 'border-muted-foreground/40'}`}>
              {active && <span className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {Icon && <Icon size={12} className={active ? 'text-primary' : 'text-muted-foreground'} />}
                <span className={`text-sm font-medium ${active ? 'text-foreground' : 'text-foreground/70'}`}>{opt.label}</span>
              </div>
              {opt.description && <p className="font-mono text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>}
            </div>
            {active && <Check size={13} className="text-primary flex-shrink-0 mt-0.5" />}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-border">
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  )
}

export default function CreateCommunityPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [roomIdManual, setRoomIdManual] = useState(false)
  const [server, setServer] = useState('conference.jabber.de')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [icon, setIcon] = useState('💬')

  const [privacy, setPrivacy] = useState<Privacy>('public')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [maxOccupants, setMaxOccupants] = useState('0')

  const [moderation, setModeration] = useState<Moderation>('unmoderated')
  const [membersOnly, setMembersOnly] = useState(false)
  const [allowInvites, setAllowInvites] = useState(true)
  const [subjectRole, setSubjectRole] = useState<SubjectRole>('moderators')

  const [persistent, setPersistent] = useState(true)
  const [historyPolicy, setHistoryPolicy] = useState<HistoryPolicy>('limited')
  const [historyCount, setHistoryCount] = useState('50')

  const [visibility, setVisibility] = useState<Visibility>('visible')
  const [anonymous, setAnonymous] = useState(false)
  const [logging, setLogging] = useState(false)

  const handleNameChange = (v: string) => {
    setName(v)
    if (!roomIdManual) setRoomId(slugify(v))
  }

  const jid = roomId ? `${roomId}@${server}` : ''
  const isValid = name.trim().length > 0 && roomId.length > 0
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!isValid) return
    setCreating(true)
    try {
      const bridge = getBrowserXmppBridge()
      if (!bridge?.createPrivateMucRoom) {
        emitToast('Bridge not available — room creation will work once connected to a server', 'info')
        navigate(`/chat/${jid}`)
        return
      }
      const result = await bridge.createPrivateMucRoom(name, {
        topic: subject || undefined,
        nick: name,
        communityId: jid,
      })
      emitToast(`Community "${name}" created`, 'success')
      navigate(`/chat/${result.roomJid}`)
    } catch (err) {
      emitToast(err instanceof Error ? err.message : 'Failed to create community', 'error')
    } finally {
      setCreating(false)
    }
  }

  const EMOJI_OPTIONS = ['💬', '⚙️', '🌐', '🔧', '🛡️', '📡', '🔒', '🚀', '🌱', '📚', '🎯', '🔬']

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="font-semibold text-sm">Create community</span>
        </div>
        <button disabled={!isValid || creating} onClick={handleCreate}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${isValid && !creating ? 'bg-primary text-white hover:bg-primary/90' : 'bg-primary/20 text-primary/40 cursor-not-allowed'}`}>
          {creating ? <Loader size={14} className="animate-spin" /> : 'Create'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Section title="Identity">
          <div className="mb-4">
            <FieldLabel label="Icon" />
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button key={e} onClick={() => setIcon(e)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${icon === e ? 'bg-primary/10 border border-primary/40 ring-1 ring-primary/30' : 'bg-secondary border border-border hover:border-foreground/20'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <FieldLabel label="Display name" />
            <input value={name} onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. XMPP Developers"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors" />
          </div>

          <div className="mb-3">
            <FieldLabel label="Room address (JID)" hint="The unique identifier for this room on your XMPP server. Only lowercase letters, numbers, and hyphens." />
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-colors">
                <input value={roomId}
                  onChange={(e) => { setRoomId(slugify(e.target.value)); setRoomIdManual(true) }}
                  placeholder="room-name"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none" />
                <span className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground border-l border-border bg-muted/20 flex-shrink-0">@</span>
              </div>
            </div>
            <div className="mt-1.5">
              <FieldLabel label="Conference server" />
              <div className="relative">
                <select value={server} onChange={(e) => setServer(e.target.value)}
                  className="w-full appearance-none bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary/50 transition-colors pr-8">
                  <option>conference.jabber.de</option>
                  <option>muc.fosstodon.org</option>
                  <option>conference.infosec.exchange</option>
                  <option>muc.hachyderm.io</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {jid && (
              <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-muted/30 border border-border">
                <Hash size={10} className="text-primary flex-shrink-0" />
                <span className="font-mono text-[10px] text-foreground/70 break-all">{jid}</span>
              </div>
            )}
          </div>

          <div className="mb-3">
            <FieldLabel label="Description" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about?"
              rows={2}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors resize-none leading-relaxed" />
          </div>

          <div>
            <FieldLabel label="Room subject" hint="Pinned message shown to all members when they join. Good for rules, links, or current agenda." />
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Weekly call Thursdays 18:00 UTC · Rules in the pinned post"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors" />
          </div>
        </Section>

        <Section title="Access">
          <div className="mb-4">
            <FieldLabel label="Room privacy" />
            <RadioGroup<Privacy>
              value={privacy}
              onChange={setPrivacy}
              options={[
                { id: 'public', label: 'Public', icon: Globe, description: 'Anyone can join and find this room via directory search' },
                { id: 'members-only', label: 'Members only', icon: Lock, description: 'Requires an explicit member list invitation or owner approval to join' },
              ]}
            />
          </div>

          <div className="mb-4">
            <FieldLabel label="Password protection" hint="Optional room password. Leave blank for no password." />
            <div className="flex items-center bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50 transition-colors">
              <Key size={13} className="ml-3 text-muted-foreground flex-shrink-0" />
              <input type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none" />
              <button onClick={() => setShowPassword((v) => !v)} className="px-3 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <FieldLabel label="Max occupants" hint="Set to 0 for unlimited." />
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={maxOccupants} onChange={(e) => setMaxOccupants(e.target.value)}
                className="w-24 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary/50 transition-colors" />
              <span className="font-mono text-[11px] text-muted-foreground">{maxOccupants === '0' ? 'unlimited' : `max ${maxOccupants} members`}</span>
            </div>
          </div>
        </Section>

        <Section title="Moderation">
          <div className="mb-4">
            <FieldLabel label="Room moderation" />
            <RadioGroup<Moderation>
              value={moderation}
              onChange={setModeration}
              options={[
                { id: 'unmoderated', label: 'Unmoderated', icon: MessageSquare, description: 'All members can send messages freely' },
                { id: 'moderated', label: 'Moderated', icon: UserCheck, description: 'Only members with voice can send messages; moderators grant voice' },
              ]}
            />
          </div>

          <div className="divide-y divide-border">
            <Toggle checked={allowInvites} onChange={setAllowInvites}
              label="Allow member invitations"
              description="Members can invite others without moderator approval" />
            <Toggle checked={membersOnly} onChange={setMembersOnly}
              label="Members-only messages"
              description="Only registered members can send messages (non-members can read if public)" />
          </div>

          <div className="mt-4">
            <FieldLabel label="Who can change room subject" />
            <RadioGroup<SubjectRole>
              value={subjectRole}
              onChange={setSubjectRole}
              options={[
                { id: 'anyone', label: 'Anyone', icon: Users },
                { id: 'moderators', label: 'Moderators & admins', icon: Shield },
                { id: 'admins', label: 'Admins only', icon: UserX },
              ]}
            />
          </div>
        </Section>

        <Section title="History & Persistence">
          <div className="mb-4 divide-y divide-border">
            <Toggle checked={persistent} onChange={setPersistent}
              label="Persistent room"
              description="Room stays alive after the last member leaves. Non-persistent rooms are destroyed when empty." />
            <Toggle checked={logging} onChange={setLogging}
              label="Enable message logging"
              description="Message history is stored server-side and accessible via archive queries (XEP-0313)" />
          </div>

          <div>
            <FieldLabel label="History on join" hint="How many past messages to send when a member joins (XEP-0045 maxchars / maxstanzas)." />
            <RadioGroup<HistoryPolicy>
              value={historyPolicy}
              onChange={setHistoryPolicy}
              options={[
                { id: 'none', label: 'None', icon: Archive, description: 'No history sent on join' },
                { id: 'limited', label: 'Limited', icon: Clock, description: 'Send last N messages' },
                { id: 'all', label: 'Full archive', icon: MessageSquare, description: 'Send complete message history' },
              ]}
            />
            {historyPolicy === 'limited' && (
              <div className="mt-3 flex items-center gap-2">
                <input type="number" min="1" max="500" value={historyCount}
                  onChange={(e) => setHistoryCount(e.target.value)}
                  className="w-20 bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50 transition-colors" />
                <span className="font-mono text-[11px] text-muted-foreground">messages on join</span>
              </div>
            )}
          </div>
        </Section>

        <Section title="Discovery & Privacy">
          <div className="mb-4">
            <FieldLabel label="Room visibility in directory" />
            <RadioGroup<Visibility>
              value={visibility}
              onChange={setVisibility}
              options={[
                { id: 'visible', label: 'Listed', icon: Globe, description: 'Appears in public room directory searches' },
                { id: 'hidden', label: 'Hidden', icon: EyeOff, description: 'Not listed in directory; joinable only by direct JID or invite' },
              ]}
            />
          </div>

          <div className="divide-y divide-border">
            <Toggle checked={anonymous} onChange={setAnonymous}
              label="Anonymous room"
              description="Member JIDs are hidden from each other. Only moderators see real JIDs (semi-anonymous)." />
          </div>
        </Section>

        {isValid && (
          <div className="px-4 py-4">
            <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Summary</p>
              {[
                { label: 'JID', value: jid },
                { label: 'Privacy', value: privacy === 'public' ? 'Public' : 'Members only' },
                { label: 'Moderation', value: moderation === 'moderated' ? 'Moderated' : 'Unmoderated' },
                { label: 'History', value: historyPolicy === 'none' ? 'None' : historyPolicy === 'all' ? 'Full archive' : `Last ${historyCount} messages` },
                { label: 'Persistent', value: persistent ? 'Yes' : 'No' },
                { label: 'Directory', value: visibility === 'visible' ? 'Listed' : 'Hidden' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
                  <span className="font-mono text-[10px] text-foreground/80">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isValid && (
          <div className="mx-4 mb-4 flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertCircle size={13} className="text-amber-400 flex-shrink-0" />
            <span className="text-[11px] text-amber-400">A display name and room address are required to create a community.</span>
          </div>
        )}
      </div>
    </div>
  )
}
