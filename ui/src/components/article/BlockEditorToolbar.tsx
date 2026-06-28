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
          onClick={() => onInsertBlock?.(tool.type)}
          className="w-[42px] h-[32px] lg:w-[66px] lg:h-[32px] flex items-center justify-center bg-secondary rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors text-[11px] font-mono font-semibold flex-shrink-0"
          title={`Insert ${tool.type}`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  )
}
