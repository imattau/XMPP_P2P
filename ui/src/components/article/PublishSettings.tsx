import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
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
  const [topicSearch, setTopicSearch] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [destination, setDestination] = useState<'p2p' | 'xmpp'>('p2p')

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

  const filteredTopics = TOPICS.filter((t) =>
    t.toLowerCase().includes(topicSearch.toLowerCase())
  )

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
      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-lg mx-auto w-full">
        <section>
          <h3 className="text-xs font-semibold text-foreground mb-2">Publish to</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Article publishing destination">
            <button
              type="button"
              aria-pressed={destination === 'p2p'}
              onClick={() => setDestination('p2p')}
              className={`rounded-xl border p-3 text-left transition-colors ${destination === 'p2p' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary'}`}
            >
              <span className="block text-sm font-semibold text-foreground">Peer feed</span>
              <span className="mt-1 block text-xs text-muted-foreground">Share with your P2P network</span>
            </button>
            <button
              type="button"
              disabled={!serverConnected}
              aria-pressed={destination === 'xmpp'}
              onClick={() => setDestination('xmpp')}
              className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${destination === 'xmpp' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary'}`}
            >
              <span className="block text-sm font-semibold text-foreground">XMPP microblog</span>
              <span className="mt-1 block text-xs text-muted-foreground">{serverConnected ? 'Publish to your connected account' : 'Connect an XMPP account in Settings to enable'}</span>
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
              <div className="absolute top-full mt-1 left-0 right-0 bg-card rounded-xl border border-border overflow-hidden z-10 shadow-lg">
                <div className="p-2 border-b border-border">
                  <input
                    autoFocus
                    aria-label="Search topics"
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder="Search topics…"
                    className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {filteredTopics.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleChangeTopic(t)}
                      className={`min-h-11 w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-secondary ${
                        article.topic === t ? 'text-primary' : 'text-foreground/80'
                      }`}
                    >
                      #{t}
                    </button>
                  ))}
                  {filteredTopics.length === 0 && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No topics found</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-foreground mb-2">Display</h3>
          <div className="space-y-2">
            <SettingRow label="Show reading time" checked={article.settings.showReadingTime} onToggle={() => handleToggle('showReadingTime')} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{destination === 'xmpp' ? 'This article will be public on your XMPP microblog. Followers with an article-aware client can open the full article.' : 'Articles are published publicly to your peer feed. Private and follower-only article delivery is not supported yet.'}</p>
        </section>

        <div className="space-y-2 pt-2">
          <button
            onClick={() => void publish()}
            disabled={!article.title.trim() || !article.topic || publishing}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publishing ? 'Publishing…' : destination === 'xmpp' ? 'Publish to XMPP' : 'Publish now'}
          </button>
          {publishError && <p role="alert" className="text-xs text-destructive text-center">{publishError}</p>}
          <button
            onClick={() => onSaveDraft(article)}
            className="w-full min-h-11 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Save as draft
          </button>
        </div>
      </div>
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
