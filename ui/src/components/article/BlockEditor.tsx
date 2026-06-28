import { GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ArticleBlock, ArticleBlockType } from '../../bridge/article/types'
import { generateBlockId } from '../../bridge/article/controller'
import BlockEditorToolbar from './BlockEditorToolbar'
import InsertBlockPicker from './InsertBlockPicker'

interface BlockEditorProps {
  blocks: ArticleBlock[]
  onChange: (blocks: ArticleBlock[]) => void
}

const BLOCK_LABELS: Record<ArticleBlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  quote: 'Quote',
  image: 'Image',
  gallery: 'Gallery',
  list: 'List',
  code: 'Code',
  table: 'Table',
  callout: 'Callout',
  divider: 'Divider',
  file: 'File',
  link: 'Link',
}

function createEmptyBlock(type: ArticleBlockType): ArticleBlock {
  return { id: generateBlockId(), type, content: '' }
}

export default function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [showInsertPicker, setShowInsertPicker] = useState(false)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  const handleContentChange = (id: string, content: string) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)))
  }

  const handleInsertBlock = (type: ArticleBlockType) => {
    const newBlock = createEmptyBlock(type)
    onChange([...blocks, newBlock])
    setShowInsertPicker(false)
    setEditingBlockId(newBlock.id)
  }

  const handleDeleteBlock = (id: string) => {
    if (blocks.length <= 1) return
    onChange(blocks.filter((b) => b.id !== id))
  }

  return (
    <div className="space-y-2">
      <BlockEditorToolbar onInsertBlock={handleInsertBlock} />

      <div className="space-y-2">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="bg-card rounded-xl border border-border p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <button className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0">
                <GripVertical size={16} />
              </button>
              <span className="text-xs font-semibold text-primary">{BLOCK_LABELS[block.type]}</span>
              <div className="flex-1" />
              <div className="flex items-center gap-0.5">
                {block.type === 'image' && !!block.meta?.url && (
                  <button
                    onClick={() => handleDeleteBlock(block.id)}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1 py-0.5 rounded"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={() => handleDeleteBlock(block.id)}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>

            {block.type === 'image' ? (
              <div
                onClick={() => {
                  const url = prompt('Image URL:')
                  if (url) {
                    onChange(blocks.map((b) => (b.id === block.id ? { ...b, meta: { ...b.meta, url } } : b)))
                  }
                }}
                className="min-h-[40px] bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                {block.meta?.url ? (
                  <div className="relative">
                    <img src={block.meta.url as string} alt="" className="w-full h-32 object-cover rounded-lg" />
                    <span className="text-xs text-muted-foreground mt-1 block">{block.content}</span>
                  </div>
                ) : (
                  <span>Click to add image URL…</span>
                )}
              </div>
            ) : block.type === 'divider' ? (
              <hr className="border-border my-2" />
            ) : block.type === 'code' ? (
              <textarea
                value={block.content}
                onChange={(e) => handleContentChange(block.id, e.target.value)}
                placeholder="Write code…"
                className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[60px]"
                rows={3}
              />
            ) : (
              <div
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setEditingBlockId(block.id)}
                onBlur={(e) => handleContentChange(block.id, e.currentTarget.textContent ?? '')}
                className="min-h-[24px] bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                data-placeholder={
                  block.type === 'heading' ? 'Heading…'
                  : block.type === 'quote' ? 'Quote…'
                  : block.type === 'paragraph' ? 'Start writing…'
                  : 'Write…'
                }
                dangerouslySetInnerHTML={{ __html: block.content || '' }}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowInsertPicker(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-primary hover:bg-secondary/80 transition-colors text-sm font-medium"
      >
        <Plus size={16} />
        Add block
      </button>

      {showInsertPicker && (
        <InsertBlockPicker
          onSelect={handleInsertBlock}
          onClose={() => setShowInsertPicker(false)}
        />
      )}
    </div>
  )
}
