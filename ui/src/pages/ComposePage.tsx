import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Eye, MoreHorizontal, Image, Plus, X } from 'lucide-react'
import { useArticleBridge, getBrowserXmppBridge } from '../bridge'
import { createNewArticle, generateBlockId } from '../bridge/article/controller'
import type { Article, ArticleBlock } from '../bridge/article/types'
import BlockEditor from '../components/article/BlockEditor'
import ArticlePreview from '../components/article/ArticlePreview'
import PublishSettings from '../components/article/PublishSettings'

type ComposeStep = 'edit' | 'preview' | 'publish'

export default function ComposePage() {
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const queryId = new URLSearchParams(window.location.search).get('id')
  const { getArticle, saveDraft, publishArticle } = useArticleBridge()

  const existingId = params.id ?? queryId
  const existing = existingId ? getArticle(existingId) : undefined

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [article, setArticle] = useState<Article>(() => {
    if (existing && existing.status === 'draft') {
      return { ...existing }
    }
    return createNewArticle()
  })

  const [step, setStep] = useState<ComposeStep>('edit')
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const [isSaving, setIsSaving] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoSave = useCallback((updated: Article) => {
    setIsSaving(true)
    saveDraft(updated)
    setLastSaved(new Date())
    setIsSaving(false)
  }, [saveDraft])

  const handleChange = useCallback((updated: Article) => {
    setArticle(updated)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => autoSave(updated), 2000)
  }, [autoSave])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleTitleChange = (title: string) => handleChange({ ...article, title })
  const handleSubtitleChange = (subtitle: string) => handleChange({ ...article, subtitle })
  const handleCoverImage = async (file: File) => {
    const bridge = getBrowserXmppBridge()
    if (bridge?.uploadFile) {
      try {
        const result = await bridge.uploadFile(file)
        handleChange({ ...article, coverImage: result.url })
      } catch {
        const localUrl = URL.createObjectURL(file)
        handleChange({ ...article, coverImage: localUrl })
      }
    } else {
      const localUrl = URL.createObjectURL(file)
      handleChange({ ...article, coverImage: localUrl })
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
    const tag = prompt('Topic tag (e.g. P2P):')
    if (tag && tag.trim()) {
      handleChange({
        ...article,
        topic: article.topic ? article.topic : tag.trim().toUpperCase(),
      })
    }
  }

  const handleSaveDraft = () => {
    saveDraft(article)
    setLastSaved(new Date())
  }

  const handlePublish = async (a: Article) => {
    const publishedId = await publishArticle(a)
    navigate(`/article/${publishedId}`)
  }

  const handleSchedule = () => {
    saveDraft(article)
    navigate('/drafts')
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
        onUpdate={handleChange}
        onPublish={handlePublish}
        onSaveDraft={(a) => { saveDraft(a); navigate('/drafts') }}
        onSchedule={handleSchedule}
      />
    )
  }

  const hasContent = article.title.length > 0 || article.blocks.some((b) => b.content.length > 0)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <span className="font-semibold text-sm">Write article</span>
              <p className={`text-[11px] font-mono ${isSaving ? 'text-muted-foreground' : 'text-accent'}`}>
                {isSaving ? 'Saving…' : 'Saved just now'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setStep('preview')}
              className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Preview"
            >
              <Eye size={18} />
            </button>
            <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          <div
            onClick={article.coverImage ? undefined : () => fileInputRef.current?.click()}
            className="relative bg-card rounded-xl border border-border p-4 flex items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors min-h-[92px]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCoverImage(file)
                e.target.value = ''
              }}
            />
            {article.coverImage ? (
              <>
                <img src={article.coverImage} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Cover image</p>
                  <p className="text-xs text-muted-foreground">Click to change</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveCover() }}
                  className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
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
                  <p className="text-xs text-muted-foreground">Recommended 1600 × 900</p>
                </div>
              </>
            )}
          </div>

          <div className="bg-secondary rounded-xl p-4">
            <span className="text-[11px] font-medium text-muted-foreground">Title</span>
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleTitleChange(e.currentTarget.textContent ?? '')}
              className="mt-1 text-xl font-semibold text-foreground outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
              data-placeholder="Article title"
              dangerouslySetInnerHTML={{ __html: article.title }}
            />
          </div>

          <div className="bg-secondary rounded-xl p-4">
            <span className="text-[11px] font-medium text-muted-foreground">Subtitle or summary</span>
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => handleSubtitleChange(e.currentTarget.textContent ?? '')}
              className="mt-1 text-sm text-foreground outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
              data-placeholder="Subtitle or summary"
              dangerouslySetInnerHTML={{ __html: article.subtitle ?? '' }}
            />
          </div>

          <BlockEditor
            blocks={article.blocks}
            onChange={handleBlocksChange}
          />

          <div className="flex items-center gap-2 pt-2 pb-4">
            <button onClick={handleAddBlock} className="w-10 h-10 rounded-xl bg-blue2 flex items-center justify-center text-primary hover:bg-blue2/80 transition-colors">
              <Plus size={18} />
            </button>
            {article.topic ? (
              <span
                onClick={() => handleTopicChange(article.topic)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue2 text-primary text-xs font-semibold cursor-pointer hover:bg-blue2/80 transition-colors"
              >
                #{article.topic}
                <X size={12} />
              </span>
            ) : null}
            <button
              onClick={handleAddTopic}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors"
            >
              <Plus size={12} /> Topic
            </button>
            <div className="flex-1" />
            <button
              onClick={() => step === 'edit' && hasContent ? setStep('preview') : null}
              disabled={!hasContent}
              className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
