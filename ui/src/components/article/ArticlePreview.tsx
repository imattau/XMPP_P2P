import { ArrowLeft } from 'lucide-react'
import type { Article } from '../../bridge/article/types'
import ArticleBlocks from './ArticleBlocks'

interface ArticlePreviewProps {
  article: Article
  onEdit: () => void
  onPublish: () => void
}

export default function ArticlePreview({ article, onEdit, onPublish }: ArticlePreviewProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={onEdit} className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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
          {article.author.name} · {article.readTime}
        </p>

        {article.coverImage && (
          <div className="mb-6 rounded-xl overflow-hidden bg-secondary">
            <img src={article.coverImage} alt={article.title} className="w-full h-48 object-cover" />
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
            className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Publish
          </button>
        </div>
      </main>
    </div>
  )
}
