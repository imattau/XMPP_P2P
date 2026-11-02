import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Eye, Image, Plus, X } from 'lucide-react'
import { useArticleBridge, getBrowserXmppBridge } from '../bridge'
import { createNewArticle, generateBlockId } from '../bridge/article/controller'
import type { Article, ArticleBlock } from '../bridge/article/types'
import BlockEditor from '../components/article/BlockEditor'
import ArticlePreview from '../components/article/ArticlePreview'
import PublishSettings from '../components/article/PublishSettings'
import { emitToast } from '../lib/toast-events'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useProfileBridge } from '../bridge/useProfileBridge'
import { useServerBridge } from '../bridge/useServerBridge'
import { useResolvedUploadUrl } from '../bridge/useResolvedUploadUrl'

type ComposeStep = 'edit' | 'preview' | 'publish'

function hasDraftContent(article: Article): boolean {
  return Boolean(
    article.title.trim()
    || article.subtitle?.trim()
    || article.summary?.trim()
    || article.topic.trim()
    || article.coverImage
    || article.blocks.length > 2
    || article.blocks.some((block) => (
      block.content.trim()
      || block.type === 'divider'
      || Object.values(block.meta ?? {}).some((value) => (
        typeof value === 'string' ? Boolean(value.trim())
          : Array.isArray(value) ? value.length > 0
            : false
      ))
    ))
  )
}

