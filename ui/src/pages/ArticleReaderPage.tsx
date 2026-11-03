import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Bookmark, Search, Share2 } from 'lucide-react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import ArticleBlocks from '../components/article/ArticleBlocks'
import { emitToast } from '../lib/toast-events'
import { useResolvedUploadUrl } from '../bridge/useResolvedUploadUrl'

export default function ArticleReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getArticle, toggleBookmark, loading, loadError, refresh } = useArticleBridge()
  const [bookmarked, setBookmarked] = useState(false)

  const article = id ? getArticle(id) : undefined
  const coverImage = useResolvedUploadUrl(article?.coverImage)

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
            <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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
            {loading ? <p role="status" className="text-sm text-muted-foreground">Loading article…</p> : loadError ? (
              <div className="space-y-3">
                <p role="alert" className="max-w-sm text-sm text-muted-foreground">Could not load this article: {loadError}</p>
                <button onClick={() => void refresh()} className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70">Try again</button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Article not found</p>
                <div className="mt-4">
                  <button onClick={() => navigate('/topics')} className="min-h-11 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                    Browse topics
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const handleBookmark = () => {
    if (toggleBookmark(article.id)) setBookmarked(!bookmarked)
  }

  const handleShare = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: article.title, url })
      else {
        await navigator.clipboard.writeText(url)
        emitToast('Article link copied', 'success')
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        emitToast('Could not share this article', 'error')
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <span className="truncate font-semibold text-sm">Article</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={handleBookmark}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark article'}
              aria-pressed={bookmarked}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                bookmarked ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => void handleShare()} aria-label="Share article" className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Share2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 max-w-2xl mx-auto w-full">
          <span className="mb-3 inline-block max-w-full truncate align-top text-xs font-semibold text-primary">#{article.topic}</span>

          <h1 className="break-words text-[26px] font-bold text-foreground leading-tight mb-3 sm:text-[30px]">{article.title}</h1>

          <p className="text-xs text-muted-foreground mb-5">
            {article.author.name} · {new Date(article.publishedAt ?? article.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {article.settings.showReadingTime ? ` · ${article.readTime}` : ''}
          </p>

          {article.coverImage && (
            <div className="mb-6 rounded-xl overflow-hidden bg-secondary">
              {coverImage.url
                ? <img src={coverImage.url} alt={article.title} className="h-40 w-full object-cover sm:h-48" />
                : <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">{coverImage.loading ? <span role="status">Loading cover image…</span> : <button type="button" onClick={coverImage.retry} className="min-h-11 rounded-lg px-3 hover:text-foreground">Cover image unavailable · Retry</button>}</div>}
            </div>
          )}

          <ArticleBlocks blocks={article.blocks} readOnly />
        </div>
      </main>

    </div>
  )
}
