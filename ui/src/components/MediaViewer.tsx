import { useState, useEffect, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

interface MediaItem {
  url: string
  alt: string
}

export default function MediaViewer({
  items,
  initialIndex = 0,
  onClose,
}: {
  items: MediaItem[]
  initialIndex?: number
  onClose: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const current = items[currentIndex]

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) setCurrentIndex((i) => i + 1)
  }, [currentIndex, items.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }, [currentIndex])

  const handleTouchStart = (event: ReactTouchEvent<HTMLImageElement>) => {
    const touch = event.changedTouches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: ReactTouchEvent<HTMLImageElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || items.length < 2) return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return
    if (deltaX < 0) goNext()
    else goPrev()
  }

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    },
    [onClose, goPrev, goNext]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const trapTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${current.alt || 'Image'} viewer`}
      tabIndex={-1}
      className="safe-area-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={trapTabKey}
    >
      <button
        ref={closeButtonRef}
        onClick={onClose}
        className="absolute top-2 right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:top-4 sm:right-4"
        aria-label="Close viewer"
      >
        <X size={20} />
      </button>

      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:left-4 sm:flex"
          aria-label="Previous image"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {currentIndex < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:right-4 sm:flex"
          aria-label="Next image"
        >
          <ChevronRight size={24} />
        </button>
      )}

      <div className="flex max-h-full max-w-[90vw] flex-col items-center gap-3 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.alt}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`max-h-[72vh] rounded-lg object-contain shadow-2xl sm:max-h-[80vh] ${items.length > 1 ? 'max-w-[calc(100vw-6rem)] sm:max-w-full' : 'max-w-full'}`}
          style={{ imageRendering: 'auto' }}
        />
        <div className="flex items-center gap-3">
          {items.length > 1 && (
            <>
              <span className="font-mono text-[11px] text-white/60">
                {currentIndex + 1} / {items.length}
              </span>
              <span className="text-[10px] text-white/50 sm:hidden">Swipe to browse</span>
            </>
          )}
          <a
            href={current.url}
            download={current.alt}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-4 text-xs font-mono text-white hover:bg-white/20 transition-colors"
          >
            <Download size={12} />
            Download
          </a>
        </div>
      </div>
    </div>
  )
}
