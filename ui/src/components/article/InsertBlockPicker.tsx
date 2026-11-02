import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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

  return (
    <div className="safe-area-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="insert-block-title" aria-describedby="insert-block-description" tabIndex={-1}
        onClick={(event) => event.stopPropagation()} onKeyDown={trapFocus}
        className="bg-background w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[80vh] overflow-y-auto">
        <div className="mb-1">
          <h3 id="insert-block-title" className="text-lg font-semibold text-foreground">Insert block</h3>
          <p id="insert-block-description" className="text-xs text-muted-foreground mt-0.5">Choose a content block</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          {BLOCK_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
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
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-xl bg-secondary text-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
