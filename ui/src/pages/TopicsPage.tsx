import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Search, Hash, TrendingUp, Users, Heart, MessageCircle,
  ChevronRight, Zap, X, Flame, Clock, Star,
  Globe,
} from 'lucide-react'

type TopicFilter = 'trending' | 'following' | 'new'

interface Topic {
  id: string
  tag: string
  description: string
  postCount: string
  memberCount: string
  color: string
  following: boolean
  hot?: boolean
  recentPost?: { author: string; avatar: string; excerpt: string; likes: number; comments: number }
}

const TOPICS: Topic[] = [
  {
    id: '1', tag: 'Privacy', description: 'Digital privacy, security research, and rights',
    postCount: '12.4k', memberCount: '48.2k', color: '#a855f7', following: true, hot: true,
    recentPost: { author: 'Yuki Tanaka', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=48&h=48&fit=crop&auto=format', excerpt: 'OMEMO is criminally underrated. Signal-level security, open protocol, no phone number required.', likes: 2103, comments: 147 },
  },
  {
    id: '2', tag: 'DecentralWeb', description: 'Federated protocols, ActivityPub, XMPP, Matrix',
    postCount: '4.2k', memberCount: '19.7k', color: '#3b82f6', following: true, hot: true,
    recentPost: { author: 'Maren Holdt', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', excerpt: 'The decentralized web is finally catching up to UX expectations from centralized platforms.', likes: 284, comments: 31 },
  },
  {
    id: '3', tag: 'XMPPProtocol', description: 'XMPP extensions, RFCs, client development',
    postCount: '1.8k', memberCount: '6.3k', color: '#00d4aa', following: true,
    recentPost: { author: 'Kaspar Vold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', excerpt: 'New RFC draft for XMPP push notifications on mobile - finally addressing the battery drain issue.', likes: 97, comments: 14 },
  },
  {
    id: '4', tag: 'OpenSource', description: 'Open source software, licenses, and community',
    postCount: '6.7k', memberCount: '31.0k', color: '#f59e0b', following: false, hot: true,
    recentPost: { author: 'Theo Nakashima', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', excerpt: 'Just shipped a new XMPP client library for Go with full MUC support. Zero dependencies.', likes: 512, comments: 88 },
  },
  {
    id: '5', tag: 'FediDev', description: 'Developers building on federated platforms',
    postCount: '891', memberCount: '3.2k', color: '#ef4444', following: true,
    recentPost: { author: 'Ingrid Larsen', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', excerpt: 'Monthly call tomorrow 18:00 UTC. Agenda: Federated search, ActivityPub C2S, XMPP gateway proposals.', likes: 44, comments: 12 },
  },
  {
    id: '6', tag: 'SelfHosted', description: 'Running your own infrastructure and services',
    postCount: '3.1k', memberCount: '14.8k', color: '#06b6d4', following: false,
    recentPost: { author: 'Felix Bergström', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=48&h=48&fit=crop&auto=format', excerpt: 'Moved all my personal infra to self-hosted XMPP + Matrix bridge. The setup took 4 hours.', likes: 788, comments: 55 },
  },
  {
    id: '7', tag: 'WebDev', description: 'Web development, browsers, and standards',
    postCount: '22.1k', memberCount: '87.4k', color: '#8b5cf6', following: false, hot: true,
    recentPost: { author: 'Elif Şahin', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', excerpt: 'Hot take: the problem with federated social networks isn\'t tech, it\'s onboarding.', likes: 1420, comments: 203 },
  },
  {
    id: '8', tag: 'Infosec', description: 'Information security, CVEs, and threat intel',
    postCount: '8.9k', memberCount: '29.1k', color: '#f97316', following: false,
    recentPost: { author: 'Amara Diallo', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=48&h=48&fit=crop&auto=format', excerpt: 'Weekly thread: what are you working on? Rebuilding my XMPP bridge for message reactions.', likes: 63, comments: 41 },
  },
]

function formatCount(n: string | number) {
  if (typeof n === 'number') return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
  return n
}

function TopicCard({ topic, onToggleFollow }: { topic: Topic; onToggleFollow: (id: string) => void }) {
  const navigate = useNavigate()
  return (
    <div className="border-b border-border">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: topic.color + '1a', border: `1px solid ${topic.color}33` }}
            >
              <Hash size={16} style={{ color: topic.color }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span onClick={() => navigate(`/topics/${topic.tag}`)} className="font-semibold text-sm text-foreground hover:text-primary transition-colors cursor-pointer">#{topic.tag}</span>
                {topic.hot && (
                  <span className="flex items-center gap-0.5 text-[10px] font-mono text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded">
                    <Flame size={9} />hot
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{topic.description}</p>
            </div>
          </div>
          <button
            onClick={() => onToggleFollow(topic.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded text-[11px] font-mono font-medium transition-all ${
              topic.following
                ? 'bg-secondary text-foreground/70 hover:bg-destructive/10 hover:text-destructive'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
          >
            {topic.following ? 'Following' : 'Follow'}
          </button>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
            <TrendingUp size={10} />{topic.postCount} posts
          </span>
          <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
            <Users size={10} />{topic.memberCount} members
          </span>
          <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
            <Globe size={10} />Public
          </span>
        </div>
      </div>

      {topic.recentPost && (
        <div onClick={() => navigate(`/topics/${topic.tag}`)}
          className="mx-4 mb-3 p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full overflow-hidden bg-muted flex-shrink-0">
              <img src={topic.recentPost.avatar} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{topic.recentPost.author}</span>
            <span className="font-mono text-[10px] text-muted-foreground/40 ml-auto">latest</span>
          </div>
          <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-2">{topic.recentPost.excerpt}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Heart size={10} />{formatCount(topic.recentPost.likes)}
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <MessageCircle size={10} />{formatCount(topic.recentPost.comments)}
            </span>
            <span className="ml-auto font-mono text-[10px] text-primary flex items-center gap-0.5 hover:underline cursor-pointer">
              View all <ChevronRight size={10} />
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS: { id: TopicFilter; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'following', label: 'Following', icon: Star },
  { id: 'new', label: 'New', icon: Clock },
]

export default function TopicsPage() {
  const [activeSort, setActiveSort] = useState<TopicFilter>('trending')
  const [topics, setTopics] = useState<Topic[]>(TOPICS)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const handleToggleFollow = (id: string) =>
    setTopics((prev) => prev.map((t) => t.id === id ? { ...t, following: !t.following } : t))

  const filtered = topics.filter((t) => {
    const sortMatch = activeSort !== 'following' || t.following
    const searchMatch = !searchQuery || t.tag.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase())
    return sortMatch && searchMatch
  })

  const followingCount = topics.filter((t) => t.following).length

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Topics</span>
            <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{followingCount} followed</span>
          </div>
          <button onClick={() => setSearchOpen((v) => !v)}
            className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
            <Search size={17} />
          </button>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              )}
            </div>
          </div>
        )}

        <div className="flex border-t border-border">
          {SORT_OPTIONS.map((f) => {
            const Icon = f.icon
            const active = activeSort === f.id
            return (
              <button key={f.id} onClick={() => setActiveSort(f.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors relative ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon size={15} />
                {f.label}
                {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />}
              </button>
            )
          })}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Hash size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {activeSort === 'following' ? "You haven't followed any topics yet" : 'No topics found'}
            </p>
          </div>
        ) : (
          filtered.map((topic) => (
            <TopicCard key={topic.id} topic={topic} onToggleFollow={handleToggleFollow} />
          ))
        )}
      </main>
    </div>
  )
}
