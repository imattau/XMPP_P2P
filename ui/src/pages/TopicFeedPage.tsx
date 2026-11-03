import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, Search, X } from 'lucide-react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import ArticleCard from '../components/article/ArticleCard'

const TOPIC_DESCRIPTIONS: Record<string, string> = {
  XMPP: 'Open standards, messaging architecture and decentralised communication.',
  IDENTITY: 'Self-sovereign identity, verification and cryptographic trust.',
  PRIVACY: 'Digital privacy, encryption and data sovereignty.',
  P2P: 'Peer-to-peer protocols, networks and local-first architecture.',
  COMMUNITIES: 'Decentralised communities, governance and collective action.',
  FEDIVERSE: 'Federated protocols, ActivityPub, XMPP and the open social web.',
}

export default function TopicFeedPage() {
  const { tag } = useParams<{ tag: string }>()
  const navigate = useNavigate()
  const { toggleBookmark, articles, getFollowedTopics, toggleFollowedTopic, loading, loadError, refresh } = useArticleBridge()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const topicTag = tag ?? ''
  const topicDescription = TOPIC_DESCRIPTIONS[topicTag] ?? 'Long-form writing and discussion'
  const following = getFollowedTopics().some((topic) => topic.toLowerCase() === topicTag.toLowerCase())
  const toggleFollowing = () => toggleFollowedTopic(topicTag)

  const topicArticles = articles.filter(
    (a) => a.topic.toLowerCase() === topicTag.toLowerCase() && a.status === 'published'
  )

  const featured = topicArticles.slice(0, 1)
  const latest = topicArticles.slice(1)

  const filtered = searchQuery
    ? topicArticles.filter((a) => {
        const q = searchQuery.toLowerCase()
        return (
          a.title.toLowerCase().includes(q) ||
          (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
          (a.summary && a.summary.toLowerCase().includes(q)) ||
          a.blocks.some((block) => block.content.toLowerCase().includes(q))
        )
      })
    : topicArticles

  const handleBookmark = (id: string) => toggleBookmark(id)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="truncate font-semibold text-sm text-foreground">#{topicTag}</span>
          </div>
          {!searchOpen && <button
            onClick={() => setSearchOpen(true)}
            aria-label={`Search #${topicTag}`}
            aria-expanded={searchOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Search size={16} />
          </button>}
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                aria-label={`Search #${topicTag}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search in #${topicTag}…`}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button onClick={() => {
                if (searchQuery) setSearchQuery('')
                else setSearchOpen(false)
              }} aria-label={searchQuery ? 'Clear topic search' : 'Close topic search'} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-4 mt-3 flex items-start gap-2">
          <details className="group min-w-0 flex-1 rounded-xl bg-blue2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-foreground/80">
              <span className="flex-1">About this topic</span>
              <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-3 pb-3 text-sm leading-relaxed text-foreground/80">{topicDescription}</p>
          </details>
          <button
            type="button"
            aria-pressed={following}
            aria-label={`${following ? 'Unfollow' : 'Follow'} #${topicTag}`}
            onClick={toggleFollowing}
            className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
              following ? 'bg-blue2 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {loading && topicArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-16" role="status">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading articles…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-16">
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
                  {searchQuery
                    ? `No articles matching "${searchQuery}"`
                    : 'No articles in this topic yet'}
                </p>
              )}
            </div>
          ) : (
            <>
              {!searchQuery && featured.length > 0 && (
                <section>
                  <h3 className="text-base font-semibold text-foreground mb-3">Featured</h3>
                  {featured.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      variant="feature"
                      onBookmark={handleBookmark}
                      onClick={(id) => navigate(`/article/${encodeURIComponent(id)}`)}
                    />
                  ))}
                </section>
              )}

              {latest.length > 0 && !searchQuery && (
                <section>
                  <div className="space-y-3">
                    {latest.map((article) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        variant="compact"
                        onBookmark={handleBookmark}
                      onClick={(id) => navigate(`/article/${encodeURIComponent(id)}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {searchQuery && (
                <section>
                  <div className="space-y-3">
                    {filtered.map((article) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        variant="compact"
                        onBookmark={handleBookmark}
                      onClick={(id) => navigate(`/article/${encodeURIComponent(id)}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
