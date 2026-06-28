import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
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
  const { toggleBookmark, articles } = useArticleBridge()
  const [following, setFollowing] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const topicTag = tag ?? ''
  const topicDescription = TOPIC_DESCRIPTIONS[topicTag] ?? 'Long-form writing and discussion'

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
          (a.subtitle && a.subtitle.toLowerCase().includes(q))
        )
      })
    : topicArticles

  const handleBookmark = (id: string) => toggleBookmark(id)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-foreground">#{topicTag}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchQuery(searchQuery ? '' : ' ')}
              className={`p-2 rounded-lg transition-colors ${
                searchQuery ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Search size={16} />
            </button>
            <button
              onClick={() => setFollowing(!following)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                following
                  ? 'bg-blue2 text-primary'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>

        {searchQuery && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search in #${topicTag}…`}
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
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-4 mt-4 p-5 rounded-2xl bg-blue2">
          <h2 className="text-[28px] font-bold text-primary">{topicTag}</h2>
          <p className="text-sm text-foreground/80 mt-1 max-w-xs">{topicDescription}</p>
          <button
            onClick={() => setFollowing(!following)}
            className="mt-4 px-4 py-1.5 rounded-lg bg-blue2 border border-primary/30 text-primary text-xs font-semibold"
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Search size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? `No articles matching "${searchQuery}"`
                  : 'No articles in this topic yet'}
              </p>
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
                      onClick={(id) => navigate(`/article/${id}`)}
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
                        onClick={(id) => navigate(`/article/${id}`)}
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
                        onClick={(id) => navigate(`/article/${id}`)}
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
