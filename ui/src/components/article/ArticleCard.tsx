import { Bookmark, Image as ImageIcon } from 'lucide-react'
import type { Article } from '../../bridge/article/types'
import { useResolvedUploadUrl } from '../../bridge/useResolvedUploadUrl'

interface ArticleCardProps {
  article: Article
  variant?: 'feature' | 'compact' | 'feed'
  onBookmark?: (id: string) => void
  onClick?: (id: string) => void
}

export default function ArticleCard({ article, variant = 'compact', onBookmark, onClick }: ArticleCardProps) {
  const coverImage = useResolvedUploadUrl(article.coverImage)
  const handleClick = () => onClick?.(article.id)
  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation()
    onBookmark?.(article.id)
  }

  if (variant === 'feature') {
    return (
      <div
        className="bg-card rounded-2xl border border-border overflow-hidden"
      >
        {article.coverImage ? (
          <div className="h-[126px] bg-secondary overflow-hidden">
            {coverImage.url
              ? <img src={coverImage.url} alt={article.title} className="w-full h-full object-cover" />
              : <CoverPlaceholder loading={coverImage.loading} feature />}
          </div>
        ) : null}
        <div className="p-4">
          {article.topic && (
            <span className="block min-w-0 truncate text-[11px] font-semibold text-primary uppercase tracking-wide">#{article.topic}</span>
          )}
          <h3 className="mt-1 leading-tight line-clamp-2"><button type="button" onClick={handleClick} className="min-h-11 text-left text-xl font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline">{article.title || 'Read article'}</button></h3>
          {article.subtitle && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.subtitle}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{article.author.name}</span>
            {article.settings.showReadingTime && <span className="shrink-0 text-[11px] text-muted-foreground">{article.readTime}</span>}
            <button type="button" onClick={handleBookmark} aria-label={article.bookmarked ? 'Remove bookmark' : 'Bookmark article'} aria-pressed={article.bookmarked}
              className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-primary transition-colors">
              <Bookmark size={18} fill={article.bookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'feed') {
    return (
      <div
        className="border-b border-border"
      >
        <div className="flex gap-3 px-3 py-3 sm:gap-4 sm:px-4">
          {article.coverImage && (
            <div className="h-16 w-16 rounded-xl overflow-hidden bg-secondary flex-shrink-0 sm:h-20 sm:w-20">
              {coverImage.url
                ? <img src={coverImage.url} alt="" className="w-full h-full object-cover" />
                : <CoverPlaceholder loading={coverImage.loading} />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-primary">Article</span>
              {article.topic && (
                <span className="min-w-0 truncate text-[11px] font-mono text-muted-foreground">#{article.topic}</span>
              )}
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2"><button type="button" onClick={handleClick} className="min-h-11 break-words text-left hover:text-primary focus-visible:outline-none focus-visible:underline">{article.title || 'Read article'}</button></h4>
            {article.subtitle && <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{article.subtitle}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="min-w-0 truncate text-[11px] font-mono text-muted-foreground">{article.author.name}</span>
              {article.settings.showReadingTime && <>
                <span className="text-muted-foreground/30">·</span>
                <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{article.readTime}</span>
              </>}
            </div>
          </div>
          <button type="button" onClick={handleBookmark} aria-label={article.bookmarked ? 'Remove bookmark' : 'Bookmark article'} aria-pressed={article.bookmarked}
            className="self-start flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
            <Bookmark size={18} fill={article.bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-card rounded-2xl border border-border overflow-hidden"
    >
      <div className="p-4">
        {article.topic && (
          <span className="block min-w-0 truncate text-[11px] font-semibold text-primary uppercase tracking-wide">#{article.topic}</span>
        )}
        <h3 className="mt-1 leading-tight line-clamp-2"><button type="button" onClick={handleClick} className="min-h-11 text-left text-base font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline">{article.title || 'Read article'}</button></h3>
        {article.subtitle && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.subtitle}</p>
        )}
        <div className="flex items-center gap-2 mt-3">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{article.author.name}</span>
          {article.settings.showReadingTime && <span className="shrink-0 text-[11px] text-muted-foreground">{article.readTime}</span>}
          <button type="button" onClick={handleBookmark} aria-label={article.bookmarked ? 'Remove bookmark' : 'Bookmark article'} aria-pressed={article.bookmarked}
            className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-primary transition-colors">
            <Bookmark size={18} fill={article.bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  )
}

function CoverPlaceholder({ loading, feature = false }: { loading: boolean; feature?: boolean }) {
  return (
    <div
      role={loading ? 'status' : undefined}
      aria-label={loading ? 'Loading article cover image' : undefined}
      className={`flex h-full w-full items-center justify-center text-muted-foreground/70 ${loading ? 'animate-pulse' : ''}`}
    >
      <ImageIcon size={feature ? 24 : 20} aria-hidden="true" />
      {feature && !loading && <span className="ml-2 text-xs">Cover image unavailable</span>}
      {feature && loading && <span className="sr-only">Loading cover image…</span>}
    </div>
  )
}
