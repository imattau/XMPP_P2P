import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import type { Article } from '../../bridge/article/types'

interface PublishSettingsProps {
  article: Article
  serverConnected: boolean
  onUpdate: (article: Article) => void
  onPublish: (article: Article, destination: 'p2p' | 'xmpp') => void
  onSaveDraft: (article: Article) => void
  onBack: () => void
}

const TOPICS = ['XMPP', 'IDENTITY', 'PRIVACY', 'P2P', 'COMMUNITIES', 'FEDIVERSE']

export default function PublishSettings({ article, serverConnected, onUpdate, onPublish, onSaveDraft, onBack }: PublishSettingsProps) {
  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const topicPickerRef = useRef<HTMLDivElement>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [destination, setDestination] = useState<'p2p' | 'xmpp'>('p2p')

  useEffect(() => {
    if (!showTopicPicker) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !topicPickerRef.current?.contains(event.target)) {
        setShowTopicPicker(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTopicPicker(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showTopicPicker])

  const publish = async () => {
    setPublishing(true)
    setPublishError('')
    try {
      await onPublish(article, destination)
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Could not publish this article')
    } finally {
      setPublishing(false)
    }
  }

  const handleChangeTopic = (topic: string) => {
    onUpdate({ ...article, topic })
    setShowTopicPicker(false)
  }

  const handleToggle = (key: 'showReadingTime') => {
    onUpdate({
      ...article,
      settings: { ...article.settings, [key]: !article.settings[key] },
    })
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 flex-shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button onClick={onBack} aria-label="Back to preview" className="flex h-11 w-11 -ml-1.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Publish article</h1>
            <p className="text-[11px] text-muted-foreground">Review your topic and publishing options</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:space-y-6 max-w-lg mx-auto w-full">
        <section>
          <h3 className="text-xs font-semibold text-foreground mb-2">Publish to</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Article publishing destination">
            <button
              type="button"
              aria-pressed={destination === 'p2p'}
              onClick={() => setDestination('p2p')}
              className={`min-w-0 rounded-xl border p-2 text-left transition-colors sm:p-3 ${destination === 'p2p' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary'}`}
            >
              <span className="block text-xs font-semibold text-foreground sm:text-sm">Peer feed</span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">Share with your P2P network</span>
            </button>
            <button
              type="button"
              disabled={!serverConnected}
              aria-pressed={destination === 'xmpp'}
              onClick={() => setDestination('xmpp')}
              className={`min-w-0 rounded-xl border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 sm:p-3 ${destination === 'xmpp' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary'}`}
            >
              <span className="block text-xs font-semibold text-foreground sm:text-sm">XMPP microblog</span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{serverConnected ? 'Publish to your connected account' : 'Connect an XMPP account in Settings to enable'}</span>
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-foreground mb-2">Topic</h3>
          <div className="relative">
            <div className="bg-card rounded-xl p-4 flex items-center justify-between border border-border">
              <span className="text-base font-semibold text-primary">
                {article.topic ? `#${article.topic}` : 'Select a topic'}
              </span>
              <button
                onClick={() => setShowTopicPicker(!showTopicPicker)}
                className="min-h-11 rounded-lg px-3 text-xs font-semibold text-primary hover:underline"
              >
                {article.topic ? 'Change' : 'Select'}
              </button>
            </div>
            {showTopicPicker && (
              <div ref={topicPickerRef} className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto w-auto max-w-lg overflow-hidden rounded-xl border border-border bg-card p-2 shadow-lg sm:absolute sm:inset-x-0 sm:top-full sm:bottom-auto sm:z-10 sm:mx-0 sm:max-w-none">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose a topic">
                  {TOPICS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={article.topic === t}
                      onClick={() => handleChangeTopic(t)}
                      className={`min-h-11 rounded-lg border px-3 text-left text-sm transition-colors hover:bg-secondary ${
                        article.topic === t ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border text-foreground/80'
                      }`}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <details className="rounded-xl border border-border bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
            <span className="flex-1">Display options</span>
            <span className="text-[11px] font-normal text-muted-foreground">Optional</span>
            <ChevronDown size={14} className="text-muted-foreground/50" />
          </summary>
          <div className="border-t border-border p-2">
            <SettingRow label="Show reading time" checked={article.settings.showReadingTime} onToggle={() => handleToggle('showReadingTime')} />
          </div>
        </details>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{destination === 'xmpp' ? 'This article will be public on your XMPP microblog. Followers with an article-aware client can open the full article.' : 'Articles are published publicly to your peer feed. Private and follower-only article delivery is not supported yet.'}</p>

      </div>
      <footer className="flex-shrink-0 border-t border-border bg-background/95 p-4 backdrop-blur">
        {publishError && <p role="alert" className="mb-2 text-xs text-destructive text-center">{publishError}</p>}
        <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void publish()}
          disabled={!article.title.trim() || !article.topic || publishing}
          className="min-h-11 min-w-0 rounded-xl bg-primary px-2 text-primary-foreground font-semibold text-xs sm:text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {publishing ? 'Publishing…' : destination === 'xmpp' ? 'Publish to XMPP' : 'Publish now'}
        </button>
        <button
          onClick={() => onSaveDraft(article)}
          className="min-h-11 min-w-0 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          Save as draft
        </button>
        </div>
      </footer>
    </div>
  )
}

function SettingRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="bg-card rounded-xl px-4 py-3 flex items-center justify-between border border-border">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onToggle}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg"
      >
      <span aria-hidden="true" className={`relative h-[26px] w-[42px] rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-secondary'}`}>
        <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
        </span>
      </button>
    </div>
  )
}
