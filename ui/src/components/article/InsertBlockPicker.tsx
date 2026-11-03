import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AlignLeft, ChevronDown, Code, FileText, Heading1, Image, Images, Info, Link, List, Minus, Quote, Table2, X, type LucideIcon } from 'lucide-react'
import type { ArticleBlockType } from '../../bridge/article/types'

interface InsertBlockPickerProps {
  onSelect: (type: ArticleBlockType) => void
  onClose: () => void
}

const BLOCK_OPTIONS: Array<{ type: ArticleBlockType; label: string; icon: LucideIcon }> = [
  { type: 'paragraph', label: 'Text', icon: AlignLeft },
  { type: 'heading', label: 'Heading', icon: Heading1 },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'gallery', label: 'Gallery', icon: Images },
  { type: 'quote', label: 'Quote', icon: Quote },
  { type: 'list', label: 'List', icon: List },
  { type: 'code', label: 'Code', icon: Code },
  { type: 'table', label: 'Table', icon: Table2 },
  { type: 'callout', label: 'Callout', icon: Info },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'file', label: 'File', icon: FileText },
  { type: 'link', label: 'Link', icon: Link },
]

const COMMON_BLOCK_TYPES = new Set<ArticleBlockType>(['paragraph', 'heading', 'image', 'quote', 'list'])

export default function InsertBlockPicker({ onSelect, onClose }: InsertBlockPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstControl = dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')
    firstControl?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const renderOption = (opt: typeof BLOCK_OPTIONS[number]) => {
    const Icon = opt.icon
    return (
      <button
        key={opt.type}
        type="button"
        onClick={() => onSelect(opt.type)}
        className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-foreground">{opt.label}</span>
      </button>
    )
  }

  return (
    <div className="safe-area-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="insert-block-title" aria-describedby="insert-block-description" tabIndex={-1}
        onClick={(event) => event.stopPropagation()} onKeyDown={trapFocus}
        className="bg-background w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-full overflow-y-auto">
        <div className="mb-1 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="insert-block-title" className="text-lg font-semibold text-foreground">Insert block</h3>
            <p id="insert-block-description" className="text-xs text-muted-foreground mt-0.5">Choose a content block</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close block picker"
            className="-mr-2 -mt-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {BLOCK_OPTIONS.filter((opt) => COMMON_BLOCK_TYPES.has(opt.type)).map(renderOption)}
        </div>

        <details className="mt-3 rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-foreground">
            <span className="flex-1">More block types</span>
            <ChevronDown size={14} className="text-muted-foreground/60" />
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
            {BLOCK_OPTIONS.filter((opt) => !COMMON_BLOCK_TYPES.has(opt.type)).map(renderOption)}
          </div>
        </details>

      </div>
    </div>
  )
}
