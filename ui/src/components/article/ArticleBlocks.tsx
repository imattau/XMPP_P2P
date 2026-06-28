import type { ArticleBlock } from '../../bridge/article/types'

interface ArticleBlocksProps {
  blocks: ArticleBlock[]
  readOnly?: boolean
}

export default function ArticleBlocks({ blocks, readOnly = true }: ArticleBlocksProps) {
  if (blocks.length === 0) {
    return null
  }

  return (
    <div className="space-y-1">
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading':
            return (
              <h2 key={block.id} className="text-[21px] font-semibold text-foreground mt-8 mb-3 leading-snug">
                {block.content || <span className="text-muted-foreground/40">Heading</span>}
              </h2>
            )
          case 'paragraph':
            return (
              <p key={block.id} className="text-base text-foreground/90 leading-relaxed mb-4">
                {block.content || <span className="text-muted-foreground/40">Paragraph</span>}
              </p>
            )
          case 'quote':
            return (
              <blockquote key={block.id} className="border-l-2 border-primary/30 pl-4 py-2 my-4 text-[15px] text-muted-foreground italic">
                <p>{block.content || <span className="text-muted-foreground/40">Quote</span>}</p>
                {!!block.meta?.attribution && (
                  <footer className="text-xs text-muted-foreground/60 mt-2 not-italic">— {String(block.meta.attribution)}</footer>
                )}
              </blockquote>
            )
          case 'image':
            return (
              <figure key={block.id} className="my-6">
                {block.meta?.url ? (
                  <img
                    src={block.meta.url as string}
                    alt={block.content || ''}
                    className="w-full rounded-xl object-cover max-h-80"
                  />
                ) : (
                  <div className="w-full h-48 bg-secondary rounded-xl flex items-center justify-center text-muted-foreground text-sm">
                    {block.content || 'Image'}
                  </div>
                )}
                {block.content && (
                  <figcaption className="text-xs text-muted-foreground/60 mt-2 text-center">{block.content}</figcaption>
                )}
              </figure>
            )
          case 'gallery':
            return (
              <div key={block.id} className="my-6 grid grid-cols-2 gap-2">
                {block.meta?.images && Array.isArray(block.meta.images)
                  ? (block.meta.images as Array<{ url: string; alt?: string }>).map((img, i) => (
                      <div key={i} className="rounded-xl overflow-hidden bg-secondary aspect-square">
                        <img src={img.url} alt={img.alt ?? ''} className="w-full h-full object-cover" />
                      </div>
                    ))
                  : (
                    <div className="col-span-2 h-32 bg-secondary rounded-xl flex items-center justify-center text-muted-foreground text-sm">
                      Gallery
                    </div>
                  )}
              </div>
            )
          case 'list':
            return (
              <ul key={block.id} className="list-disc pl-6 text-base text-foreground/90 mb-4 space-y-1">
                {block.meta?.items && Array.isArray(block.meta.items)
                  ? (block.meta.items as string[]).map((item, i) => <li key={i}>{item}</li>)
                  : <li>{block.content || 'List item'}</li>
                }
              </ul>
            )
          case 'code':
            return (
              <pre key={block.id} className="bg-secondary rounded-xl p-4 font-mono text-sm overflow-x-auto my-4 text-foreground/90 leading-relaxed">
                <code>{block.content || ''}</code>
              </pre>
            )
          case 'callout':
            return (
              <div key={block.id} className="bg-blue2/50 border border-primary/20 rounded-xl p-4 my-4 text-sm text-foreground/90">
                {block.content || <span className="text-muted-foreground/40">Callout</span>}
              </div>
            )
          case 'divider':
            return <hr key={block.id} className="border-border my-8" />
          case 'table':
            return (
              <div key={block.id} className="my-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm text-foreground/90">
                  <tbody>
                    <tr><td className="border border-border p-2 text-muted-foreground/40">{block.content || 'Table'}</td></tr>
                  </tbody>
                </table>
              </div>
            )
          case 'file':
            return (
              <div key={block.id} className="bg-secondary rounded-xl p-4 my-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-muted-foreground text-lg">📄</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{block.content || 'File'}</p>
                  {!!block.meta?.size && <p className="text-[11px] text-muted-foreground">{String(block.meta.size as string)}</p>}
                </div>
              </div>
            )
          case 'link':
            return (
              <a key={block.id} href={block.meta?.href as string || '#'} className="text-primary hover:underline text-base" target="_blank" rel="noopener noreferrer">
                {block.content || 'Link'}
              </a>
            )
          default:
            return (
              <p key={block.id} className="text-base text-foreground/90 leading-relaxed mb-4">
                {block.content}
              </p>
            )
        }
      })}
    </div>
  )
}
