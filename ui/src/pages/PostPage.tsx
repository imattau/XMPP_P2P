import * as React from 'react'
import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Share2,
  Bookmark, Hash, Users, Globe, Lock, Shield,
  Zap, Image, Smile, AtSign, Send, ChevronDown, MoreHorizontal, Check, X, UserPlus, UserMinus, ExternalLink,
} from 'lucide-react'
import { RichText } from '../components/RichText'
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
  title?: string
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
  sourceProtocol?: 'p2p' | 'xmpp' | 'rss'
  externalUrl?: string
  sourceName?: string
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
  const depth = reply.depth ?? 0
  const rowPaddingClass = depth === 0 ? 'px-4' : depth === 1 ? 'px-2' : depth === 2 ? 'px-1' : 'px-0'

  return (
    <div className={`${depth === 1 ? 'ml-2 border-l-2 border-border pl-2 sm:ml-8 sm:pl-3' : depth === 2 ? 'border-l-2 border-border pl-1 sm:pl-3' : ''}`}>
      <div className={`flex ${depth >= 2 ? 'gap-0' : 'gap-2.5'} py-3 ${rowPaddingClass}`}>
        {depth < 2 && <div className="relative flex flex-shrink-0 flex-col items-center gap-0">
          <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
            <img src={reply.author.avatar} alt={reply.author.name} className="h-full w-full object-cover" />
          </div>
          {hasChildren && !collapsed && (
            <div className="mt-1 min-h-[12px] w-px flex-1 bg-border" />
          )}
        </div>}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="break-words font-semibold text-[13px] text-foreground leading-tight">{reply.author.name}</span>
            {reply.author.verified && <Shield size={11} className="text-primary flex-shrink-0" />}
            <span className="break-all font-mono text-[11px] text-muted-foreground">@{reply.author.handle}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="font-mono text-[11px] text-muted-foreground">{reply.timestamp}</span>
          </div>

          <p className="mb-2 break-words text-[13px] leading-relaxed text-foreground/90">{reply.content}</p>

          <div className="flex items-center gap-2 -ml-1">
            <button onClick={() => setIsReplying(!isReplying)} aria-label={isReplying ? 'Cancel reply' : `Reply to @${reply.author.handle}`} className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-1 text-muted-foreground hover:text-interaction hover:bg-interaction/10 transition-all">
              <MessageCircle size={13} />
              {hasChildren && <span className="font-mono text-[10px]">{reply.replies!.length}</span>}
            </button>
            <button onClick={() => onLike(reply.id)} disabled={reply.liked} aria-label={reply.liked ? `Reply liked, ${formatNum(reply.likes)} likes` : `Like reply, ${formatNum(reply.likes)} likes`}
              className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-1 transition-all ${reply.liked ? 'text-liked' : 'text-muted-foreground hover:text-liked hover:bg-liked/10'}`}>
              <Heart size={13} fill={reply.liked ? 'currentColor' : 'none'} />
              {reply.likes > 0 && <span className="hidden font-mono text-[10px] sm:inline">{formatNum(reply.likes)}</span>}
            </button>
            <details className="relative">
              <summary aria-label="More reply actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                <MoreHorizontal size={16} />
              </summary>
              <div className="absolute bottom-full left-0 z-20 mb-1 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl">
                <button type="button" disabled={reply.reposted} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onRepost(reply.id) }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary disabled:text-success">
                  <Repeat2 size={15} />{reply.reposted ? 'Reposted' : 'Repost'}
                </button>
                <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void copyPostLink(reply.id) }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                  <Share2 size={15} /> Copy link
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>

      {isReplying && (
        <div className={`${depth < 2 ? 'ml-8 sm:ml-10' : ''} mr-4 my-2 flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3`}>
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
                className="min-h-11 rounded-lg px-3 text-[11px] font-semibold text-muted-foreground hover:bg-white/5 transition-colors ml-auto"
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
                className="min-h-11 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
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
          className={`${depth === 0 ? 'ml-12' : depth === 1 ? 'ml-8' : ''} mb-1 flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] font-mono text-primary hover:bg-primary/5 hover:underline`}>
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
      title: fp.title,
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
      sourceProtocol: fp.sourceProtocol,
      externalUrl: fp.externalUrl,
      media: fp.media,
      sourceName: fp.sourceName,
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
  const supportsSocialActions = post.sourceProtocol !== 'xmpp' && post.sourceProtocol !== 'rss'
  const [liked, setLiked] = useState(post.liked ?? false)
  const [likes, setLikes] = useState(post.likes)
  const [reposts, setReposts] = useState(post.reposts)
  const [reposted, setReposted] = useState(post.reposted ?? false)
  const [bookmarked, setBookmarked] = useState(post.bookmarked ?? false)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [followingAuthor, setFollowingAuthor] = useState(false)
  const [authorFollowStatus, setAuthorFollowStatus] = useState<'subscribed' | 'pending' | 'polling' | undefined>()
  const [changingFollow, setChangingFollow] = useState(false)
  const replyTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const { hash } = useLocation()
  // Replies are populated from feed records after the current post is resolved.
  // Start empty so demo fixtures can never be mistaken for live replies.
  const [replies, setReplies] = useState<Reply[]>([])

  const authorPeerId = bridgePost?.author.handle
  const authorPeerJid = authorPeerId ? `${authorPeerId}@p2p` : ''
  const isP2PAuthor = bridgePost?.sourceProtocol === 'p2p' || bridgePost?.author.server.toLowerCase() === 'p2p'
  const isXMPPAuthor = bridgePost?.sourceProtocol === 'xmpp'
  const xmppAuthorJid = bridgePost && bridgePost.author.handle.includes('@')
    ? bridgePost.author.handle.split('/')[0].toLowerCase()
    : bridgePost?.author.server
      ? `${bridgePost.author.handle}@${bridgePost.author.server}`.toLowerCase()
      : ''
  const localAddresses = [runtime?.getLocalJid?.(), runtime?.getServerJid?.()]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.split('/')[0].toLowerCase())
  const targetAuthorAddress = isP2PAuthor ? authorPeerJid : xmppAuthorJid
  const canFollowAuthor = Boolean(bridgePost && authorPeerId && (isP2PAuthor || (isXMPPAuthor && xmppAuthorJid.includes('@')))
    && !localAddresses.includes(targetAuthorAddress.toLowerCase()))

  useEffect(() => {
    let active = true
    setFollowingAuthor(false)
    setAuthorFollowStatus(undefined)
    if (!runtime || !canFollowAuthor || !authorPeerId) return () => { active = false }
    const loadFollowing = async () => {
      try {
        if (runtime.getFollowedFeedSources) {
          const sources = await runtime.getFollowedFeedSources()
          const target = isP2PAuthor ? authorPeerId : xmppAuthorJid
          const source = sources.find((item) => item.protocol === (isP2PAuthor ? 'p2p' : 'xmpp') && item.owner.toLowerCase() === target.toLowerCase())
          if (active) {
            setFollowingAuthor(Boolean(source))
            const status = source?.status === 'subscribed' || source?.status === 'pending' || source?.status === 'polling' ? source.status : undefined
            setAuthorFollowStatus(status)
          }
        } else if (isP2PAuthor) {
          const subscriptions = await runtime.getFeedSubscriptions()
          if (active) setFollowingAuthor(subscriptions.some((subscription) => subscription.peerId === authorPeerId))
        } else {
          const subscriptions = await runtime.getServerMicroblogSubscriptions?.() ?? []
          if (active) setFollowingAuthor(subscriptions.some((subscription) => subscription.jid.toLowerCase() === xmppAuthorJid))
        }
      } catch { /* follow state is rechecked when the user acts */ }
    }
    void loadFollowing()
    return () => { active = false }
  }, [runtime, canFollowAuthor, authorPeerId, isP2PAuthor, xmppAuthorJid])

  const toggleFollowAuthor = async () => {
    if (!runtime || !canFollowAuthor || changingFollow) return
    setChangingFollow(true)
    try {
      const source = { protocol: isP2PAuthor ? 'p2p' as const : 'xmpp' as const, owner: isP2PAuthor ? authorPeerId! : xmppAuthorJid }
      let nextStatus: 'subscribed' | 'pending' | 'polling' | undefined
      if (runtime.followFeedSource && runtime.unfollowFeedSource) {
        if (followingAuthor) await runtime.unfollowFeedSource(source)
        else {
          const status = await runtime.followFeedSource(source)
          if (status === 'unconfigured') throw new Error('This XMPP server requires subscription options that Nexus cannot provide yet.')
          nextStatus = status
          if (source.protocol === 'xmpp' && status !== 'pending') await runtime.refreshServerMicroblog?.(source.owner)
        }
      } else if (followingAuthor) {
        if (isP2PAuthor) await runtime.unsubscribeFeed(authorPeerJid)
        else {
          if (!runtime.unsubscribeServerMicroblog) throw new Error('XMPP microblog following is unavailable in this client.')
          await runtime.unsubscribeServerMicroblog(xmppAuthorJid)
        }
      } else {
        if (isP2PAuthor) await runtime.subscribeFeed(authorPeerJid)
        else {
          if (!runtime.subscribeServerMicroblog) throw new Error('XMPP microblog following is unavailable in this client.')
          const status = await runtime.subscribeServerMicroblog(xmppAuthorJid)
          if (status === 'unconfigured') throw new Error('This XMPP server requires subscription options that Nexus cannot provide yet.')
          nextStatus = status
          if (status !== 'pending') await runtime.refreshServerMicroblog?.(xmppAuthorJid)
        }
      }
      if (followingAuthor) {
        setFollowingAuthor(false)
        setAuthorFollowStatus(undefined)
      } else {
        setFollowingAuthor(true)
        setAuthorFollowStatus(nextStatus ?? 'subscribed')
      }
      emitToast(followingAuthor
        ? `Unfollowed ${isP2PAuthor ? `@${authorPeerId}` : xmppAuthorJid}`
        : nextStatus === 'pending'
          ? `Subscription request sent to ${xmppAuthorJid}; waiting for approval`
          : nextStatus === 'polling'
            ? `Following ${xmppAuthorJid} with periodic refresh`
            : `Following ${isP2PAuthor ? `@${authorPeerId}` : xmppAuthorJid}; new posts will appear in your feed`, 'success')
    } catch (error) {
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
    if (hash !== '#reply' || loading) return
    const textarea = replyTextareaRef.current
    textarea?.scrollIntoView({ block: 'center' })
    textarea?.focus({ preventScroll: true })
  }, [hash, loading])

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

  if (!id || !bridgePost) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        {loading ? <div role="status" className="text-sm text-muted-foreground">Loading post…</div> : loadError ? (
          <>
            <p role="alert" className="max-w-sm text-sm text-destructive">Could not load this post: {loadError}</p>
            <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70">Try again</button>
          </>
        ) : !getBrowserXmppBridge() ? (
          <>
            <p className="text-sm font-medium text-foreground">The peer network is unavailable</p>
            <p className="max-w-xs text-xs text-muted-foreground">Reconnect to the peer network to open this post.</p>
            <button type="button" onClick={() => navigate('/settings')} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70">Open Settings</button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Post not found</p>
            <p className="max-w-xs text-xs text-muted-foreground">This post is not in your feed or is no longer available.</p>
            <button type="button" onClick={() => navigate('/')} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70">Go to feed</button>
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
            <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-sm font-semibold text-muted-foreground">
              <span aria-hidden="true">{post.author.name.trim().charAt(0).toUpperCase() || '?'}</span>
              {post.author.avatar && <img src={post.author.avatar} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-semibold text-sm text-foreground">{post.author.name}</span>
                {post.author.verified && <Shield size={12} className="text-primary" />}
                <span className="shrink-0 rounded border border-primary/20 px-1 py-0.5 font-mono text-[9px] text-primary">
                  {post.sourceProtocol === 'rss' ? 'RSS/Atom' : post.sourceProtocol === 'xmpp' ? 'XMPP PubSub' : 'P2P'}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="max-w-[38vw] truncate font-mono text-[11px] text-muted-foreground">@{post.author.handle}</span>
                <span className="hidden text-muted-foreground/40 sm:inline">·</span>
                <span className="hidden min-w-0 truncate font-mono text-[11px] text-muted-foreground sm:inline">{post.author.server}</span>
              </div>
            </div>
              {canFollowAuthor && (
                <button
                  type="button"
                  onClick={() => void toggleFollowAuthor()}
                  disabled={!runtime || changingFollow}
                  aria-pressed={followingAuthor}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${followingAuthor ? 'border-border text-muted-foreground hover:bg-secondary' : 'border-primary/40 text-primary hover:bg-primary/10'}`}
                >
                  {followingAuthor ? <UserMinus size={14} /> : <UserPlus size={14} />}
                  {changingFollow ? 'Updating…' : authorFollowStatus === 'pending' ? 'Requested' : followingAuthor ? 'Following' : 'Follow'}
                </button>
              )}
          </div>
          {followingAuthor && authorFollowStatus === 'pending' && <p role="status" className="mb-2 pl-[3.25rem] text-xs text-warn">Subscription request sent; waiting for approval.</p>}
          {followingAuthor && authorFollowStatus === 'polling' && <p role="status" className="mb-2 pl-[3.25rem] text-xs text-muted-foreground">Push updates are unavailable; posts refresh periodically while Feed is open.</p>}

          {post.topic && (
            <div className="mb-2">
              <span className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
                style={{ color: post.topicColor, backgroundColor: post.topicColor + '1a' }}>
                <Hash size={9} className="shrink-0" /><span className="min-w-0 truncate">{post.topic}</span>
              </span>
            </div>
          )}
          {post.community && (
            <div className="mb-2">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-warn/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-warn">
                <span className="shrink-0">{post.communityIcon}</span><span className="min-w-0 truncate">{post.community}</span>
              </span>
            </div>
          )}

          {post.sourceProtocol === 'rss' && post.title && <h1 className="mb-2 break-words text-lg font-semibold leading-snug text-foreground">{post.title}</h1>}
          <p className="mb-3 break-words whitespace-pre-line text-[15px] leading-relaxed text-foreground"><RichText text={post.content} interactive /></p>

          {post.externalUrl && (
            <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-primary hover:bg-secondary">
              <ExternalLink size={13} /> Read original{post.sourceName ? ` at ${post.sourceName}` : ''}
            </a>
          )}

          {post.media && (
            <div className="mb-3 rounded-lg overflow-hidden border border-border bg-secondary">
              <img src={post.media.url} alt={post.media.alt} loading="lazy" referrerPolicy="no-referrer" className="w-full object-cover max-h-72" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 pb-3 border-b border-border">
            <span className="font-mono text-[11px] text-muted-foreground">{post.fullDate}</span>
            <span className="text-border">·</span>
            <PrivacyIcon privacy={post.privacy} />
            <span className="font-mono text-[11px] text-muted-foreground capitalize">{post.privacy ?? 'public'}</span>
            {supportsSocialActions && <>
              <span className="hidden text-border sm:inline">·</span>
              <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{formatNum(post.views)} views</span>
            </>}
          </div>

          <div className={`flex items-center gap-2 pt-1 ${supportsSocialActions ? '' : 'justify-end'}`}>
            {supportsSocialActions && <>
            <button
              onClick={handleRepost}
              disabled={reposted}
              aria-label={reposted ? 'Post already reposted' : 'Repost'}
              className={`hidden min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 transition-all disabled:cursor-default md:flex ${reposted ? 'text-success' : 'text-muted-foreground hover:text-success hover:bg-success/10'}`}
            >
              <Repeat2 size={19} />
              <span className="font-mono text-xs tabular-nums">{formatNum(reposts)}</span>
            </button>
            <button onClick={() => void handleLike()} disabled={liked} aria-label={liked ? 'Post already liked' : 'Like post'} aria-pressed={liked}
              className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 transition-all disabled:cursor-default ${liked ? 'text-liked' : 'text-muted-foreground hover:text-liked hover:bg-liked/10'}`}>
              <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
              <span className="font-mono text-xs tabular-nums">{formatNum(likes)}</span>
            </button>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">{formatNum(post.comments)} replies</span>
            </>}
            <details className="relative">
              <summary aria-label="More post actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                <MoreHorizontal size={18} />
              </summary>
              <div className="absolute bottom-full right-0 z-20 mb-1 min-w-44 rounded-xl border border-border bg-card p-1 shadow-xl">
                {supportsSocialActions && <button type="button" disabled={reposted} aria-pressed={reposted}
                  onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void handleRepost() }}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-secondary disabled:cursor-default md:hidden ${reposted ? 'text-success' : 'text-foreground'}`}>
                  <Repeat2 size={15} />{reposted ? 'Reposted' : 'Repost'}
                </button>}
                <button type="button" aria-pressed={bookmarked}
                  onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); const next = !bookmarked; setBookmarked(next); if (bridgePost) bookmarkPost(post.id) }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                  <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />{bookmarked ? 'Remove bookmark' : 'Bookmark'}
                </button>
                <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void handleShare() }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                  <Share2 size={15} /> Share
                </button>
              </div>
            </details>
          </div>
        </div>

        {supportsSocialActions && <div className="px-4 py-3 border-b border-border flex gap-3 items-start">
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
                <div className="hidden items-center gap-0.5 md:flex">
                  <button type="button" onClick={() => insertReplyText('![](https://)')} aria-label="Insert image link" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5">
                    <Image size={15} />
                  </button>
                  <button type="button" onClick={() => insertReplyText('@')} aria-label="Insert mention" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5">
                    <AtSign size={15} />
                  </button>
                  <button type="button" onClick={() => insertReplyText('😊')} aria-label="Insert emoji" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5">
                    <Smile size={15} />
                  </button>
                </div>
                <details className="relative md:hidden">
                  <summary aria-label="More reply tools" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <MoreHorizontal size={17} />
                  </summary>
                  <div className="absolute bottom-full left-0 z-20 mb-1 min-w-44 rounded-xl border border-border bg-card p-1 shadow-xl">
                    <button type="button" onClick={(event) => { insertReplyText('![](https://)'); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                      <Image size={15} /> Insert image link
                    </button>
                    <button type="button" onClick={(event) => { insertReplyText('@'); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                      <AtSign size={15} /> Insert mention
                    </button>
                    <button type="button" onClick={(event) => { insertReplyText('😊'); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                      <Smile size={15} /> Insert emoji
                    </button>
                  </div>
                </details>
                <span className={`font-mono text-[10px] ml-auto ${500 - replyText.length < 50 ? 'text-warn' : 'text-muted-foreground'}`}>
                  {500 - replyText.length}
                </span>
                <button onClick={() => void handleSubmitReply()} disabled={submittingReply || !replyText.trim()}
                  className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  <Send size={12} />{submittingReply ? 'Sending…' : 'Reply'}
                </button>
              </div>
            )}
          </div>
        </div>}

        {supportsSocialActions && replies.length > 0 && (
          <div className="border-b border-border px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Replies</span>
          </div>
        )}

        {supportsSocialActions && <div>
          {replies.map((reply) => (
            <div key={reply.id} className="border-b border-border last:border-0">
              <ReplyThread reply={reply} onLike={(replyId) => { void handleLikeReply(replyId) }} onRepost={(replyId) => { void handleRepostReply(replyId) }} onReplySubmit={handleSubmitNestedReply} />
            </div>
          ))}
        </div>}

        {supportsSocialActions && replies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-16">
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
