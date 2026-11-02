import { ArrowLeft } from 'lucide-react'
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
          <div className="flex items-center gap-3">
            <button onClick={onEdit} aria-label="Back to edit" className="flex h-11 w-11 -ml-1 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
              <ArrowLeft size={18} />
            </button>
            <span className="font-semibold text-sm">Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">Reader appearance</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {article.topic && (
          <span className="inline-block text-xs font-semibold text-primary mb-2">#{article.topic}</span>
        )}

        <h1 className="text-[30px] font-bold text-foreground leading-tight mb-2">{article.title}</h1>

        {article.subtitle && (
          <p className="text-base text-muted-foreground mb-3">{article.subtitle}</p>
        )}

        <p className="text-xs text-muted-foreground mb-6">
          {article.author.name}{article.settings.showReadingTime ? ` · ${article.readTime}` : ''}
        </p>

        {article.coverImage && (
          <div className="mb-6 rounded-xl overflow-hidden bg-secondary">
            {coverImage.url
              ? <img src={coverImage.url} alt={article.title} className="w-full h-48 object-cover" />
              : <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">{coverImage.loading ? <span role="status">Loading cover image…</span> : <button type="button" onClick={coverImage.retry} className="hover:text-foreground">Cover image unavailable · Retry</button>}</div>}
          </div>
        )}

        <ArticleBlocks blocks={article.blocks} readOnly />

        <div className="mt-10 flex items-center gap-3 pb-8">
          <button
            onClick={onEdit}
            className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            Back to edit
          </button>
          <button
            onClick={onPublish}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Publish
          </button>
        </div>
      </main>
    </div>
  )
}
