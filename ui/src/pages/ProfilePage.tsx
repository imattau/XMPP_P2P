import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router'
import {
  Shield, Lock, Hash, Users, Heart,
  MessageCircle, Bookmark, Edit3, Link2,
  MapPin, Calendar, ChevronRight, Copy, Check,
  QrCode, Camera, Loader2,
} from 'lucide-react'
import { useProfileBridge, type EditableVCard } from '../bridge/useProfileBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useFeedBridge } from '../bridge/feed/useFeedBridge'
import { useBrowserXmppBridge } from '../bridge/runtime'
import type { BridgeFeedSubscriptionRecord, BridgeCollectionNode } from '../bridge/runtime'
import { InlineEdit } from '../components/InlineEdit'
import QRCode from '../components/QRCode'
import { emitToast } from '../lib/toast-events'
import { RichText } from '../components/RichText'
import type { FeedPost } from '../bridge/feed/types'

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

function ProfilePostCard({ post, saved = false }: { post: FeedPost; saved?: boolean }) {
  return (
    <article className="border-b border-border px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <NavLink to={`/post/${encodeURIComponent(post.id)}`} aria-label={`Open post by ${post.author.name}`} className="block min-w-0">
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border">
            <img src={post.author.avatar} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight text-foreground">{post.author.name}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">@{post.author.handle} · {post.timestamp}</div>
          </div>
        </div>
        {(post.topic || post.community) && (
          <span className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
            style={post.topic ? { color: post.topicColor || '#3b82f6', backgroundColor: (post.topicColor || '#3b82f6') + '1a' } : undefined}>
            {post.topic ? <><Hash size={9} />{post.topic}</> : post.community}
          </span>
        )}
        {post.title && <h3 className="mb-1.5 break-words text-sm font-semibold leading-snug text-foreground">{post.title}</h3>}
        <p className="mb-2 break-words whitespace-pre-line text-sm leading-relaxed text-foreground/90"><RichText text={post.content} /></p>
        {post.media && <div className="mb-2.5 overflow-hidden rounded border border-border bg-secondary"><img src={post.media.url} alt={post.media.alt} loading="lazy" referrerPolicy="no-referrer" className="h-36 w-full object-cover" /></div>}
      </NavLink>
      <div className="flex items-center gap-3 pl-1 text-muted-foreground">
        <span className="inline-flex min-h-11 items-center gap-1" title={`${formatCount(post.comments)} replies`}>
          <MessageCircle size={14} aria-hidden="true" /><span className="font-mono text-[11px] tabular-nums">{formatCount(post.comments)}</span>
        </span>
        <span className="inline-flex min-h-11 items-center gap-1"><Heart size={14} fill={post.liked ? 'currentColor' : 'none'} className={post.liked ? 'text-liked' : ''} /><span className="font-mono text-[11px] tabular-nums">{formatCount(post.likes)}</span></span>
        {saved && <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px]"><Bookmark size={12} className="text-primary" />Saved</span>}
        {!saved && <span className="ml-auto font-mono text-[10px]">{post.reposts ? `${formatCount(post.reposts)} reposts` : ''}</span>}
      </div>
    </article>
  )
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
  const [copiedPeerAddress, setCopiedPeerAddress] = useState(false)
  const [peerAddresses, setPeerAddresses] = useState<string[]>([])
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<EditableVCard | null>(null)
  const [editError, setEditError] = useState('')
  const [subscriptions, setSubscriptions] = useState<BridgeFeedSubscriptionRecord[]>([])
  const [collections, setCollections] = useState<BridgeCollectionNode[]>([])
  const [profileDataError, setProfileDataError] = useState('')
  const [showQR, setShowQR] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editTriggerRef = useRef<HTMLButtonElement>(null)
  const editCancelRef = useRef<HTMLButtonElement>(null)
  const qrDialogRef = useRef<HTMLDivElement>(null)
  const qrCloseRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({
    posts: null,
    topics: null,
    communities: null,
    bookmarks: null,
  })
  const { identity, permissions } = useIdentityBridge()
  const { vCard, loading, saving, save } = useProfileBridge()
  const feedBridge = useFeedBridge()
  const runtime = useBrowserXmppBridge()

  useEffect(() => {
    if (!showEdit) return
    editCancelRef.current?.focus()
    return () => editTriggerRef.current?.focus()
  }, [showEdit])

  useEffect(() => {
    if (!runtime?.getLocalPeerAddresses) {
      setPeerAddresses([])
      return
    }
    const refresh = () => setPeerAddresses(runtime.getLocalPeerAddresses?.() ?? [])
    refresh()
    const interval = window.setInterval(refresh, 2000)
    return () => window.clearInterval(interval)
  }, [runtime])

  useEffect(() => {
    if (!runtime) return
    let active = true

    const refresh = () => {
      void Promise.allSettled([
        runtime.getFeedSubscriptions(),
        runtime.getCollections(),
      ]).then(([subsResult, collectionsResult]) => {
        if (!active) return
        if (subsResult.status === 'fulfilled') setSubscriptions(subsResult.value)
        if (collectionsResult.status === 'fulfilled') setCollections(collectionsResult.value)
        setProfileDataError(
          subsResult.status === 'rejected' || collectionsResult.status === 'rejected'
            ? 'Some profile details could not sync. Retrying automatically.'
            : ''
        )
      })
    }

    refresh()
    const interval = setInterval(refresh, 10000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [runtime])

  const localJid = runtime?.getLocalJid?.()
  const peerAddress = peerAddresses[0]
  const localPart = localJid?.split('@')[0]
  const myPosts = feedBridge.posts.filter((p) => {
    if (p.replyTo) return false
    return Boolean(localPart && p.author.handle === localPart)
  })
  const bookmarkedPosts = feedBridge.posts.filter((p) => p.bookmarked)

  const openEdit = () => {
    setEditForm(vCard ? { ...vCard } : { fn: '', nickname: '' })
    setShowEdit(true)
    setEditError('')
  }

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Clear the input so picking the same file again still emits a change event.
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const binval = result.split(',')[1]
      if (!binval) {
        emitToast('Could not read the selected profile photo', 'error')
        return
      }
      setEditForm((prev) => prev ? { ...prev, photo: { type: file.type, binval } } : prev)
    }
    reader.onerror = () => emitToast('Could not read the selected profile photo', 'error')
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

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: ProfileTab) => {
    const currentIndex = TABS.findIndex((item) => item.id === tab)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    const nextTab = TABS[nextIndex].id
    setActiveTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  useEffect(() => {
    if (!showQR) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    qrCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowQR(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [showQR])

  const trapQRFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')
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

  const handleCopyPeerAddress = async () => {
    if (!peerAddress) return
    try {
      await navigator.clipboard.writeText(peerAddress)
      setCopiedPeerAddress(true)
      setTimeout(() => setCopiedPeerAddress(false), 1500)
    } catch {
      emitToast('Could not copy your peer address', 'error')
    }
  }

  const displayName = vCard?.fn || vCard?.nickname || identity?.displayName || 'You'
  const handleValue = identity?.handle || vCard?.nickname || localJid?.split('@')[0]
  const handle = handleValue ? `@${handleValue}` : 'Peer ID unavailable'
  const joinDate = formatJoinDate(identity?.createdAt)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className={`sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center px-4 py-2.5 ${showEdit ? 'hidden md:flex' : ''}`}>
        <span className="font-semibold text-sm tracking-tight">{showEdit ? 'Edit profile' : 'Profile'}</span>
      </header>

      {showEdit && editForm && (
        <div className="fixed inset-0 z-[60] flex min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:relative md:inset-auto md:z-auto md:flex-1 md:border-b md:border-border md:bg-card md:py-0">
          <div className="flex min-h-14 flex-shrink-0 items-center justify-between border-b border-border px-4 md:hidden">
            <span className="text-sm font-semibold text-foreground">Edit profile</span>
              <button ref={editCancelRef} type="button" onClick={handleCancel} className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Cancel</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {editError && <p role="alert" className="break-words text-destructive text-xs font-mono">{editError}</p>}
            <InlineEdit label="Display Name" value={editForm.fn} onChange={(e: any) => setEditForm((prev: any) => prev ? { ...prev, fn: e.target.value } : prev)} placeholder="Your display name" />
            <InlineEdit label="Nickname" value={editForm.nickname} onChange={(e: any) => setEditForm((prev: any) => prev ? { ...prev, nickname: e.target.value } : prev)} placeholder="Your nickname" />
            <InlineEdit label="Bio" multiline value={editForm.desc || ''} onChange={(e: any) => setEditForm((prev: any) => prev ? { ...prev, desc: e.target.value } : prev)} placeholder="Tell us about yourself" />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-muted-foreground">Avatar</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
                  {editForm.photo ? (
                    <img src={`data:${editForm.photo.type};base64,${editForm.photo.binval}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Camera size={16} /></div>
                  )}
                </div>
                <button disabled={!permissions.photosAndFiles} onClick={() => fileInputRef.current?.click()} className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 text-left text-xs font-mono text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
                  {permissions.photosAndFiles ? (editForm.photo ? 'Change' : 'Upload photo') : 'Enable Photos and files in Settings'}
                </button>
                {editForm.photo && (
                  <button onClick={() => setEditForm((prev: any) => prev ? { ...prev, photo: null } : prev)} className="min-h-11 px-2 text-xs font-mono text-destructive hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={fileInputRef} type="file" aria-label="Choose profile photo" accept="image/*" disabled={!permissions.photosAndFiles} className="hidden" onChange={handleAvatarPick} />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <button onClick={handleSave} disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-mono text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 md:flex-none">
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} className="hidden min-h-11 flex-1 rounded-lg border border-border px-4 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors md:flex md:flex-none">
              Cancel
            </button>
          </div>
        </div>
      )}

      <main className={`flex-1 overflow-y-auto ${showEdit ? 'hidden' : ''}`}>
        {loading ? (
          <div className="animate-pulse">
            <div className="h-20 bg-secondary border-b border-border sm:h-28" />
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
            </div>
          </div>
        ) : (
        <>
        <div className="relative">
          <div className="h-20 border-b border-border bg-gradient-to-br from-primary/20 via-accent/10 to-purple-500/10 sm:h-28" />
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
              </div>
              <button ref={editTriggerRef} onClick={openEdit} className="flex min-h-11 items-center gap-1.5 px-3 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
                <Edit3 size={12} />Edit
              </button>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h1 className="break-words text-base font-bold text-foreground leading-tight">{displayName}</h1>
              </div>
              <div className="flex min-w-0 items-center gap-1 mb-2">
                <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{handle}</span>
              </div>
              {vCard?.desc && (
                <p className="break-words text-sm text-foreground/80 leading-relaxed">{vCard.desc}</p>
              )}
            </div>

            {joinDate && (
              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <Calendar size={11} />Joined {joinDate}
                </span>
              </div>
            )}

            <div className="mb-3 rounded-lg border border-border bg-card/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Peer address</span>
                {peerAddress && <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void handleCopyPeerAddress()} aria-label={copiedPeerAddress ? 'Peer address copied' : 'Copy peer address'}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] text-primary hover:bg-primary/10">
                    {copiedPeerAddress ? <Check size={12} /> : <Copy size={12} />}{copiedPeerAddress ? 'Copied' : 'Copy'}
                  </button>
                  <button type="button" onClick={() => setShowQR(true)} aria-label="Show peer address QR code" title="Show peer address QR code"
                    className="hidden h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground sm:flex">
                    <QrCode size={16} />
                  </button>
                </div>}
              </div>
              {peerAddress ? (
                <details className="mt-1">
                  <summary className="min-h-11 cursor-pointer py-3 text-[11px] font-mono text-muted-foreground">View address &amp; QR code</summary>
                  <div className="flex items-start gap-2 pb-2">
                    <p className="min-w-0 flex-1 break-all font-mono text-[10px] leading-relaxed text-foreground/80">{peerAddress}</p>
                    <button type="button" onClick={() => setShowQR(true)} aria-label="Show peer address QR code"
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground sm:hidden">
                      <QrCode size={16} />
                    </button>
                  </div>
                </details>
              ) : (
                <details className="mt-1">
                  <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">No address available</summary>
                  <p className="pb-2 text-xs leading-relaxed text-muted-foreground">Connect to a configured relay or make a public address reachable with port forwarding.</p>
                </details>
              )}
            </div>

          </div>
        </div>

        <div className="sticky top-[52px] z-20 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
          <div role="tablist" aria-label="Profile sections" className="flex overflow-x-auto scrollbar-hidden px-2">
            {TABS.map((t) => (
              <button key={t.id} ref={(element) => { tabRefs.current[t.id] = element }} id={`profile-tab-${t.id}`}
                type="button" role="tab" aria-selected={activeTab === t.id} aria-controls="profile-tabpanel"
                tabIndex={activeTab === t.id ? 0 : -1}
                onClick={() => setActiveTab(t.id)} onKeyDown={(event) => handleTabKeyDown(event, t.id)}
                className={`min-h-11 min-w-max flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${activeTab === t.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {t.label}
                {activeTab === t.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
              </button>
            ))}
          </div>
        </div>

        <div id="profile-tabpanel" role="tabpanel" aria-labelledby={`profile-tab-${activeTab}`} tabIndex={0}>
        {activeTab === 'posts' && (
          <div>
            {myPosts.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No posts yet</p>
              </div>
            ) : (
              myPosts.map((post) => <ProfilePostCard key={post.id} post={post} />)
            )}
          </div>
        )}

        {activeTab === 'topics' && (
          <div>
            {profileDataError && <p role="status" className="px-4 pt-3 text-xs text-warn">{profileDataError}</p>}
            {subscriptions.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No topics subscribed yet</p>
              </div>
            ) : (
              subscriptions.map((s) => {
                const topicName = s.topic.split(':').pop() || s.topic
                return (
                  <button key={s.topic} onClick={() => navigate(`/topics/${encodeURIComponent(topicName)}`)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors text-left">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#3b82f61a', border: '1px solid #3b82f633' }}>
                      <Hash size={15} style={{ color: '#3b82f6' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">#{topicName}</p>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/40" />
                  </button>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'communities' && (
          <div>
            {profileDataError && <p role="status" className="px-4 pt-3 text-xs text-warn">{profileDataError}</p>}
            {collections.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No communities joined yet</p>
              </div>
            ) : (
              collections.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-warn/10 border border-warn/20 flex items-center justify-center text-lg flex-shrink-0">
                    ⚙️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{c.name || c.topic}</p>
                    <p className="shrink-0 font-mono text-[10px] text-muted-foreground">{c.members.length} members</p>
                  </div>
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
              bookmarkedPosts.map((post) => <ProfilePostCard key={post.id} post={post} saved />)
            )}
          </div>
        )}
        </div>
        </>
        )}
      </main>

      {showQR && peerAddress && (
        <div className="safe-area-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowQR(false)}>
          <div ref={qrDialogRef} role="dialog" aria-modal="true" aria-labelledby="profile-qr-title" tabIndex={-1}
            onKeyDown={trapQRFocus} className="mx-4 flex max-h-full w-[calc(100%-2rem)] max-w-xs flex-col items-center gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <p id="profile-qr-title" className="font-semibold text-sm text-foreground">Scan profile QR</p>
              <QRCode value={peerAddress} size={180} />
            <p className="font-mono text-[10px] text-muted-foreground break-all text-center max-w-[240px]">{peerAddress}</p>
            <button
              ref={qrCloseRef}
              type="button"
              onClick={() => setShowQR(false)}
              className="min-h-11 w-full rounded-lg bg-primary px-4 text-xs font-mono text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
