import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, Filter } from 'lucide-react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import ArticleCard from '../components/article/ArticleCard'

type TopicFilter = 'for-you' | 'following' | 'latest'

export default function TopicsPage() {
  const navigate = useNavigate()
  const { getArticles, getLatestArticles, toggleBookmark, articles, getTopicArticles } = useArticleBridge()
  const [activeFilter, setActiveFilter] = useState<TopicFilter>('for-you')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const published = articles.filter((a) => a.status === 'published')

  const filtered = published.filter((a) => {
    if (activeFilter === 'following') {
      const followedTopics = ['XMPP', 'IDENTITY']
      return followedTopics.includes(a.topic)
    }
    return true
  }).filter((a) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      a.title.toLowerCase().includes(q) ||
      a.topic.toLowerCase().includes(q) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(q))
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
            className={`p-2 rounded-lg transition-colors ${
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground text-xs">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <div className="h-px bg-border" />

        <div className="flex items-center gap-2 px-4 py-2.5">
          {([
            { id: 'for-you', label: 'For you' },
            { id: 'following', label: 'Following' },
            { id: 'latest', label: 'Latest' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeFilter === f.id
                  ? 'bg-blue2 text-primary'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="flex-1" />
          <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Filter size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {displayArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {activeFilter === 'following'
                ? 'No articles from followed topics yet'
                : searchQuery
                  ? `No articles matching "${searchQuery}"`
                  : 'No articles yet'}
            </p>
          </div>
        ) : (
          <>
            {featureArticle && !searchQuery && (
              <section>
                <ArticleCard
                  article={featureArticle}
                  variant="feature"
                  onBookmark={handleBookmark}
                  onClick={(id) => navigate(`/article/${id}`)}
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
                    onClick={(id) => navigate(`/article/${id}`)}
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
