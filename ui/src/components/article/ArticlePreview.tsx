import type { Article } from '../../bridge/article/types'
import ArticleBlocks from './ArticleBlocks'
import { useResolvedUploadUrl } from '../../bridge/useResolvedUploadUrl'

interface ArticlePreviewProps {
  article: Article
  onEdit: () => void
  onPublish: () => void
}

export default function ArticlePreview({ article, onEdit, onPublish }: ArticlePreviewProps) {
  const coverImage = useResolvedUploadUrl(article.coverImage)
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex min-w-0 items-center">
            <span className="font-semibold text-sm">Preview</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {article.topic && (
          <span className="mb-2 inline-block max-w-full truncate align-top text-xs font-semibold text-primary">#{article.topic}</span>
        )}

        <h1 className="break-words text-2xl font-bold text-foreground leading-tight mb-2 sm:text-[30px]">{article.title}</h1>

        {article.subtitle && (
          <p className="text-base text-muted-foreground mb-3">{article.subtitle}</p>
        )}

        <p className="text-xs text-muted-foreground mb-6">
          {article.author.name}{article.settings.showReadingTime ? ` · ${article.readTime}` : ''}
        </p>

        {article.coverImage && (
          <div className="mb-6 rounded-xl overflow-hidden bg-secondary">
            {coverImage.url
              ? <img src={coverImage.url} alt={article.title} className="h-40 w-full object-cover sm:h-48" />
              : <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">{coverImage.loading ? <span role="status">Loading cover image…</span> : <button type="button" onClick={coverImage.retry} className="min-h-11 rounded-lg px-3 hover:text-foreground">Cover image unavailable · Retry</button>}</div>}
          </div>
        )}

        <ArticleBlocks blocks={article.blocks} readOnly />
      </main>
      <footer className="grid flex-shrink-0 grid-cols-2 gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={onEdit}
          className="min-h-11 rounded-xl bg-secondary px-3 text-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
        >
          Back to edit
        </button>
        <button
          onClick={onPublish}
          className="min-h-11 rounded-xl bg-primary px-3 text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          Publish
        </button>
      </footer>
    </div>
  )
}
