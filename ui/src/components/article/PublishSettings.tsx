import { useState } from 'react'
import type { Article, ArticleVisibility } from '../../bridge/article/types'

interface PublishSettingsProps {
  article: Article
  onUpdate: (article: Article) => void
  onPublish: (article: Article) => void
  onSaveDraft: (article: Article) => void
  onSchedule: (article: Article) => void
}

const TOPICS = ['XMPP', 'IDENTITY', 'PRIVACY', 'P2P', 'COMMUNITIES', 'FEDIVERSE']
const VISIBILITY_OPTIONS: Array<{ id: ArticleVisibility; label: string }> = [
  { id: 'public', label: 'Public' },
  { id: 'followers', label: 'Followers' },
  { id: 'unlisted', label: 'Unlisted' },
]

export default function PublishSettings({ article, onUpdate, onPublish, onSaveDraft, onSchedule }: PublishSettingsProps) {
  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const [topicSearch, setTopicSearch] = useState('')

  const handleChangeTopic = (topic: string) => {
    onUpdate({ ...article, topic })
    setShowTopicPicker(false)
  }

  const handleToggle = (key: 'allowReplies' | 'showReadingTime' | 'notifyFollowers' | 'addToProfile') => {
    onUpdate({
      ...article,
      settings: { ...article.settings, [key]: !article.settings[key] },
    })
  }

  const handleSetVisibility = (visibility: ArticleVisibility) => {
    onUpdate({ ...article, visibility })
  }

  const filteredTopics = TOPICS.filter((t) =>
    t.toLowerCase().includes(topicSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-lg mx-auto w-full">
        <section>
          <h3 className="text-xs font-semibold text-foreground mb-2">Topic</h3>
          <div className="relative">
            <div className="bg-card rounded-xl p-4 flex items-center justify-between border border-border">
              <span className="text-base font-semibold text-primary">
                {article.topic ? `#${article.topic}` : 'Select a topic'}
              </span>
              <button
                onClick={() => setShowTopicPicker(!showTopicPicker)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {article.topic ? 'Change' : 'Select'}
              </button>
            </div>
            {showTopicPicker && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-card rounded-xl border border-border overflow-hidden z-10 shadow-lg">
                <div className="p-2 border-b border-border">
                  <input
                    autoFocus
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
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-secondary ${
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
          <h3 className="text-xs font-semibold text-foreground mb-2">Visibility</h3>
          <div className="flex gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSetVisibility(opt.id)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  article.visibility === opt.id
                    ? 'bg-blue2 text-primary'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-foreground mb-2">Options</h3>
          <div className="space-y-2">
            <SettingRow label="Allow replies" checked={article.settings.allowReplies} onToggle={() => handleToggle('allowReplies')} />
            <SettingRow label="Show reading time" checked={article.settings.showReadingTime} onToggle={() => handleToggle('showReadingTime')} />
            <SettingRow label="Notify followers" checked={article.settings.notifyFollowers} onToggle={() => handleToggle('notifyFollowers')} />
            <SettingRow label="Add to profile" checked={article.settings.addToProfile} onToggle={() => handleToggle('addToProfile')} />
          </div>
        </section>

        <div className="space-y-2 pt-2">
          <button
            onClick={() => onPublish(article)}
            disabled={!article.title || !article.topic}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Publish now
          </button>
          <button
            onClick={() => onSchedule(article)}
            className="w-full py-3 rounded-xl bg-secondary text-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            Schedule for later
          </button>
          <button
            onClick={() => onSaveDraft(article)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
        onClick={onToggle}
        className={`relative w-[42px] h-[26px] rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-secondary'
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  )
}
