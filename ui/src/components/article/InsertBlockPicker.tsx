import type { ArticleBlockType } from '../../bridge/article/types'

interface InsertBlockPickerProps {
  onSelect: (type: ArticleBlockType) => void
  onClose: () => void
}

const BLOCK_OPTIONS: Array<{ type: ArticleBlockType; label: string; icon: string }> = [
  { type: 'paragraph', label: 'Text', icon: '+' },
  { type: 'heading', label: 'Heading', icon: '+' },
  { type: 'image', label: 'Image', icon: '\uD83D\uDDBC' },
  { type: 'gallery', label: 'Gallery', icon: '\uD83D\uDDBC' },
  { type: 'quote', label: 'Quote', icon: '\u275D' },
  { type: 'list', label: 'List', icon: '\u2630' },
  { type: 'code', label: 'Code', icon: '</>' },
  { type: 'table', label: 'Table', icon: '\u25A6' },
  { type: 'callout', label: 'Callout', icon: '!' },
  { type: 'divider', label: 'Divider', icon: '—' },
  { type: 'file', label: 'File', icon: '\uD83D\uDCC4' },
  { type: 'link', label: 'Link', icon: '\uD83D\uDD17' },
]

export default function InsertBlockPicker({ onSelect, onClose }: InsertBlockPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-background w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[80vh] overflow-y-auto">
        <div className="mb-1">
          <h3 className="text-lg font-semibold text-foreground">Insert block</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Choose a content block</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          {BLOCK_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => onSelect(opt.type)}
              className="flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-secondary transition-colors border border-border text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-sm text-muted-foreground flex-shrink-0">
                {opt.icon}
              </span>
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-xl bg-secondary text-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
