import * as React from 'react'
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Share2,
  Bookmark, Hash, Users, Globe, Lock, Shield, Copy,
  Zap, Image, Smile, AtSign, Send, ChevronDown, Check, X, UserPlus, UserMinus,
} from 'lucide-react'
import { getBrowserXmppBridge, useBrowserXmppBridge } from '../bridge/runtime'
import { useFeedBridge } from '../bridge/feed/useFeedBridge'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { emitToast } from '../lib/toast-events'

interface Author {
  name: string
  handle: string
  avatar: string
  verified?: boolean
  server: string
}

interface Reply {
  id: string
  author: Author
  content: string
  timestamp: string
  likes: number
  liked?: boolean
  reposted?: boolean
  replies?: Reply[]
  depth?: number
}

interface Post {
  id: string
  author: Author
  content: string
  timestamp: string
  fullDate: string
  topic?: string
  topicColor?: string
  community?: string
  communityIcon?: string
  likes: number
  comments: number
  reposts: number
  views: number
  liked?: boolean
  reposted?: boolean
  bookmarked?: boolean
  privacy?: 'public' | 'followers' | 'community'
  media?: { url: string; alt: string }
  sourceTopic?: string
}

async function copyPostLink(postId: string) {
  try {
    const url = new URL(`/post/${encodeURIComponent(postId)}`, window.location.origin).toString()
    await navigator.clipboard.writeText(url)
    emitToast('Post link copied', 'success')
  } catch {
    emitToast('Could not copy the post link', 'error')
  }
}

function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function PrivacyIcon({ privacy }: { privacy?: string }) {
  if (privacy === 'followers') return <Lock size={11} className="text-muted-foreground" />
  if (privacy === 'community') return <Users size={11} className="text-muted-foreground" />
  return <Globe size={11} className="text-muted-foreground" />
}

