import { Bookmark } from 'lucide-react'
import type { Article } from '../../bridge/article/types'

interface ArticleCardProps {
  article: Article
  variant?: 'feature' | 'compact' | 'feed'
  onBookmark?: (id: string) => void
  onClick?: (id: string) => void
}

export default function ArticleCard({ article, variant = 'compact', onBookmark, onClick }: ArticleCardProps) {
  const handleClick = () => onClick?.(article.id)
  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation()
    onBookmark?.(article.id)
  }

  if (variant === 'feature') {
    return (
      <div
        onClick={handleClick}
        className="bg-card rounded-2xl border border-border overflow-hidden cursor-pointer hover:bg-white/[0.03] transition-colors"
      >
        {article.coverImage ? (
          <div className="h-[126px] bg-secondary overflow-hidden">
            <img src={article.coverImage} alt={article.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-[126px] bg-secondary" />
        )}
        <div className="p-4">
          {article.topic && (
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">#{article.topic}</span>
          )}
          <h3 className="text-xl font-semibold text-foreground mt-1 leading-tight line-clamp-2">{article.title}</h3>
          {article.subtitle && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.subtitle}</p>
          )}
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-muted-foreground">
              {article.author.name} · {article.readTime}
            </span>
            <button onClick={handleBookmark} className="text-muted-foreground hover:text-primary transition-colors">
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
        onClick={handleClick}
        className="border-b border-border hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex gap-4 px-4 py-3">
          {article.coverImage && (
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
              <img src={article.coverImage} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Article</span>
              {article.topic && (
                <span className="text-[10px] font-mono text-muted-foreground">#{article.topic}</span>
              )}
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{article.title}</h4>
            <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{article.subtitle}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-mono text-muted-foreground">{article.author.name}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[10px] font-mono text-muted-foreground">{article.readTime}</span>
            </div>
          </div>
          <button onClick={handleBookmark} className="self-start mt-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
            <Bookmark size={14} fill={article.bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      className="bg-card rounded-2xl border border-border overflow-hidden cursor-pointer hover:bg-white/[0.03] transition-colors"
    >
      <div className="p-4">
        {article.topic && (
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">#{article.topic}</span>
        )}
        <h3 className="text-base font-semibold text-foreground mt-1 leading-tight line-clamp-2">{article.title}</h3>
        {article.subtitle && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.subtitle}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-muted-foreground">
            {article.author.name} · {article.readTime}
          </span>
          <button onClick={handleBookmark} className="text-muted-foreground hover:text-primary transition-colors">
            <Bookmark size={18} fill={article.bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  )
}
