import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  Settings, Shield, Lock, Globe, Hash, Users, Heart,
  MessageCircle, Repeat2, Bookmark, Edit3, Link2,
  MapPin, Calendar, Zap, ChevronRight, Copy, Check,
  QrCode, Camera, Loader2,
} from 'lucide-react'
import { useProfileBridge, type EditableVCard } from '../bridge/useProfileBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useFeedBridge } from '../bridge/feed/useFeedBridge'
import { getBrowserXmppBridge } from '../bridge/runtime'
import type { BridgeFeedSubscriptionRecord, BridgeCollectionNode } from '../bridge/runtime'
import { InlineEdit } from '../components/InlineEdit'
import QRCode from '../components/QRCode'

type ProfileTab = 'posts' | 'topics' | 'communities' | 'bookmarks'

function formatCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function formatJoinDate(iso?: string) {
  if (!iso) return null
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function serverFromJid(jid?: string) {
  if (!jid || !jid.includes('@')) return null
  return jid.split('@')[1]
}

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'topics', label: 'Topics' },
  { id: 'communities', label: 'Communities' },
  { id: 'bookmarks', label: 'Saved' },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts')
  const [copied, setCopied] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<EditableVCard | null>(null)
  const [editError, setEditError] = useState('')
  const [subscriptions, setSubscriptions] = useState<BridgeFeedSubscriptionRecord[]>([])
  const [collections, setCollections] = useState<BridgeCollectionNode[]>([])
  const [showQR, setShowQR] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { identity } = useIdentityBridge()
  const { vCard, loading, saving, save } = useProfileBridge()
  const feedBridge = useFeedBridge()

  useEffect(() => {
    const runtime = getBrowserXmppBridge()
    if (!runtime) return
    Promise.all([
      runtime.getFeedSubscriptions().catch(() => [] as BridgeFeedSubscriptionRecord[]),
      runtime.getCollections().catch(() => [] as BridgeCollectionNode[]),
    ]).then(([subs, cols]) => {
      setSubscriptions(subs)
      setCollections(cols)
    })
  }, [])

  const myHandle = identity?.handle || (vCard?.nickname ? vCard.nickname : '')
  const myPosts = feedBridge.posts.filter(
    (p) => p.author.handle === myHandle
  )
  const bookmarkedPosts = feedBridge.posts.filter((p) => p.bookmarked)
  const uniqueTopics = new Set(subscriptions.map((s) => s.topic.split(':').pop() || s.topic))

  const openEdit = () => {
    setEditForm(vCard ? { ...vCard } : { fn: '', nickname: '' })
    setShowEdit(true)
    setEditError('')
  }

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const binval = (reader.result as string).split(',')[1]
      setEditForm((prev) => prev ? { ...prev, photo: { type: file.type, binval } } : prev)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!editForm) return
    setEditError('')
    const ok = await save(editForm)
    if (ok) {
      setShowEdit(false)
    } else {
      setEditError('Failed to save profile. The bridge may be unavailable.')
    }
  }

  const handleCancel = () => {
    setShowEdit(false)
    setEditForm(null)
    setEditError('')
  }

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const displayName = vCard?.fn || vCard?.nickname || identity?.displayName || 'You'
  const handle = vCard?.nickname ? `@${vCard.nickname}` : identity?.handle ? `@${identity.handle}` : '@you'
  const joinDate = formatJoinDate(identity?.createdAt)
  const server = serverFromJid(identity?.jid)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Profile</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowQR(true)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <QrCode size={17} />
          </button>
          <button onClick={() => navigate('/settings')}
            className="p-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-white/5">
            <Settings size={17} />
          </button>
        </div>
      </header>

      {showEdit && editForm && (
        <div className="border-b border-border bg-card flex-shrink-0 px-4 py-3 space-y-3">
          {editError && <p className="text-destructive text-xs font-mono">{editError}</p>}
          <InlineEdit label="Display Name" value={editForm.fn} onChange={(e: any) => setEditForm((prev: any) => prev ? { ...prev, fn: e.target.value } : prev)} placeholder="Your display name" />
          <InlineEdit label="Nickname" value={editForm.nickname} onChange={(e: any) => setEditForm((prev: any) => prev ? { ...prev, nickname: e.target.value } : prev)} placeholder="Your nickname" />
          <InlineEdit label="Bio" value={editForm.desc || ''} onChange={(e: any) => setEditForm((prev: any) => prev ? { ...prev, desc: e.target.value } : prev)} placeholder="Tell us about yourself" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono text-muted-foreground">Avatar</label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
                {editForm.photo ? (
                  <img src={`data:${editForm.photo.type};base64,${editForm.photo.binval}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Camera size={16} /></div>
                )}
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="text-xs font-mono text-primary hover:underline">
                {editForm.photo ? 'Change' : 'Upload photo'}
              </button>
              {editForm.photo && (
                <button onClick={() => setEditForm((prev: any) => prev ? { ...prev, photo: null } : prev)} className="text-xs font-mono text-destructive hover:underline">
                  Remove
                </button>
              )}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-mono hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} className="px-4 py-2 rounded-lg border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="animate-pulse">
            <div className="h-28 bg-secondary border-b border-border" />
            <div className="px-4 pb-4">
              <div className="flex items-end justify-between -mt-6 mb-3">
                <div className="w-16 h-16 rounded-full border-4 border-background bg-secondary" />
                <div className="w-16 h-8 rounded-lg bg-secondary" />
              </div>
              <div className="space-y-3 mb-4">
                <div className="h-5 bg-secondary rounded w-1/3" />
                <div className="h-4 bg-secondary rounded w-1/4" />
                <div className="h-4 bg-secondary rounded w-1/2" />
              </div>
              <div className="grid grid-cols-3 gap-0 rounded-lg border border-border overflow-hidden h-16 bg-secondary" />
            </div>
          </div>
        ) : (
        <>
        <div className="relative">
          <div className="h-28 bg-gradient-to-br from-primary/20 via-accent/10 to-purple-500/10 border-b border-border" />
          <div className="px-4 pb-4">
            <div className="flex items-end justify-between -mt-6 mb-3">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-background overflow-hidden bg-secondary">
                  {vCard?.photo ? (
                    <img src={`data:${vCard.photo.type};base64,${vCard.photo.binval}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl text-muted-foreground">
                      {(vCard?.fn || identity?.displayName || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-accent border-2 border-background" />
              </div>
              <button onClick={openEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
                <Edit3 size={12} />Edit
              </button>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h1 className="text-base font-bold text-foreground leading-tight">{displayName}</h1>
                <Shield size={13} className="text-primary" />
                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">OMEMO</span>
              </div>
              <div className="flex items-center gap-1 mb-2">
                <span className="font-mono text-xs text-muted-foreground">{handle}</span>
                <button onClick={handleCopy} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
                </button>
              </div>
              {vCard?.desc && (
                <p className="text-sm text-foreground/80 leading-relaxed">{vCard.desc}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
              {joinDate && (
                <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <Calendar size={11} />Joined {joinDate}
                </span>
              )}
              {server && (
                <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <Globe size={11} />{server}
                </span>
              )}
              {identity?.jid && (
                <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <Globe size={11} />{identity.jid}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-0 rounded-lg border border-border overflow-hidden">
              {[
                { label: 'Posts', value: formatCount(myPosts.length) },
                { label: 'Following', value: formatCount(subscriptions.length) },
                { label: 'Topics', value: String(uniqueTopics.size) },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center py-2.5 border-r border-border last:border-0 hover:bg-secondary transition-colors cursor-pointer">
                  <span className="font-semibold text-sm text-foreground">{value}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky top-[52px] z-20 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
          <div className="flex">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-2.5 text-[11px] font-medium transition-colors relative ${activeTab === t.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {t.label}
                {activeTab === t.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'posts' && (
          <div>
            {myPosts.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No posts yet</p>
              </div>
            ) : (
              myPosts.map((post) => (
                <article key={post.id} className="border-b border-border px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer">
                  {post.topic && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded mb-2"
                      style={{ color: post.topicColor, backgroundColor: post.topicColor + '1a' }}>
                      <Hash size={9} />{post.topic}
                    </span>
                  )}
                  <p className="text-sm text-foreground/90 leading-relaxed mb-2">{post.content}</p>
                  <div className="flex items-center justify-between -ml-1">
                    <button className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all">
                      <MessageCircle size={14} />
                      <span className="font-mono text-[11px]">{formatCount(post.comments)}</span>
                    </button>
                    <button
                      onClick={() => feedBridge.repostPost(post.id)}
                      className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.reposted ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10'}`}
                    >
                      <Repeat2 size={14} />
                      <span className="font-mono text-[11px]">{formatCount(post.reposts)}</span>
                    </button>
                    <button onClick={() => feedBridge.likePost(post.id)}
                      className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}>
                      <Heart size={14} fill={post.liked ? 'currentColor' : 'none'} />
                      <span className="font-mono text-[11px]">{formatCount(post.likes)}</span>
                    </button>
                    <span className="font-mono text-[10px] text-muted-foreground ml-auto">{post.timestamp}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {activeTab === 'topics' && (
          <div>
            {subscriptions.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No topics subscribed yet</p>
              </div>
            ) : (
              subscriptions.map((s) => {
                const topicName = s.topic.split(':').pop() || s.topic
                return (
                  <div key={s.topic} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#3b82f61a', border: '1px solid #3b82f633' }}>
                      <Hash size={15} style={{ color: '#3b82f6' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">#{topicName}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">Subscribed</p>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/40" />
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'communities' && (
          <div>
            {collections.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No communities joined yet</p>
              </div>
            ) : (
              collections.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg flex-shrink-0">
                    ⚙️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.name || c.topic}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{c.members.length} members</p>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">Member</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div>
            <div className="px-4 py-2.5 border-b border-border">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Saved posts</span>
            </div>
            {bookmarkedPosts.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No saved posts</p>
              </div>
            ) : (
              bookmarkedPosts.map((post) => (
                <article key={post.id} className="border-b border-border px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer">
                  <p className="text-sm text-foreground/90 leading-relaxed mb-2">{post.content}</p>
                  <div className="flex items-center gap-2">
                    <Bookmark size={12} className="text-primary" />
                    <span className="font-mono text-[10px] text-muted-foreground">Saved {post.timestamp} ago</span>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
        </>
        )}
      </main>

      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowQR(false)}>
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm text-foreground">Scan profile QR</p>
            <QRCode value={identity?.jid ?? handle ?? 'xmpp-p2p:identity'} size={180} />
            <p className="font-mono text-[10px] text-muted-foreground break-all text-center max-w-[200px]">{identity?.jid ?? handle}</p>
            <button
              onClick={() => setShowQR(false)}
              className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-mono hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