function ReplyThread({ reply, onLike, onRepost, onReplySubmit }: { reply: Reply; onLike: (id: string) => void; onRepost: (id: string) => void; onReplySubmit: (id: string, text: string, depth: number) => Promise<boolean> }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [localReplyText, setLocalReplyText] = useState('')
  const hasChildren = reply.replies && reply.replies.length > 0
  const isNested = (reply.depth ?? 0) > 0

  return (
    <div className={`${isNested ? 'ml-8 border-l-2 border-border pl-3' : ''}`}>
      <div className="flex gap-2.5 py-3 px-4">
        <div className="flex-shrink-0 flex flex-col items-center gap-0 relative">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
            <img src={reply.author.avatar} alt={reply.author.name} className="w-full h-full object-cover" />
          </div>
          {hasChildren && !collapsed && (
            <div className="w-px flex-1 bg-border mt-1 min-h-[12px]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-semibold text-[13px] text-foreground leading-tight">{reply.author.name}</span>
            {reply.author.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
            <span className="font-mono text-[11px] text-muted-foreground">@{reply.author.handle}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="font-mono text-[11px] text-muted-foreground">{reply.timestamp}</span>
            <button onClick={() => { void copyPostLink(reply.id) }}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors" title="Copy link">
              <Copy size={13} />
            </button>
          </div>

          <p className="text-[13px] text-foreground/90 leading-relaxed mb-2">{reply.content}</p>

          <div className="flex items-center gap-4 -ml-1">
            <button onClick={() => setIsReplying(!isReplying)} aria-label={isReplying ? 'Cancel reply' : `Reply to @${reply.author.handle}`} className="flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground hover:text-interaction hover:bg-interaction/10 transition-all">
              <MessageCircle size={13} />
              {hasChildren && <span className="font-mono text-[10px]">{reply.replies!.length}</span>}
            </button>
            <button onClick={() => onRepost(reply.id)} disabled={reply.reposted} aria-label={reply.reposted ? 'Reply reposted' : 'Repost reply'} className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all disabled:cursor-default ${reply.reposted ? 'text-success' : 'text-muted-foreground hover:text-success hover:bg-success/10'}`}>
              <Repeat2 size={13} />
            </button>
            <button onClick={() => onLike(reply.id)} disabled={reply.liked} aria-label={reply.liked ? 'Reply liked' : 'Like reply'}
              className={`flex items-center gap-1 px-1 py-0.5 rounded transition-all ${reply.liked ? 'text-liked' : 'text-muted-foreground hover:text-liked hover:bg-liked/10'}`}>
              <Heart size={13} fill={reply.liked ? 'currentColor' : 'none'} />
              {reply.likes > 0 && <span className="font-mono text-[10px]">{formatNum(reply.likes)}</span>}
            </button>
            <button onClick={() => { void copyPostLink(reply.id) }} aria-label="Share reply"
              className="flex items-center gap-1 px-1 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {isReplying && (
        <div className="ml-10 mr-4 my-2 p-3 bg-secondary/30 rounded-lg border border-border flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            <textarea
              autoFocus
              aria-label={`Reply to @${reply.author.handle}`}
              value={localReplyText}
              onChange={(e) => setLocalReplyText(e.target.value)}
              placeholder={`Reply to @${reply.author.handle}…`}
              rows={2}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center gap-2 mt-2">
              <button 
                onClick={() => {
                  setIsReplying(false)
                  setLocalReplyText('')
                }}
                className="px-2.5 py-1 text-[11px] font-semibold rounded text-muted-foreground hover:bg-white/5 transition-colors ml-auto"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (localReplyText.trim() && await onReplySubmit(reply.id, localReplyText.trim(), reply.depth ?? 0)) {
                    setIsReplying(false)
                    setLocalReplyText('')
                  }
                }}
                className="px-2.5 py-1 bg-primary text-primary-foreground text-[11px] font-semibold rounded hover:bg-primary/90 transition-colors"
              >
                Reply
              </button>
            </div>
          </div>
        </div>
      )}

      {hasChildren && !collapsed && (
        <div>
          {reply.replies!.map((child) => (
            <ReplyThread key={child.id} reply={{ ...child, depth: (reply.depth ?? 0) + 1 }} onLike={onLike} onRepost={onRepost} onReplySubmit={onReplySubmit} />
          ))}
        </div>
      )}

      {hasChildren && (
        <button onClick={() => setCollapsed((v) => !v)}
          className="ml-12 mb-1 flex items-center gap-1 text-[11px] font-mono text-primary hover:underline">
          <ChevronDown size={11} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          {collapsed ? `Show ${reply.replies!.length} repl${reply.replies!.length > 1 ? 'ies' : 'y'}` : 'Collapse'}
        </button>
      )}
    </div>
  )
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const runtime = useBrowserXmppBridge()
  const { identity } = useIdentityBridge()
  const userInitial = identity?.displayName?.trim().charAt(0).toUpperCase() || 'Y'
  const { posts: feedPosts, loading, loadError, likePost, bookmarkPost, repostPost, refresh } = useFeedBridge()
  const bridgePost = React.useMemo<Post | null>(() => {
    const fp = feedPosts.find((entry) => entry.id === id)
    if (!fp) return null
    return {
      id: fp.id,
      author: { name: fp.author.name, handle: fp.author.handle, avatar: fp.author.avatar, server: fp.author.server || '', verified: fp.author.verified },
      content: fp.content,
      timestamp: fp.timestamp,
      fullDate: fp.timestamp,
      likes: fp.likes,
      comments: fp.comments,
      reposts: fp.reposts,
      views: 0,
      liked: fp.liked,
      bookmarked: fp.bookmarked,
      reposted: fp.reposted,
      topic: fp.topic,
      topicColor: fp.topicColor || '#3b82f6',
      privacy: fp.privacy,
      sourceTopic: fp.sourceTopic,
    }
  }, [id, feedPosts])

  const post: Post = bridgePost ?? {
    id: id ?? '',
    author: { name: '', handle: '', avatar: '', server: '' },
    content: '',
    timestamp: '',
    fullDate: '',
    likes: 0,
    comments: 0,
    reposts: 0,
    views: 0,
  }
  const [liked, setLiked] = useState(post.liked ?? false)
  const [likes, setLikes] = useState(post.likes)
  const [reposts, setReposts] = useState(post.reposts)
  const [reposted, setReposted] = useState(post.reposted ?? false)
  const [bookmarked, setBookmarked] = useState(post.bookmarked ?? false)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [followingAuthor, setFollowingAuthor] = useState(false)
  const [changingFollow, setChangingFollow] = useState(false)
  const replyTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  // Replies are populated from feed records after the current post is resolved.
  // Start empty so demo fixtures can never be mistaken for live replies.
  const [replies, setReplies] = useState<Reply[]>([])

  const authorPeerId = bridgePost?.author.handle
  const authorPeerJid = authorPeerId ? `${authorPeerId}@p2p` : ''
  const canFollowAuthor = Boolean(bridgePost && authorPeerId && bridgePost.author.server.toLowerCase() === 'p2p'
    && authorPeerJid !== runtime?.getLocalJid?.())

  useEffect(() => {
    let active = true
    setFollowingAuthor(false)
    if (!runtime || !canFollowAuthor || !authorPeerId) return () => { active = false }
    void runtime.getFeedSubscriptions().then((subscriptions) => {
      if (active) setFollowingAuthor(subscriptions.some((subscription) => subscription.peerId === authorPeerId))
    }).catch(() => {})
    return () => { active = false }
  }, [runtime, canFollowAuthor, authorPeerId])

  const toggleFollowAuthor = async () => {
    if (!runtime || !canFollowAuthor || !authorPeerJid || changingFollow) return
    setChangingFollow(true)
    try {
      if (followingAuthor) {
        await runtime.unsubscribeFeed(authorPeerJid)
        setFollowingAuthor(false)
        emitToast(`Unfollowed @${authorPeerId}`, 'success')
      } else {
        await runtime.subscribeFeed(authorPeerJid)
        setFollowingAuthor(true)
        emitToast(`Following @${authorPeerId}; new posts will appear in your feed`, 'success')
      }
    } catch (error) {
      void runtime.getFeedSubscriptions().then((subscriptions) => {
        setFollowingAuthor(subscriptions.some((subscription) => subscription.peerId === authorPeerId))
      }).catch(() => {})
      emitToast(error instanceof Error ? error.message : 'Could not update feed subscription', 'error')
    } finally {
      setChangingFollow(false)
    }
  }

  const insertReplyText = (inserted: string) => {
    const textarea = replyTextareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const next = `${replyText.slice(0, start)}${inserted}${replyText.slice(end)}`.slice(0, 500)
    const nextCursor = Math.min(start + inserted.length, next.length)
    setReplyText(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  useEffect(() => {
    if (!bridgePost) return
    setLiked(bridgePost.liked ?? false)
    setLikes(bridgePost.likes)
    setReposts(bridgePost.reposts)
    setReposted(bridgePost.reposted ?? false)
    setBookmarked(bridgePost.bookmarked ?? false)
  }, [bridgePost])

  useEffect(() => {
    if (!bridgePost) return
    const toReply = (parentId: string, visited = new Set<string>()): Reply[] => feedPosts
      .filter((feedPost) => feedPost.replyTo === parentId && !visited.has(feedPost.id))
      .map((feedPost) => {
        const nextVisited = new Set(visited).add(feedPost.id)
        return {
        id: feedPost.id,
        author: {
          name: feedPost.author.name,
          handle: feedPost.author.handle,
          avatar: feedPost.author.avatar,
          verified: feedPost.author.verified,
          server: feedPost.author.server || ''
        },
        content: feedPost.content,
        timestamp: feedPost.timestamp,
        likes: feedPost.likes,
        liked: feedPost.liked,
        reposted: feedPost.reposted,
        replies: toReply(feedPost.id, nextVisited),
      }})
    setReplies(toReply(bridgePost.id))
  }, [bridgePost, feedPosts])

  const handleLikeReply = async (replyId: string) => {
    if (!(await likePost(replyId))) return
    const toggle = (list: Reply[]): Reply[] =>
      list.map((r) => {
        if (r.id === replyId) return { ...r, liked: true, likes: r.likes + 1 }
        if (r.replies) return { ...r, replies: toggle(r.replies) }
        return r
      })
    setReplies((prev) => toggle(prev))
  }

  const handleRepostReply = async (replyId: string) => {
    if (!(await repostPost(replyId))) return
    const mark = (list: Reply[]): Reply[] => list.map((reply) => reply.id === replyId
      ? { ...reply, reposted: true }
      : { ...reply, replies: reply.replies ? mark(reply.replies) : undefined })
    setReplies((prev) => mark(prev))
    emitToast('Reply reposted', 'success')
  }

  const handleSubmitReply = async () => {
    if (!replyText.trim() || submittingReply) return
    setSubmittingReply(true)
    const runtime = getBrowserXmppBridge()
    if (!runtime || !bridgePost?.sourceTopic) {
      emitToast('Connect to the peer network to reply to this post', 'error')
      setSubmittingReply(false)
      return
    }
    if (runtime && bridgePost) {
      const replyBody = replyText.trim()
      const authorServer = bridgePost.author.server.trim()
      const isExternalAuthor = Boolean(authorServer && authorServer !== 'p2p')
      const authorJid = isExternalAuthor
        ? `${bridgePost.author.handle}@${authorServer}`
        : undefined

      try {
        let delivered = false
        let deliveryError: unknown
        // Standard XMPP servers deliver point-to-point chat and federation.
        // Send the reply through that client path when the author is external
        // so the author can receive it even if they do not consume our feed.
        if (authorJid) {
          try {
            await runtime.sendChatMessage(
              { id: authorJid, type: 'direct', name: bridgePost.author.name, handle: authorJid, server: authorServer },
              replyBody,
              { reply: { id: bridgePost.id, to: authorJid }, thread: bridgePost.id }
            )
            delivered = true
          } catch (err) {
            deliveryError = err
          }
        }

        // Keep the feed/P2P copy for subscribers and history when this post
        // belongs to a feed topic we can publish to.
        if (bridgePost.sourceTopic) {
          try {
            await runtime.publishFeed(replyBody, {
              topic: bridgePost.sourceTopic,
              replyTo: bridgePost.id,
            })
            delivered = true
          } catch (err) {
            deliveryError = err
          }
        }
        if (!delivered) {
          throw deliveryError ?? new Error('No reply transport is available')
        }
        setReplyText('')
        emitToast('Reply published', 'success')
        await refresh()
      } catch (err) {
        emitToast(err instanceof Error ? err.message : 'Failed to publish reply', 'error')
      } finally {
        setSubmittingReply(false)
      }
      return
    }
  }

  const handleSubmitNestedReply = async (targetId: string, text: string): Promise<boolean> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime || !bridgePost?.sourceTopic) {
      emitToast('Connect to the peer network to reply', 'error')
      return false
    }
    try {
      await runtime.publishFeed(text, { topic: bridgePost.sourceTopic, replyTo: targetId })
      emitToast('Reply published', 'success')
      await refresh()
      return true
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not publish your reply', 'error')
      return false
    }
  }

  const handleLike = async () => {
    if (liked || !bridgePost) return
    if (await likePost(post.id)) {
      setLiked(true)
      setLikes((count) => count + 1)
    }
  }

  const handleRepost = async () => {
    if (reposted || !bridgePost) return
    if (await repostPost(post.id)) {
      setReposted(true)
      setReposts((count) => count + 1)
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: post.author.name, text: post.content, url })
      else {
        await navigator.clipboard.writeText(url)
        emitToast('Post link copied', 'success')
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) emitToast('Could not share this post', 'error')
    }
  }

  const handleFocusReply = () => {
    const el = document.getElementById('reply-textarea')
    el?.focus()
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!id || !bridgePost) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        {loading ? <div role="status" className="text-sm text-muted-foreground">Loading post…</div> : loadError ? (
          <>
            <p role="alert" className="max-w-sm text-sm text-destructive">Could not load this post: {loadError}</p>
            <button type="button" onClick={() => void refresh()} className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/70">Try again</button>
          </>
        ) : !getBrowserXmppBridge() ? (
          <>
            <p className="text-sm font-medium text-foreground">The peer network is unavailable</p>
            <p className="max-w-xs text-xs text-muted-foreground">Reconnect to the peer network to open this post.</p>
            <button type="button" onClick={() => navigate('/settings')} className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/70">Open Settings</button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Post not found</p>
            <p className="max-w-xs text-xs text-muted-foreground">This post is not in your feed or is no longer available.</p>
            <button type="button" onClick={() => navigate('/')} className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/70">Go to feed</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center gap-3 px-4 py-2.5">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <span className="font-semibold text-sm">Post</span>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
              <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-foreground">{post.author.name}</span>
                {post.author.verified && <Shield size={12} className="text-primary" />}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted-foreground">@{post.author.handle}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-mono text-[11px] text-muted-foreground">{post.author.server}</span>
              </div>
            </div>
              {canFollowAuthor && (
                <button
                  type="button"
                  onClick={() => void toggleFollowAuthor()}
                  disabled={!runtime || changingFollow}
                  aria-pressed={followingAuthor}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${followingAuthor ? 'border-border text-muted-foreground hover:bg-secondary' : 'border-primary/40 text-primary hover:bg-primary/10'}`}
                >
                  {followingAuthor ? <UserMinus size={14} /> : <UserPlus size={14} />}
                  {changingFollow ? 'Updating…' : followingAuthor ? 'Following' : 'Follow'}
                </button>
              )}
            <button onClick={() => { void copyPostLink(post.id) }} aria-label="Copy link to post"
              className="text-muted-foreground hover:text-foreground transition-colors" title="Copy link to post">
              <Copy size={16} />
            </button>
          </div>

          {post.topic && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded"
                style={{ color: post.topicColor, backgroundColor: post.topicColor + '1a' }}>
                <Hash size={9} />{post.topic}
              </span>
            </div>
          )}
          {post.community && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-warn/10 text-warn">
                {post.communityIcon} {post.community}
              </span>
            </div>
          )}

          <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-line mb-3">{post.content}</p>

          {post.media && (
            <div className="mb-3 rounded-lg overflow-hidden border border-border bg-secondary">
              <img src={post.media.url} alt={post.media.alt} className="w-full object-cover max-h-72" />
            </div>
          )}

          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
            <span className="font-mono text-[11px] text-muted-foreground">{post.fullDate}</span>
            <span className="text-border">·</span>
            <PrivacyIcon privacy={post.privacy} />
            <span className="font-mono text-[11px] text-muted-foreground capitalize">{post.privacy ?? 'public'}</span>
            <span className="text-border">·</span>
            <span className="font-mono text-[11px] text-muted-foreground">{formatNum(post.views)} views</span>
          </div>

          <div className="flex items-center gap-4 pb-3 border-b border-border">
            <span className="text-[13px] text-foreground">
              <span className="font-semibold">{formatNum(likes)}</span> <span className="text-muted-foreground">Likes</span>
            </span>
            <span className="text-[13px] text-foreground">
              <span className="font-semibold">{formatNum(reposts)}</span> <span className="text-muted-foreground">Reposts</span>
            </span>
            <span className="text-[13px] text-foreground">
              <span className="font-semibold">{formatNum(post.comments)}</span> <span className="text-muted-foreground">Replies</span>
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button onClick={handleFocusReply} aria-label="Write a reply" className="flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-interaction hover:bg-interaction/10 transition-all">
              <MessageCircle size={19} />
            </button>
            <button
              onClick={handleRepost}
              disabled={reposted}
              aria-label={reposted ? 'Post already reposted' : 'Repost'}
              className={`flex items-center gap-1.5 p-2 rounded-lg transition-all disabled:cursor-default ${reposted ? 'text-success' : 'text-muted-foreground hover:text-success hover:bg-success/10'}`}
            >
              <Repeat2 size={19} />
            </button>
            <button onClick={() => void handleLike()} disabled={liked} aria-label={liked ? 'Post already liked' : 'Like post'} aria-pressed={liked}
              className={`flex items-center gap-1.5 p-2 rounded-lg transition-all disabled:cursor-default ${liked ? 'text-liked' : 'text-muted-foreground hover:text-liked hover:bg-liked/10'}`}>
              <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => { const next = !bookmarked; setBookmarked(next); if (bridgePost) bookmarkPost(post.id) }} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark post'} aria-pressed={bookmarked}
              className={`flex items-center gap-1.5 p-2 rounded-lg transition-all ${bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
              <Bookmark size={19} fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={handleShare} aria-label="Share post" className="flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <Share2 size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border flex gap-3 items-start">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0 mt-0.5">
            <div aria-label="Your profile" className="flex h-full w-full items-center justify-center text-xs font-semibold text-foreground">
              {userInitial}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              id="reply-textarea"
              aria-label={`Reply to @${post.author.handle}`}
              ref={replyTextareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to @${post.author.handle}…`}
              rows={replyText.length > 80 ? 3 : 1}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed"
            />
            {replyText.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => insertReplyText('![](https://)')} aria-label="Insert image link" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                    <Image size={15} />
                  </button>
                  <button type="button" onClick={() => insertReplyText('@')} aria-label="Insert mention" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                    <AtSign size={15} />
                  </button>
                  <button type="button" onClick={() => insertReplyText('😊')} aria-label="Insert emoji" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                    <Smile size={15} />
                  </button>
                </div>
                <span className={`font-mono text-[10px] ml-auto ${500 - replyText.length < 50 ? 'text-warn' : 'text-muted-foreground'}`}>
                  {500 - replyText.length}
                </span>
                <button onClick={() => void handleSubmitReply()} disabled={submittingReply || !replyText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors">
                  <Send size={12} />{submittingReply ? 'Sending…' : 'Reply'}
                </button>
              </div>
            )}
          </div>
        </div>

        {replies.length > 0 && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {replies.length} repl{replies.length !== 1 ? 'ies' : 'y'}
            </span>
          </div>
        )}

        <div>
          {replies.map((reply) => (
            <div key={reply.id} className="border-b border-border last:border-0">
              <ReplyThread reply={reply} onLike={(replyId) => { void handleLikeReply(replyId) }} onRepost={(replyId) => { void handleRepostReply(replyId) }} onReplySubmit={handleSubmitNestedReply} />
            </div>
          ))}
        </div>

        {replies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <MessageCircle size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No replies yet. Be the first.</p>
          </div>
        )}
      </main>
    </div>
  )
}
