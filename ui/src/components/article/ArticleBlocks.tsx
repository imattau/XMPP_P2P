import type { ArticleBlock } from '../../bridge/article/types'
import { useResolvedUploadUrl } from '../../bridge/useResolvedUploadUrl'

function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

interface ArticleBlocksProps {
  blocks: ArticleBlock[]
  readOnly?: boolean
}

function ArticleImage({ url, alt, className }: { url: string; alt: string; className: string }) {
  const resolved = useResolvedUploadUrl(url)
  return resolved.url
    ? <img src={resolved.url} alt={alt} className={className} />
    : <div className={`${className} bg-secondary flex items-center justify-center text-xs text-muted-foreground`}>
        {resolved.loading
          ? <span role="status">Loading image…</span>
          : <button type="button" onClick={resolved.retry} className="hover:text-foreground">Image unavailable · Retry</button>}
      </div>
}

function ArticleFile({ url, label, size }: { url: string; label: string; size?: string }) {
  const resolved = useResolvedUploadUrl(url)
  return (
    <div className="bg-secondary rounded-xl p-4 my-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-muted-foreground text-lg">📄</div>
      <div className="flex-1 min-w-0">
        {resolved.url
          ? <a href={resolved.url} download={label || undefined} className="text-sm text-primary hover:underline truncate block">{label || 'Download file'}</a>
          : resolved.loading
            ? <p role="status" className="text-sm text-muted-foreground truncate">Loading {label || 'file'}…</p>
            : <button type="button" onClick={resolved.retry} className="text-sm text-primary hover:underline truncate block">{label || 'File'} unavailable · Retry</button>}
        {size && <p className="text-[11px] text-muted-foreground">{size}</p>}
      </div>
    </div>
  )
}

export default function ArticleBlocks({ blocks, readOnly = true }: ArticleBlocksProps) {
  const visibleBlocks = readOnly ? blocks.filter(hasRenderableContent) : blocks
  if (visibleBlocks.length === 0) {
    return null
  }

  return (
    <div className="space-y-1">
      {visibleBlocks.map((block) => {
        switch (block.type) {
          case 'heading':
            return (
              <h2 key={block.id} className="text-[21px] font-semibold text-foreground mt-8 mb-3 leading-snug">
                {block.content || <span className="text-muted-foreground">Heading</span>}
              </h2>
            )
          case 'paragraph':
            return (
              <p key={block.id} className="text-base text-foreground/90 leading-relaxed mb-4">
                {block.content || <span className="text-muted-foreground">Paragraph</span>}
              </p>
            )
          case 'quote':
            return (
              <blockquote key={block.id} className="border-l-2 border-primary/30 pl-4 py-2 my-4 text-[15px] text-muted-foreground italic">
                <p>{block.content || <span className="text-muted-foreground">Quote</span>}</p>
                {!!block.meta?.attribution && (
                  <footer className="text-xs text-muted-foreground mt-2 not-italic">— {String(block.meta.attribution)}</footer>
                )}
              </blockquote>
            )
          case 'image':
            return (
              <figure key={block.id} className="my-6">
                {block.meta?.url ? (
                  <ArticleImage url={block.meta.url as string} alt={block.content || ''} className="w-full rounded-xl object-cover max-h-80" />
                ) : (
                  <div className="w-full h-48 bg-secondary rounded-xl flex items-center justify-center text-muted-foreground text-sm">
                    {block.content || 'Image'}
                  </div>
                )}
                {block.content && (
                  <figcaption className="text-xs text-muted-foreground mt-2 text-center">{block.content}</figcaption>
                )}
              </figure>
            )
          case 'gallery':
            return (
              <div key={block.id} className="my-6 grid grid-cols-2 gap-2">
                {block.meta?.images && Array.isArray(block.meta.images)
                  ? (block.meta.images as Array<{ url: string; alt?: string }>).map((img, i) => (
                      <div key={i} className="rounded-xl overflow-hidden bg-secondary aspect-square">
                        <ArticleImage url={img.url} alt={img.alt ?? ''} className="w-full h-full object-cover" />
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
                  ? (block.meta.items as string[]).filter((item) => item.trim()).map((item, i) => <li key={i}>{item}</li>)
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
                {block.content || <span className="text-muted-foreground">Callout</span>}
              </div>
            )
          case 'divider':
            return <hr key={block.id} className="border-border my-8" />
          case 'table':
            {
              const rows = block.content.split('\n').map((row) => row.split('|').map((cell) => cell.trim())).filter((row) => row.some(Boolean))
              const [headers, ...bodyRows] = rows
              return (
                <div key={block.id} className="my-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm text-foreground/90">
                    {headers?.length > 0 && <thead><tr>{headers.map((cell, index) => <th key={index} className="border border-border p-2 text-left font-semibold">{cell}</th>)}</tr></thead>}
                    <tbody>{bodyRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="border border-border p-2">{cell}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )
            }
          case 'file':
            return typeof block.meta?.url === 'string'
              ? <ArticleFile key={block.id} url={block.meta.url} label={block.content || 'File'} size={block.meta.size ? String(block.meta.size) : undefined} />
              : <div key={block.id} className="bg-secondary rounded-xl p-4 my-4 text-sm text-muted-foreground">{block.content || 'File'}</div>
          case 'link':
            return safeWebUrl(block.meta?.href)
              ? <a key={block.id} href={safeWebUrl(block.meta?.href)} className="text-primary hover:underline text-base" target="_blank" rel="noopener noreferrer">{block.content || 'Link'}</a>
              : <span key={block.id} className="text-base text-foreground/90">{block.content || 'Link'}</span>
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

function hasRenderableContent(block: ArticleBlock): boolean {
  switch (block.type) {
    case 'divider':
      return true
    case 'image':
    case 'file':
      return Boolean(block.content.trim() || block.meta?.url)
    case 'gallery':
      return Array.isArray(block.meta?.images) && block.meta.images.length > 0
    case 'list':
      return Array.isArray(block.meta?.items)
        ? block.meta.items.some((item) => typeof item === 'string' && item.trim())
        : Boolean(block.content.trim())
    case 'link':
      return Boolean(block.content.trim() || safeWebUrl(block.meta?.href))
    default:
      return Boolean(block.content.trim())
  }
}
