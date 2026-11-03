import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, Image, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { useArticleBridge, getBrowserXmppBridge } from '../bridge'
import { createNewArticle } from '../bridge/article/controller'
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
  const [showOptionalDetails, setShowOptionalDetails] = useState(() => Boolean(existing?.coverImage || existing?.subtitle?.trim()))
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
    setSaveError('')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (!hasPersistedDraftRef.current && !hasDraftContent(updated)) {
      saveTimerRef.current = null
      setIsSaving(false)
      return
    }
    setIsSaving(true)
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
          <button type="button" onClick={() => navigate('/drafts')} className="min-h-11 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Open drafts</button>
          <button type="button" onClick={() => navigate('/compose')} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">Start a new article</button>
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
  const saveStatus = saveError || (isSaving ? 'Saving…' : lastSaved ? getSavedLabel(lastSaved) : '')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-sm">Write article</h1>
              {saveStatus && <p
                className={`max-w-[52vw] truncate text-[11px] font-mono sm:max-w-none ${saveError ? 'text-destructive' : isSaving ? 'text-muted-foreground' : 'text-accent'}`}
                role={saveError ? 'alert' : 'status'}
                aria-live={saveError ? 'assertive' : 'polite'}
                aria-atomic="true"
              >
                {saveStatus}
              </p>}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          <div className="bg-secondary rounded-xl p-4">
            <span className="text-[11px] font-medium text-muted-foreground">Title</span>
            <input
              aria-label="Article title"
              value={article.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="Give your article a title"
              className="mt-1 min-h-11 w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <details open={showOptionalDetails} onToggle={(event) => setShowOptionalDetails(event.currentTarget.open)} className="rounded-xl border border-border bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
              <span className="flex-1">Cover &amp; summary</span>
              <span className="text-[11px] font-normal text-muted-foreground">Optional</span>
              <ChevronDown size={15} className={`text-muted-foreground transition-transform ${showOptionalDetails ? 'rotate-180' : ''}`} />
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="relative min-h-[92px] rounded-xl border border-border bg-card p-3">
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
              <div className="flex items-center gap-3">
                {coverImage.url
                  ? <img src={coverImage.url} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                  : <div className="w-20 h-20 rounded-lg bg-secondary flex-shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">{coverImage.loading ? 'Loading…' : <button type="button" onClick={coverImage.retry} className="min-h-11 rounded px-2 hover:text-foreground">Retry</button>}</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Cover image</p>
                  <p className="truncate text-xs text-muted-foreground">{coverImage.url ? 'Image added' : coverImage.loading ? 'Loading image…' : 'Image unavailable'}</p>
                </div>
                <details className="relative flex-shrink-0">
                  <summary aria-label="Cover image actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <MoreHorizontal size={18} />
                  </summary>
                  <div className="absolute right-0 top-full z-20 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl">
                    {permissions.photosAndFiles && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); fileInputRef.current?.click() }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-secondary">
                      <Image size={15} /> Change cover
                    </button>}
                    <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); handleRemoveCover() }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10">
                      <Trash2 size={15} /> Remove cover
                    </button>
                  </div>
                </details>
              </div>
            ) : (
              <button type="button" disabled={!canAddCover} onClick={() => fileInputRef.current?.click()} className="flex min-h-[66px] w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                  <Image size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Add cover image</p>
                  <p className="text-xs leading-snug text-muted-foreground">{permissions.photosAndFiles ? 'Recommended 1600 × 900 · Up to 50 MiB' : 'Enable Photos and files in Settings to add a cover image'}</p>
                </div>
              </button>
            )}
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
            </div>
          </details>

          <BlockEditor
            blocks={article.blocks}
            onChange={handleBlocksChange}
          />

          <div className="flex flex-wrap items-center gap-2 pt-2 pb-4">
            {article.topic ? (
              <button
                type="button"
                onClick={() => handleTopicChange(article.topic)}
                aria-label={`Remove topic ${article.topic}`}
                className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1 rounded-lg bg-blue2 px-3 text-xs font-semibold text-primary transition-colors hover:bg-blue2/80"
              >
                <span className="min-w-0 truncate">#{article.topic}</span>
                <X size={12} />
              </button>
            ) : null}
            {!article.topic && (addingTopic ? (
              <form onSubmit={(event) => { event.preventDefault(); handleApplyTopic() }} className="flex flex-wrap items-center gap-1.5">
                <input
                  autoFocus
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  placeholder="Topic, e.g. P2P"
                  aria-label="Article topic"
                  className="min-h-11 w-36 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
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
          </div>
        </div>
      </main>
      <footer className="flex-shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => step === 'edit' && hasContent ? setStep('preview') : null}
          disabled={!hasContent}
          className="min-h-11 w-full rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Preview
        </button>
      </footer>
    </div>
  )
}

function getSavedLabel(date: Date): string {
  const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Saved just now'
  if (minutes < 60) return `Saved ${minutes}m ago`
  return `Saved at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
