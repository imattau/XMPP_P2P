import * as React from 'react'
import { useState } from 'react'
import {
  Settings, Shield, Lock, Globe, Hash, Users, Heart,
  MessageCircle, Repeat2, Bookmark, Edit3, Link2,
  MapPin, Calendar, Zap, ChevronRight, Copy, Check,
  QrCode, Bell, LogOut, Moon,
} from 'lucide-react'

type ProfileTab = 'posts' | 'topics' | 'communities' | 'bookmarks'

interface ProfilePost {
  id: string
  content: string
  timestamp: string
  likes: number
  comments: number
  reposts: number
  liked?: boolean
  reposted?: boolean
  topic?: string
  topicColor?: string
}

const PROFILE_POSTS: ProfilePost[] = [
  { id: '1', content: 'Finally got OMEMO working end-to-end across three different clients. The spec has some rough edges but the security model is genuinely excellent once it clicks.', timestamp: '2h', likes: 312, comments: 28, reposts: 64, liked: true },
  { id: '2', content: 'Hot take: federation is solved at the protocol layer. The unsolved problem is identity. Who are you across servers? How do you migrate? These are the real questions.', timestamp: '1d', likes: 891, comments: 73, reposts: 201, topic: 'DecentralWeb', topicColor: '#3b82f6' },
  { id: '3', content: 'Self-hosted XMPP + Prosody tip: enable mod_cloud_notify and set up a push proxy. Battery life difference on mobile is night and day.', timestamp: '2d', likes: 156, comments: 19, reposts: 44, topic: 'XMPPProtocol', topicColor: '#00d4aa' },
  { id: '4', content: 'Reading through the new XMPP MIX spec. It\'s a proper redesign of MUC with better history management and subscription model. Worth watching if you care about group chats.', timestamp: '4d', likes: 203, comments: 31, reposts: 88, liked: true },
]

const FOLLOWED_TOPICS = [
  { tag: 'Privacy', color: '#a855f7', posts: '12.4k' },
  { tag: 'DecentralWeb', color: '#3b82f6', posts: '4.2k' },
  { tag: 'XMPPProtocol', color: '#00d4aa', posts: '1.8k' },
  { tag: 'FediDev', color: '#ef4444', posts: '891' },
  { tag: 'OpenSource', color: '#f59e0b', posts: '6.7k' },
]

const COMMUNITIES = [
  { name: 'OpenSourceDev', icon: '⚙️', role: 'Member', members: '12.4k' },
  { name: 'FediDev', icon: '🌐', role: 'Moderator', members: '3.2k' },
  { name: 'WeeklyDevChat', icon: '💬', role: 'Member', members: '891' },
]

function formatCount(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'topics', label: 'Topics' },
  { id: 'communities', label: 'Communities' },
  { id: 'bookmarks', label: 'Saved' },
]

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts')
  const [posts, setPosts] = useState<ProfilePost[]>(PROFILE_POSTS)
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleLike = (id: string) =>
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p))

  const handleRepost = (id: string) =>
    setPosts((prev) => prev.map((p) => p.id === id && !p.reposted ? { ...p, reposted: true, reposts: p.reposts + 1 } : p))

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
          <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <QrCode size={17} />
          </button>
          <button onClick={() => setShowSettings((v) => !v)}
            className={`p-2 rounded-lg transition-colors ${showSettings ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
            <Settings size={17} />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="border-b border-border bg-card flex-shrink-0">
          {[
            { icon: Edit3, label: 'Edit profile' },
            { icon: Bell, label: 'Notifications' },
            { icon: Lock, label: 'Privacy & security' },
            { icon: Moon, label: 'Appearance' },
            { icon: LogOut, label: 'Sign out', danger: true },
          ].map(({ icon: Icon, label, danger }) => (
            <button key={label} className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 transition-colors hover:bg-secondary text-left ${danger ? 'text-destructive' : 'text-foreground/80'}`}>
              <Icon size={15} />
              <span className="text-sm">{label}</span>
              <ChevronRight size={14} className="ml-auto text-muted-foreground/40" />
            </button>
          ))}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="relative">
          <div className="h-28 bg-gradient-to-br from-primary/20 via-accent/10 to-purple-500/10 border-b border-border" />
          <div className="px-4 pb-4">
            <div className="flex items-end justify-between -mt-6 mb-3">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-background overflow-hidden bg-secondary">
                  <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&fit=crop&auto=format" alt="Profile" className="w-full h-full object-cover" />
                </div>
                <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-accent border-2 border-background" />
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
                <Edit3 size={12} />Edit
              </button>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h1 className="text-base font-bold text-foreground leading-tight">You</h1>
                <Shield size={13} className="text-primary" />
                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">OMEMO</span>
              </div>
              <div className="flex items-center gap-1 mb-2">
                <span className="font-mono text-xs text-muted-foreground">@you@jabber.de</span>
                <button onClick={handleCopy} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
                </button>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Building the open web one protocol at a time. XMPP + ActivityPub enthusiast. Federated or bust.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <MapPin size={11} />Berlin, DE
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Link2 size={11} />
                <span className="text-primary hover:underline cursor-pointer">jabber.de/~you</span>
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Calendar size={11} />Joined March 2022
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Globe size={11} />jabber.de
              </span>
            </div>

            <div className="grid grid-cols-4 gap-0 rounded-lg border border-border overflow-hidden">
              {[
                { label: 'Posts', value: '284' },
                { label: 'Following', value: '312' },
                { label: 'Followers', value: '1.4k' },
                { label: 'Topics', value: '5' },
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
            {posts.map((post) => (
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
                    onClick={() => handleRepost(post.id)}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.reposted ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10'}`}
                  >
                    <Repeat2 size={14} />
                    <span className="font-mono text-[11px]">{formatCount(post.reposts)}</span>
                  </button>
                  <button onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded transition-all ${post.liked ? 'text-rose-400' : 'text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10'}`}>
                    <Heart size={14} fill={post.liked ? 'currentColor' : 'none'} />
                    <span className="font-mono text-[11px]">{formatCount(post.likes)}</span>
                  </button>
                  <span className="font-mono text-[10px] text-muted-foreground ml-auto">{post.timestamp}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        {activeTab === 'topics' && (
          <div>
            {FOLLOWED_TOPICS.map((t) => (
              <div key={t.tag} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: t.color + '1a', border: `1px solid ${t.color}33` }}>
                  <Hash size={15} style={{ color: t.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">#{t.tag}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{t.posts} posts</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground/40" />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'communities' && (
          <div>
            {COMMUNITIES.map((c) => (
              <div key={c.name} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg flex-shrink-0">
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{c.members} members</p>
                </div>
                <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${c.role === 'Moderator' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                  {c.role}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div>
            <div className="px-4 py-2.5 border-b border-border">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Saved posts</span>
            </div>
            {posts.slice(0, 2).map((post) => (
              <article key={post.id} className="border-b border-border px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer">
                <p className="text-sm text-foreground/90 leading-relaxed mb-2">{post.content}</p>
                <div className="flex items-center gap-2">
                  <Bookmark size={12} className="text-primary" />
                  <span className="font-mono text-[10px] text-muted-foreground">Saved {post.timestamp} ago</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
