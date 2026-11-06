import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Hash, Plus, Search, UserRound, X } from 'lucide-react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import { useFeedBridge } from '../bridge/feed/useFeedBridge'
import { useBrowserXmppBridge, type BridgeFollowedFeedSource } from '../bridge/runtime'
import ArticleCard from '../components/article/ArticleCard'
import { PullToRefreshIndicator, usePullToRefresh } from '../components/PullToRefresh'
import { refreshExternalFeeds } from '../bridge/refreshExternalFeeds'

type TopicFilter = 'for-you' | 'following' | 'latest'

export default function TopicsPage() {
  const navigate = useNavigate()
  const { toggleBookmark, articles, getFollowedTopics, toggleFollowedTopic, loading, loadError, refresh } = useArticleBridge()
  const { posts, loading: feedLoading, refresh: refreshFeed } = useFeedBridge()
  const runtime = useBrowserXmppBridge()
  const [followedAuthorFeeds, setFollowedAuthorFeeds] = useState<BridgeFollowedFeedSource[]>([])
  const [activeFilter, setActiveFilter] = useState<TopicFilter>('for-you')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const pullRefresh = usePullToRefresh(async () => {
    await refreshExternalFeeds()
    await Promise.all([refresh(), refreshFeed()])
  }, loading || feedLoading)

  useEffect(() => {
    if (!runtime) {
      setFollowedAuthorFeeds([])
      return
    }
    let active = true
    const loadSubscriptions = async () => {
      try {
        const sources = runtime.getFollowedFeedSources
          ? await runtime.getFollowedFeedSources()
          : (await runtime.getFeedSubscriptions()).map((subscription) => ({
              id: `p2p:${subscription.peerId}`,
              protocol: 'p2p' as const,
              owner: subscription.peerId,
              node: subscription.topic,
              status: 'subscribed' as const,
              updatedAt: subscription.updatedAt,
            }))
        if (active) setFollowedAuthorFeeds(sources.filter((source) => source.protocol !== 'rss'))
      } catch {
        if (active) setFollowedAuthorFeeds([])
      }
    }
    void loadSubscriptions()
    const refreshOnFocus = () => { void loadSubscriptions() }
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      active = false
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [runtime])

  const published = articles.filter((a) => a.status === 'published')
  const followedTopics = getFollowedTopics()
  const topicCounts = new Map<string, { articles: number; p2p: number; xmpp: number; rss: number }>()
  const getCounts = (topic: string) => {
    const key = topic.toLocaleLowerCase()
    let counts = topicCounts.get(key)
    if (!counts) {
      counts = { articles: 0, p2p: 0, xmpp: 0, rss: 0 }
      topicCounts.set(key, counts)
    }
    return counts
  }
  for (const article of published) {
    const topic = article.topic.trim()
    if (topic) getCounts(topic).articles += 1
  }
  for (const post of posts) {
    if (post.type === 'community') continue
    const postTopics = [...new Set((post.topics?.length ? post.topics : post.topic ? [post.topic] : []).map((topic) => topic.trim()).filter(Boolean))]
    for (const topic of postTopics) {
      const counts = getCounts(topic)
      if (post.sourceProtocol === 'xmpp') counts.xmpp += 1
      else if (post.sourceProtocol === 'rss') counts.rss += 1
      else counts.p2p += 1
    }
  }
  const topicNames = new Map<string, string>()
  for (const article of published) if (article.topic.trim()) topicNames.set(article.topic.toLocaleLowerCase(), article.topic.trim())
  for (const post of posts) {
    if (post.type === 'community') continue
    const postTopics = post.topics?.length ? post.topics : post.topic ? [post.topic] : []
    for (const topic of postTopics) if (topic.trim()) topicNames.set(topic.toLocaleLowerCase(), topic.trim())
  }
  for (const topic of followedTopics) if (!topicNames.has(topic.toLocaleLowerCase())) topicNames.set(topic.toLocaleLowerCase(), topic)
  const topics = [...topicNames.values()]
    .filter((topic) => activeFilter !== 'following' || followedTopics.some((followed) => followed.toLowerCase() === topic.toLowerCase()))
    .filter((topic) => !searchQuery || topic.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => ((topicCounts.get(b.toLocaleLowerCase())?.articles ?? 0) + (topicCounts.get(b.toLocaleLowerCase())?.p2p ?? 0) + (topicCounts.get(b.toLocaleLowerCase())?.xmpp ?? 0) + (topicCounts.get(b.toLocaleLowerCase())?.rss ?? 0))
      - ((topicCounts.get(a.toLocaleLowerCase())?.articles ?? 0) + (topicCounts.get(a.toLocaleLowerCase())?.p2p ?? 0) + (topicCounts.get(a.toLocaleLowerCase())?.xmpp ?? 0) + (topicCounts.get(a.toLocaleLowerCase())?.rss ?? 0)) || a.localeCompare(b))

  const filtered = published.filter((a) => {
    if (activeFilter === 'following') {
      const followedTopics = getFollowedTopics()
      return followedTopics.some((topic) => topic.toLowerCase() === a.topic.toLowerCase())
    }
    return true
  }).filter((a) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      a.title.toLowerCase().includes(q) ||
      a.topic.toLowerCase().includes(q) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
      (a.summary && a.summary.toLowerCase().includes(q)) ||
      a.blocks.some((block) => block.content.toLowerCase().includes(q))
    )
  })

  const displayArticles = searchQuery
    ? filtered
    : activeFilter === 'latest'
      ? [...published].sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
      : filtered

  const featureArticle = displayArticles[0]
  const remainingArticles = displayArticles.slice(1)

  const handleBookmark = (id: string) => toggleBookmark(id)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Topics</h1>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => navigate('/?addFeed=1')} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold text-foreground hover:bg-secondary/80">
              <Plus size={15} /><span>Add feed</span>
            </button>
            {!searchOpen && <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search topics and articles"
              aria-expanded={searchOpen}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Search size={18} />
            </button>}
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                aria-label="Search topics and articles"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics and articles…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button onClick={() => {
                if (searchQuery) setSearchQuery('')
                else setSearchOpen(false)
              }} aria-label={searchQuery ? 'Clear article search' : 'Close article search'} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="h-px bg-border" />

        <div role="group" aria-label="Article filters" className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 scrollbar-hidden">
          {([
            { id: 'for-you', label: 'For you' },
            { id: 'following', label: 'Following' },
            { id: 'latest', label: 'Latest' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={activeFilter === f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`min-h-11 flex-shrink-0 whitespace-nowrap px-4 rounded-lg text-xs font-semibold transition-colors ${
                activeFilter === f.id
                  ? 'bg-blue2 text-primary'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="flex-1" />
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto px-4 py-4 space-y-6" {...pullRefresh.touchHandlers}>
        <PullToRefreshIndicator pullDistance={pullRefresh.pullDistance} refreshing={pullRefresh.refreshing} ready={pullRefresh.ready} />
        {followedAuthorFeeds.length > 0 && (
          <section aria-labelledby="followed-author-feeds-heading">
            <div className="mb-3">
              <h2 id="followed-author-feeds-heading" className="text-base font-semibold text-foreground">Followed author feeds</h2>
              <p className="mt-1 text-xs text-muted-foreground">Feeds you follow from Profile or a post.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {followedAuthorFeeds.map((source) => (
                <button
                  key={`${source.protocol}:${source.owner}`}
                  type="button"
                  onClick={() => navigate(`/?q=${encodeURIComponent(source.owner)}`)}
                  className="flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-white/[0.02]"
                  aria-label={`View ${source.protocol.toUpperCase()} feed from ${source.owner}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue2 text-primary"><UserRound size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{source.owner}</span>
                    <span className="block text-xs text-muted-foreground">{source.protocol.toUpperCase()} · {source.status === 'pending' ? 'Request pending' : source.status === 'polling' ? 'Syncing' : 'Following'}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {!loading && !feedLoading && topics.length > 0 && (
          <section aria-labelledby="discover-topics-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id="discover-topics-heading" className="text-base font-semibold text-foreground">Discover topics</h2>
                <p className="mt-1 text-xs text-muted-foreground">Discovered from tagged P2P, XMPP PubSub, and RSS/Atom posts. Following saves the topic to your local filter.</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{topics.length} {topics.length === 1 ? 'topic' : 'topics'}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {topics.map((topic) => {
                const following = followedTopics.some((item) => item.toLowerCase() === topic.toLowerCase())
                const counts = topicCounts.get(topic.toLocaleLowerCase()) ?? { articles: 0, p2p: 0, xmpp: 0, rss: 0 }
                const feedCount = counts.p2p + counts.xmpp + counts.rss
                return (
                  <div key={topic} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/?q=${encodeURIComponent(topic)}`)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                      aria-label={`Open topic ${topic}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue2 text-primary"><Hash size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{topic}</span>
                        <span className="block text-xs text-muted-foreground">
                          {counts.articles > 0 && <>{counts.articles} {counts.articles === 1 ? 'article' : 'articles'}</>}
                          {counts.articles > 0 && feedCount > 0 && ' · '}
                          {feedCount > 0 && <>{feedCount} {feedCount === 1 ? 'post' : 'posts'}</>}
                          {feedCount === 0 && counts.articles === 0 && 'Followed topic'}
                        </span>
                        {(counts.p2p > 0 || counts.xmpp > 0 || counts.rss > 0) && (
                          <span className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
                            {counts.p2p > 0 && <span>{counts.p2p} P2P</span>}
                            {counts.xmpp > 0 && <span>{counts.xmpp} XMPP</span>}
                            {counts.rss > 0 && <span>{counts.rss} RSS/Atom</span>}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={following}
                      aria-label={`${following ? 'Unfollow' : 'Follow'} ${topic}`}
                      onClick={() => toggleFollowedTopic(topic)}
                      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${following ? 'bg-blue2 text-primary' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}
                    >
                      {following ? <Check size={14} /> : <Plus size={14} />}
                      {following ? 'Following' : 'Follow'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!loading && !feedLoading && topics.length === 0 && !searchQuery && activeFilter !== 'following' && (
          <section className="rounded-xl border border-border bg-card px-4 py-5">
            <h2 className="text-sm font-semibold text-foreground">No topics to explore yet</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Topics appear when tagged posts arrive through P2P, XMPP PubSub, or RSS/Atom feeds. Add a feed or browse the feed to discover them.</p>
            <button type="button" onClick={() => navigate('/?addFeed=1')} className="mt-3 min-h-11 rounded-lg bg-secondary px-3 text-xs font-semibold text-foreground hover:bg-secondary/80">Add RSS/Atom feed</button>
          </section>
        )}

        {loading && published.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-20" role="status">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading articles…</p>
          </div>
        ) : displayArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-20">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            {loadError ? (
              <>
                <p className="text-sm text-destructive text-center" role="alert">{loadError}</p>
                <button onClick={() => void refresh()} className="min-h-11 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80">
                  Try again
                </button>
              </>
            ) : (
              <p className="break-words px-4 text-center text-sm text-muted-foreground">
                {activeFilter === 'following'
                  ? 'No articles from followed topics yet'
                  : searchQuery
                    ? `No articles matching "${searchQuery}"`
                    : 'No articles yet'}
              </p>
            )}
            {!loadError && !searchQuery && activeFilter !== 'following' && published.length === 0 && (
              <p className="max-w-sm text-center text-xs text-muted-foreground">Topics appear when posts include a topic tag. Follow an XMPP microblog in Feed or connect to the peer network to discover more.</p>
            )}
          </div>
        ) : (
          <>
            {featureArticle && !searchQuery && (
              <section>
                <ArticleCard
                  article={featureArticle}
                  variant="feature"
                  onBookmark={handleBookmark}
                  onClick={(id) => navigate(`/article/${encodeURIComponent(id)}`)}
                />
              </section>
            )}

            <section>
              {!searchQuery && (
                <h2 className="text-base font-semibold text-foreground mb-3">
                  {activeFilter === 'latest' ? 'Latest articles' : activeFilter === 'following' ? 'From followed topics' : 'For you'}
                </h2>
              )}

              <div className="space-y-3">
                {(searchQuery ? displayArticles : remainingArticles).map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    variant="compact"
                    onBookmark={handleBookmark}
                    onClick={(id) => navigate(`/article/${encodeURIComponent(id)}`)}
                  />
                ))}
              </div>

              {!searchQuery && remainingArticles.length === 0 && featureArticle && (
                <p className="text-xs text-muted-foreground text-center py-8">No more articles</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
