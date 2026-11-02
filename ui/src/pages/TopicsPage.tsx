import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import ArticleCard from '../components/article/ArticleCard'

type TopicFilter = 'for-you' | 'following' | 'latest'

export default function TopicsPage() {
  const navigate = useNavigate()
  const { toggleBookmark, articles, getFollowedTopics, loading, loadError, refresh } = useArticleBridge()
  const [activeFilter, setActiveFilter] = useState<TopicFilter>('for-you')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const published = articles.filter((a) => a.status === 'published')

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
            <p className="text-xs text-muted-foreground">Read ideas by subject</p>
          </div>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label={searchOpen ? 'Close article search' : 'Search articles'}
            aria-expanded={searchOpen}
            className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
              searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <Search size={18} />
          </button>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                aria-label="Search articles"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Clear article search" className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground text-xs">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <div className="h-px bg-border" />

        <div role="group" aria-label="Article filters" className="flex items-center gap-2 px-4 py-2.5">
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
              className={`min-h-11 px-4 rounded-lg text-xs font-semibold transition-colors ${
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

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {loading && published.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" role="status">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading articles…</p>
          </div>
        ) : displayArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
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
              <p className="text-sm text-muted-foreground">
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
            {!loadError && !searchQuery && activeFilter !== 'following' && published.length === 0 && (
              <button onClick={() => navigate('/')} className="min-h-11 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary">
                Explore feed
              </button>
            )}
            {!loadError && !searchQuery && activeFilter !== 'following' && published.length === 0 && (
              <button onClick={() => navigate('/compose')} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                Write an article
              </button>
            )}
            {!loadError && !searchQuery && activeFilter !== 'following' && published.length === 0 && (
              <button onClick={() => navigate('/settings')} className="min-h-11 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                Open peer settings
              </button>
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
                  {activeFilter === 'latest' ? 'Latest articles' : 'Latest articles'}
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