export default function ComposePage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const queryId = new URLSearchParams(window.location.search).get('id')
  const { getArticle, saveDraft, publishArticle } = useArticleBridge()
  const { identity, permissions } = useIdentityBridge()
  const { vCard } = useProfileBridge()
  const { gatewayOnline: serverConnected } = useServerBridge()

  const existingId = params.id ?? queryId
  const existing = existingId ? getArticle(existingId) : undefined
  const missingDraft = Boolean(existingId && existing?.status !== 'draft')
  const articleAuthor = {
    name: vCard?.fn?.trim() || identity?.displayName || 'You',
    handle: (vCard?.nickname?.trim() || identity?.handle || 'you').replace(/^@+/, ''),
    avatar: '',
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [article, setArticle] = useState<Article>(() => {
    if (existing && existing.status === 'draft') {
      return { ...existing }
    }
    return createNewArticle({ author: articleAuthor })
  })
  const hasPersistedDraftRef = useRef(Boolean(existing && existing.status === 'draft'))
  const canAddCover = permissions.photosAndFiles && !article.coverImage
  const articleRef = useRef(article)
  const saveDraftRef = useRef(saveDraft)
  articleRef.current = article
  saveDraftRef.current = saveDraft
  const coverImage = useResolvedUploadUrl(article.coverImage)

  const [step, setStep] = useState<ComposeStep>('edit')
  const [lastSaved, setLastSaved] = useState<Date | null>(() => existing?.updatedAt ? new Date(existing.updatedAt) : null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)
  const [topicInput, setTopicInput] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoSave = useCallback((updated: Article) => {
    if (!hasPersistedDraftRef.current && !hasDraftContent(updated)) {
      setIsSaving(false)
      return
    }
    try {
      saveDraft(updated)
      hasPersistedDraftRef.current = true
      if (!existingId) {
        navigate(`/compose?id=${encodeURIComponent(updated.id)}`, { replace: true })
      }
      setLastSaved(new Date())
      setSaveError('')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this draft.')
    } finally {
      setIsSaving(false)
    }
  }, [existingId, navigate, saveDraft])

  const handleChange = useCallback((updated: Article) => {
    articleRef.current = updated
    setArticle(updated)
    setIsSaving(true)
    setSaveError('')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      autoSave(updated)
      saveTimerRef.current = null
    }, 2000)
  }, [autoSave])

  useEffect(() => {
    if (existingId) return
    const current = articleRef.current
    if (current.author.name === articleAuthor.name && current.author.handle === articleAuthor.handle) return
    handleChange({ ...current, author: articleAuthor })
  }, [existingId, articleAuthor.name, articleAuthor.handle, handleChange])

  useEffect(() => {
    return () => {
      if (missingDraft) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        if (!hasPersistedDraftRef.current && !hasDraftContent(articleRef.current)) return
        try {
          saveDraftRef.current(articleRef.current)
          hasPersistedDraftRef.current = true
        } catch (error) {
          emitToast(error instanceof Error ? error.message : 'Could not save this draft.', 'error')
        }
      }
    }
  }, [missingDraft])

  const handleTitleChange = (title: string) => handleChange({ ...article, title })
  const handleSubtitleChange = (subtitle: string) => handleChange({ ...article, subtitle })
  const handleCoverImage = async (file: File) => {
    const bridge = getBrowserXmppBridge()
    if (!bridge?.uploadFile) {
      emitToast('Connect to the peer network to upload a cover image', 'error')
      return
    }
    try {
      const result = await bridge.uploadFile(file)
      handleChange({ ...articleRef.current, coverImage: result.url })
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not upload the cover image', 'error')
    }
  }
  const handleRemoveCover = () => handleChange({ ...article, coverImage: undefined })
  const handleBlocksChange = (blocks: ArticleBlock[]) => handleChange({ ...article, blocks })
  const handleAddBlock = () => handleBlocksChange([
    ...article.blocks,
    { id: generateBlockId(), type: 'paragraph', content: '' },
  ])
  const handleTopicChange = (topic: string) => {
    if (article.topic === topic) {
      // deselect
      handleChange({ ...article, topic: '' })
    } else {
      handleChange({ ...article, topic })
    }
  }
  const handleAddTopic = () => {
    setAddingTopic(true)
  }
  const handleApplyTopic = () => {
    const topic = topicInput.trim().replace(/^#+/, '')
    if (!topic) return
    handleChange({ ...article, topic: topic.toUpperCase() })
    setTopicInput('')
    setAddingTopic(false)
  }

  const handleSaveDraft = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    try {
      saveDraft(article)
      hasPersistedDraftRef.current = true
      setLastSaved(new Date())
      setSaveError('')
      setIsSaving(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this draft.')
    }
  }

  const handlePublish = async (a: Article, destination: 'p2p' | 'xmpp') => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    // Preserve the latest edits if publishing fails. A successful publish
    // removes this draft in the article controller before navigation.
    try {
      saveDraft(a)
      hasPersistedDraftRef.current = true
      setLastSaved(new Date())
      setSaveError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this draft.'
      setSaveError(message)
      emitToast(message, 'error')
    } finally {
      setIsSaving(false)
    }
    const publishedId = await publishArticle(a, destination)
    navigate(`/article/${encodeURIComponent(publishedId)}`)
  }

  if (missingDraft) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Draft not found</p>
        <p className="max-w-sm text-xs text-muted-foreground">This draft may have been deleted or already published. Your other drafts are still available.</p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button type="button" onClick={() => navigate('/drafts')} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Open drafts</button>
          <button type="button" onClick={() => navigate('/compose')} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">Start a new article</button>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <ArticlePreview
        article={article}
        onEdit={() => setStep('edit')}
        onPublish={() => setStep('publish')}
      />
    )
  }

  if (step === 'publish') {
    return (
      <PublishSettings
        article={article}
        serverConnected={serverConnected}
        onUpdate={handleChange}
        onPublish={(a, destination) => handlePublish(a, destination)}
        onBack={() => setStep('preview')}
        onSaveDraft={(a) => {
          try {
            saveDraft(a)
            hasPersistedDraftRef.current = true
            navigate('/drafts')
          } catch (error) {
            emitToast(error instanceof Error ? error.message : 'Could not save this draft.', 'error')
          }
        }}
      />
    )
  }

  const hasContent = article.title.length > 0 || article.blocks.some((b) => b.content.length > 0)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="font-semibold text-sm">Write article</h1>
                <p
                  className={`text-[11px] font-mono ${saveError ? 'text-destructive' : isSaving ? 'text-muted-foreground' : 'text-accent'}`}
                  role={saveError ? 'alert' : 'status'}
                  aria-live={saveError ? 'assertive' : 'polite'}
                  aria-atomic="true"
                >
                {saveError || (isSaving ? 'Saving…' : lastSaved ? getSavedLabel(lastSaved) : 'Not saved yet')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Preview article"
              onClick={() => setStep('preview')}
              disabled={!hasContent}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Preview"
            >
              <Eye size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          <div
            onClick={canAddCover ? () => fileInputRef.current?.click() : undefined}
            onKeyDown={(event) => {
              if (canAddCover && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            role={canAddCover ? 'button' : undefined}
            tabIndex={canAddCover ? 0 : undefined}
            aria-label={canAddCover ? 'Add cover image' : undefined}
            className={`relative bg-card rounded-xl border border-border p-4 flex items-center gap-3 ${canAddCover ? 'cursor-pointer hover:bg-white/[0.02]' : ''} transition-colors min-h-[92px]`}
          >
            <input
              ref={fileInputRef}
              aria-label="Choose article cover image"
              type="file"
              accept="image/*"
              disabled={!permissions.photosAndFiles}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCoverImage(file)
                e.target.value = ''
              }}
            />
            {article.coverImage ? (
              <>
                {coverImage.url
                  ? <img src={coverImage.url} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-20 h-20 rounded-lg bg-secondary flex-shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">{coverImage.loading ? 'Loading…' : <button type="button" onClick={coverImage.retry} className="hover:text-foreground">Retry</button>}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Cover image</p>
                  <p className="text-xs text-muted-foreground">Choose an action</p>
                </div>
                {permissions.photosAndFiles && <button type="button" onClick={() => fileInputRef.current?.click()} className="min-h-11 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-secondary">Change</button>}
                <button
                  type="button"
                  aria-label="Remove cover image"
                  onClick={(e) => { e.stopPropagation(); handleRemoveCover() }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground flex-shrink-0">
                  <Image size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Add cover image</p>
                  <p className="text-xs text-muted-foreground">{permissions.photosAndFiles ? 'Recommended 1600 × 900 · Up to 50 MiB' : 'Enable Photos and files in Settings to add a cover image'}</p>
                </div>
              </>
            )}
          </div>

          <div className="bg-secondary rounded-xl p-4">
            <span className="text-[11px] font-medium text-muted-foreground">Title</span>
            <input
              aria-label="Article title"
              value={article.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="Article title"
              className="mt-1 w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          <div className="bg-secondary rounded-xl p-4">
            <span className="text-[11px] font-medium text-muted-foreground">Subtitle or summary</span>
            <textarea
              aria-label="Article subtitle or summary"
              value={article.subtitle ?? ''}
              onChange={(event) => handleSubtitleChange(event.target.value)}
              placeholder="Subtitle or summary"
              rows={2}
              className="mt-1 w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          <BlockEditor
            blocks={article.blocks}
            onChange={handleBlocksChange}
          />

          <div className="flex items-center gap-2 pt-2 pb-4">
            <button type="button" aria-label="Add paragraph block" title="Add paragraph block" onClick={handleAddBlock} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue2 text-primary hover:bg-blue2/80 transition-colors">
              <Plus size={18} />
            </button>
            {article.topic ? (
              <button
                type="button"
                onClick={() => handleTopicChange(article.topic)}
                aria-label={`Remove topic ${article.topic}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-blue2 px-3 text-xs font-semibold text-primary hover:bg-blue2/80 transition-colors"
              >
                #{article.topic}
                <X size={12} />
              </button>
            ) : null}
            {!article.topic && (addingTopic ? (
              <form onSubmit={(event) => { event.preventDefault(); handleApplyTopic() }} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  placeholder="Topic, e.g. P2P"
                  aria-label="Article topic"
                  className="w-36 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
                <button type="submit" disabled={!topicInput.trim()} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">Add</button>
                <button type="button" onClick={() => { setAddingTopic(false); setTopicInput('') }} className="min-h-11 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </form>
            ) : (
              <button
                type="button"
                onClick={handleAddTopic}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-secondary px-3 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={12} /> Topic
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => step === 'edit' && hasContent ? setStep('preview') : null}
              disabled={!hasContent}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function getSavedLabel(date: Date): string {
  const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Saved just now'
  if (minutes < 60) return `Saved ${minutes}m ago`
  return `Saved at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
