import { useEffect, useMemo } from 'react'
import { ArrowLeft, Globe, Hash, MessageCircle, Repeat2, Shield, User } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useFeedBridge } from '../bridge/feed/useFeedBridge'
import { useBrowserXmppBridge } from '../bridge/runtime'
import { RichText } from '../components/RichText'
import type { FeedPost } from '../bridge/feed/types'

const normalize = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase()

function AuthorPost({ post }: { post: FeedPost }) {
  return (
    <article className="border-b border-border px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <NavLink to={`/post/${encodeURIComponent(post.id)}`} className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border">
            {post.author.avatar && <img src={post.author.avatar} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight text-foreground">{post.author.name}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">@{post.author.handle} · {post.timestamp}</div>
          </div>
          {post.author.verified && <Shield size={13} className="shrink-0 text-primary" />}
        </div>
        {(post.topic || post.community) && (
          <span className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
            style={post.topic ? { color: post.topicColor || '#3b82f6', backgroundColor: (post.topicColor || '#3b82f6') + '1a' } : undefined}>
            {post.topic ? <><Hash size={9} />{post.topic}</> : post.community}
          </span>
        )}
        {post.title && <h2 className="mb-1.5 break-words text-sm font-semibold leading-snug text-foreground">{post.title}</h2>}
        <p className="break-words whitespace-pre-line text-sm leading-relaxed text-foreground/90"><RichText text={post.content} /></p>
        {post.media && <div className="mt-2.5 overflow-hidden rounded border border-border bg-secondary"><img src={post.media.url} alt={post.media.alt} loading="lazy" referrerPolicy="no-referrer" className="h-36 w-full object-cover" /></div>}
      </NavLink>
      <div className="mt-1 flex min-h-11 items-center gap-3 pl-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1" title={`${post.comments} replies`}><MessageCircle size={14} aria-hidden="true" /><span className="font-mono text-[11px] tabular-nums">{post.comments}</span></span>
        <span className="inline-flex items-center gap-1"><Repeat2 size={14} aria-hidden="true" /><span className="font-mono text-[11px] tabular-nums">{post.reposts}</span></span>
      </div>
    </article>
  )
}

export default function AuthorProfilePage() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(search), [search])
  const { posts, loading, loadError, refresh } = useFeedBridge()
  const runtime = useBrowserXmppBridge()
  const protocol = searchParams.get('protocol') ?? 'p2p'
  const handle = searchParams.get('handle') ?? ''
  const server = searchParams.get('server') ?? ''

  const authorPosts = useMemo(() => posts
    .filter((post) => normalize(post.author.handle) === normalize(handle)
      && normalize(post.author.server) === normalize(server)
      && (post.sourceProtocol ?? 'p2p') === protocol)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')),
  [posts, handle, server, protocol])
  const author = authorPosts[0]?.author
  const displayName = author?.name || handle || 'Unknown author'
  const peerJid = protocol === 'p2p' && handle ? `${handle}@${server || 'p2p'}` : ''
  const isSelf = Boolean(peerJid && runtime?.getLocalJid().toLowerCase() === peerJid.toLowerCase())

  useEffect(() => {
    if (isSelf) navigate('/profile', { replace: true })
    else if (!handle) navigate('/', { replace: true })
  }, [handle, isSelf, navigate])

  if (isSelf || !handle) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <button type="button" onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">{displayName}</h1>
          <p className="text-[11px] text-muted-foreground">Profile</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <section className="border-b border-border px-4 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-xl font-semibold text-muted-foreground">
              {author?.avatar
                ? <img src={author.avatar} alt="" className="h-full w-full object-cover" />
                : <User size={24} aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="break-words text-lg font-semibold text-foreground">{displayName}</h2>
              <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">@{handle}{server ? ` · ${server}` : ''}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Globe size={12} aria-hidden="true" />
                {protocol === 'rss' ? 'RSS / Atom author' : protocol === 'xmpp' ? 'XMPP author' : 'P2P author'}
              </div>
            </div>
          </div>
        </section>

        <div className="flex min-h-12 items-center border-b border-border px-4">
          <h2 className="text-sm font-semibold text-foreground">Posts</h2>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">{authorPosts.length}</span>
        </div>

        {loading && authorPosts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading posts…</p>
        ) : loadError && authorPosts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p role="alert" className="text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70">Try again</button>
          </div>
        ) : authorPosts.length > 0 ? (
          authorPosts.map((post) => <AuthorPost key={`${post.sourceProtocol}:${post.id}`} post={post} />)
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">No posts from this author are available in your feed yet.</p>
        )}
      </main>
    </div>
  )
}
