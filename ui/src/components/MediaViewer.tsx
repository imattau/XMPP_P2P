import { useEffect, useCallback } from 'react'
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
  const current = items[initialIndex]

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && initialIndex > 0) {
        const newIndex = initialIndex - 1
        history.replaceState(null, '', `#media-${newIndex}`)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
      if (e.key === 'ArrowRight' && initialIndex < items.length - 1) {
        const newIndex = initialIndex + 1
        history.replaceState(null, '', `#media-${newIndex}`)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
    },
    [onClose, initialIndex, items.length]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
        aria-label="Close viewer"
      >
        <X size={20} />
      </button>

      {initialIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const img = document.querySelector('[data-media-index]')
            if (img) {
              img.setAttribute('data-media-index', String(initialIndex - 1))
              img.setAttribute('src', items[initialIndex - 1].url)
            }
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
          aria-label="Previous image"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {initialIndex < items.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const img = document.querySelector('[data-media-index]')
            if (img) {
              img.setAttribute('data-media-index', String(initialIndex + 1))
              img.setAttribute('src', items[initialIndex + 1].url)
            }
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
          aria-label="Next image"
        >
          <ChevronRight size={24} />
        </button>
      )}

      <div className="flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.alt}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          style={{ imageRendering: 'auto' }}
        />
        <div className="flex items-center gap-3">
          {items.length > 1 && (
            <span className="font-mono text-[11px] text-white/60">
              {initialIndex + 1} / {items.length}
            </span>
          )}
          <a
            href={current.url}
            download={current.alt}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-mono hover:bg-white/20 transition-colors"
          >
            <Download size={12} />
            Download
          </a>
        </div>
      </div>
    </div>
  )
}
