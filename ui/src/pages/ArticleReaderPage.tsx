import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Bookmark, Share2, Search } from 'lucide-react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import ArticleBlocks from '../components/article/ArticleBlocks'

export default function ArticleReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getArticle, toggleBookmark, articles } = useArticleBridge()
  const [bookmarked, setBookmarked] = useState(false)

  const article = id ? getArticle(id) : undefined

  useEffect(() => {
    if (article) {
      setBookmarked(article.bookmarked ?? false)
    }
  }, [article])

  if (!article) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <span className="font-semibold text-sm">Article</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
              <Search size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Article not found</p>
          </div>
        </div>
      </div>
    )
  }

  const handleBookmark = () => {
    toggleBookmark(article.id)
    setBookmarked(!bookmarked)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <span className="font-semibold text-sm">Article</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-muted-foreground">{article.readTime}</span>
            <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Search size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 max-w-2xl mx-auto w-full">
          <span className="inline-block text-xs font-semibold text-primary mb-3">#{article.topic}</span>

          <h1 className="text-[30px] font-bold text-foreground leading-tight mb-3">{article.title}</h1>

          <p className="text-xs text-muted-foreground mb-5">
            {article.author.name} · {new Date(article.publishedAt ?? article.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          {article.coverImage && (
            <div className="mb-6 rounded-xl overflow-hidden bg-secondary">
              <img src={article.coverImage} alt={article.title} className="w-full h-48 object-cover" />
            </div>
          )}

          <ArticleBlocks blocks={article.blocks} readOnly />
        </div>
      </main>

      <div className="sticky bottom-0 bg-background/90 backdrop-blur border-t border-border flex-shrink-0">
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            onClick={handleBookmark}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              bookmarked ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
          <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Share2 size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
