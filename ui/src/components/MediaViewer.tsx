import { useState, useEffect, useCallback } from 'react'
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
  const current = items[currentIndex]

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) setCurrentIndex((i) => i + 1)
  }, [currentIndex, items.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }, [currentIndex])

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

      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
          aria-label="Previous image"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {currentIndex < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
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
              {currentIndex + 1} / {items.length}
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
