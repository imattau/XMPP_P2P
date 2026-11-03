import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ArticleBlock, ArticleBlockType } from '../../bridge/article/types'
import { generateBlockId } from '../../bridge/article/controller'
import InsertBlockPicker from './InsertBlockPicker'

interface BlockEditorProps {
  blocks: ArticleBlock[]
  onChange: (blocks: ArticleBlock[]) => void
}

const BLOCK_LABELS: Record<ArticleBlockType, string> = {
  heading: 'Heading', paragraph: 'Text', quote: 'Quote', image: 'Image',
  gallery: 'Gallery', list: 'List', code: 'Code', table: 'Table',
  callout: 'Callout', divider: 'Divider', file: 'File', link: 'Link',
}

const fieldClass = 'min-h-11 w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30'

function createEmptyBlock(type: ArticleBlockType): ArticleBlock {
  return { id: generateBlockId(), type, content: '' }
}

export default function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [showInsertPicker, setShowInsertPicker] = useState(false)

  const updateBlock = (id: string, patch: Partial<ArticleBlock>) => {
    onChange(blocks.map((block) => block.id === id ? { ...block, ...patch } : block))
  }

  const updateMeta = (block: ArticleBlock, key: string, value: unknown) => {
    updateBlock(block.id, { meta: { ...block.meta, [key]: value } })
  }

  const handleInsertBlock = (type: ArticleBlockType) => {
    onChange([...blocks, createEmptyBlock(type)])
    setShowInsertPicker(false)
  }

  const moveBlock = (id: string, direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.id === id)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= blocks.length) return
    const reordered = [...blocks]
    ;[reordered[index], reordered[destination]] = [reordered[destination], reordered[index]]
    onChange(reordered)
  }

  const renderEditor = (block: ArticleBlock) => {
    switch (block.type) {
      case 'divider':
        return <hr className="border-border my-2" />
      case 'image':
        return <div className="space-y-2">
          <input type="url" aria-label="Image URL" value={String(block.meta?.url ?? '')} onChange={(event) => updateMeta(block, 'url', event.target.value)} placeholder="Image URL (https://…)" className={fieldClass} />
          <input aria-label="Image caption or alternative text" value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder="Caption or alternative text" className={fieldClass} />
          {!!block.meta?.url && <img src={String(block.meta.url)} alt={block.content} className="w-full max-h-56 rounded-lg object-cover" />}
        </div>
      case 'gallery': {
        const images = Array.isArray(block.meta?.images) ? block.meta.images as Array<{ url: string }> : []
        return <textarea value={images.map((image) => image.url).join('\n')} onChange={(event) => {
          const nextImages = event.target.value.split('\n').map((url) => url.trim()).filter(Boolean).map((url) => ({ url }))
          updateMeta(block, 'images', nextImages)
        }} aria-label="Gallery image URLs, one per line" placeholder="Add one image URL per line" rows={3} className={fieldClass} />
      }
      case 'list': {
        const items = Array.isArray(block.meta?.items) ? block.meta.items as string[] : (block.content ? [block.content] : [])
        return <textarea value={items.join('\n')} onChange={(event) => {
          const nextItems = event.target.value.split('\n')
          updateBlock(block.id, { content: '', meta: { ...block.meta, items: nextItems } })
        }} aria-label="List items, one per line" placeholder="One list item per line" rows={3} className={fieldClass} />
      }
      case 'table':
        return <textarea aria-label="Table content, columns separated by vertical bars" value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder={'Column A | Column B\nValue | Value'} rows={4} className={`${fieldClass} font-mono`} />
      case 'file':
        return <div className="space-y-2">
          <input aria-label="File name" value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder="File name" className={fieldClass} />
          <input type="url" aria-label="File URL" value={String(block.meta?.url ?? '')} onChange={(event) => updateMeta(block, 'url', event.target.value)} placeholder="File URL (https://…)" className={fieldClass} />
        </div>
      case 'link':
        return <div className="space-y-2">
          <input aria-label="Link text" value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder="Link text" className={fieldClass} />
          <input type="url" aria-label="Link URL" value={String(block.meta?.href ?? '')} onChange={(event) => updateMeta(block, 'href', event.target.value)} placeholder="https://…" className={fieldClass} />
        </div>
      case 'code':
        return <textarea aria-label="Code block" value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder="Write code…" rows={4} className={`${fieldClass} font-mono`} />
      case 'heading':
        return <input aria-label="Heading" value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder="Heading" className={fieldClass} />
      case 'paragraph':
      case 'quote':
      case 'callout':
      default:
        return <textarea aria-label={block.type === 'quote' ? 'Quote text' : block.type === 'callout' ? 'Callout text' : 'Paragraph text'} value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} placeholder={block.type === 'quote' ? 'Quote…' : block.type === 'callout' ? 'Callout text…' : 'Start writing…'} rows={3} className={fieldClass} />
    }
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <section key={block.id} aria-label={`${BLOCK_LABELS[block.type]} block`} className="bg-card rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">{BLOCK_LABELS[block.type]}</span>
              {blocks.length > 1 && (
                <details className="group relative ml-auto">
                  <summary aria-label={`${BLOCK_LABELS[block.type]} block actions`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <MoreHorizontal size={18} />
                  </summary>
                  <div className="absolute right-0 top-full z-20 min-w-44 rounded-xl border border-border bg-card p-1 shadow-xl">
                    {index > 0 && (
                      <button type="button" onClick={(event) => { moveBlock(block.id, -1); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                        <ArrowUp size={15} /> Move up
                      </button>
                    )}
                    {index < blocks.length - 1 && (
                      <button type="button" onClick={(event) => { moveBlock(block.id, 1); event.currentTarget.closest('details')?.removeAttribute('open') }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                        <ArrowDown size={15} /> Move down
                      </button>
                    )}
                    <button type="button" onClick={() => onChange(blocks.filter((item) => item.id !== block.id))} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10">
                      <Trash2 size={15} /> Remove block
                    </button>
                  </div>
                </details>
              )}
            </div>
            {renderEditor(block)}
          </section>
        ))}
      </div>

      <button type="button" onClick={() => setShowInsertPicker(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium text-primary transition-colors hover:bg-secondary/80">
        <Plus size={16} /> Add block
      </button>
      {showInsertPicker && <InsertBlockPicker onSelect={handleInsertBlock} onClose={() => setShowInsertPicker(false)} />}
    </div>
  )
}
