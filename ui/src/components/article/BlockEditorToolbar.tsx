import type { ArticleBlockType } from '../../bridge/article/types'

interface BlockEditorToolbarProps {
  onInsertBlock?: (type: ArticleBlockType) => void
}

const TOOLS: Array<{ type: ArticleBlockType; label: string }> = [
  { type: 'heading', label: 'H1' },
  { type: 'paragraph', label: 'P' },
  { type: 'quote', label: '"\u201c' },
  { type: 'list', label: '\u2022' },
  { type: 'code', label: '</>' },
  { type: 'image', label: '\uD83D\uDDBC' },
  { type: 'divider', label: '—' },
]

export default function BlockEditorToolbar({ onInsertBlock }: BlockEditorToolbarProps) {
  return (
    <div className="flex items-center gap-1.5 bg-card rounded-xl p-2 overflow-x-auto">
      {TOOLS.map((tool) => (
        <button
          key={tool.type}
          type="button"
          aria-label={`Insert ${tool.type} block`}
          onClick={() => onInsertBlock?.(tool.type)}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-mono font-semibold text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground lg:w-[66px]"
          title={`Insert ${tool.type}`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  )
}
