import { useNavigate } from 'react-router'
import { FileText, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import { createNewArticle } from '../bridge/article/controller'
import { useIdentityBridge } from '../bridge/identity/useIdentityBridge'
import { useProfileBridge } from '../bridge/useProfileBridge'
import { emitToast } from '../lib/toast-events'

export default function DraftsPage() {
  const navigate = useNavigate()
  const { drafts, deleteDraft, saveDraft } = useArticleBridge()
  const { identity } = useIdentityBridge()
  const { vCard } = useProfileBridge()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const menuTriggerRef = useRef<HTMLElement | null>(null)
  const dialogWasOpen = useRef(false)

  useEffect(() => {
    if (confirmDeleteId) {
      dialogWasOpen.current = true
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = previousOverflow }
    }
    if (dialogWasOpen.current) {
      dialogWasOpen.current = false
      menuTriggerRef.current?.focus()
    }
  }, [confirmDeleteId])

  const handleNewArticle = () => {
    const draft = createNewArticle({
      author: {
        name: vCard?.fn?.trim() || identity?.displayName || 'You',
        handle: (vCard?.nickname?.trim() || identity?.handle || 'you').replace(/^@+/, ''),
        avatar: '',
      },
    })
    try {
      saveDraft(draft)
      navigate(`/compose?id=${draft.id}`)
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not save a new draft.', 'error')
    }
  }

  const handleEdit = (id: string) => {
    navigate(`/compose?id=${id}`)
  }

  const handleDelete = () => {
    if (!confirmDeleteId) return
    try {
      deleteDraft(confirmDeleteId)
      setConfirmDeleteId(null)
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not delete this draft.', 'error')
    }
  }

  const handleDeleteDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setConfirmDeleteId(null)
      return
    }
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
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
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <h1 className="text-xl font-semibold text-foreground">Drafts</h1>
          <span title={`${drafts.length} unpublished ${drafts.length === 1 ? 'article' : 'articles'}`}
            className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            <span aria-hidden="true">{drafts.length}</span>
            <span className="sr-only">{drafts.length} unpublished {drafts.length === 1 ? 'article' : 'articles'}</span>
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 sm:py-20">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No drafts yet</p>
            <button
              onClick={handleNewArticle}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              New article
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 py-4 space-y-3">
              {drafts.map((draft) => {
                const editedAgo = getRelativeTime(draft.updatedAt)
                return (
                  <article
                    key={draft.id}
                    className="bg-card rounded-xl border border-border p-3 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        aria-label={`Edit ${draft.title || 'Untitled'} draft`}
                        onClick={() => handleEdit(draft.id)}
                        className="flex-1 min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <h3 className="text-[17px] font-semibold text-foreground leading-snug line-clamp-2 hover:text-primary">
                          {draft.title || 'Untitled'}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Edited {editedAgo}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          {draft.topic ? (
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-blue2 text-primary text-[10px] font-semibold">
                              #{draft.topic}
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground text-[10px] font-semibold">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </button>
                      <details className="relative flex-shrink-0">
                        <summary aria-label={`More actions for ${draft.title || 'Untitled'} draft`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                          <MoreHorizontal size={18} />
                        </summary>
                        <div className="absolute right-0 top-full z-20 min-w-40 rounded-xl border border-border bg-card p-1 shadow-xl">
                          <button
                            type="button"
                            onClick={(event) => {
                              const menu = event.currentTarget.closest('details')
                              menuTriggerRef.current = menu?.querySelector('summary') ?? null
                              menu?.removeAttribute('open')
                              setConfirmDeleteId(draft.id)
                            }}
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 size={15} /> Delete draft
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                )
              })}
            </div>

          </>
        )}
      </main>

      {confirmDeleteId && (() => {
        const draft = drafts.find((item) => item.id === confirmDeleteId)
        const title = draft?.title.trim() || 'Untitled'
        return (
          <div className="safe-area-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-draft-title"
              aria-describedby="delete-draft-description"
              onKeyDown={handleDeleteDialogKeyDown}
              className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
            >
              <h2 id="delete-draft-title" className="text-base font-semibold text-foreground">Delete this draft?</h2>
              <p id="delete-draft-description" className="mt-1 text-sm leading-relaxed text-muted-foreground">
                “{title}” will be permanently removed from your drafts.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmDeleteId(null)}
                  className="min-h-11 w-full rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="min-h-11 w-full rounded-lg bg-destructive px-3 text-sm font-semibold text-white hover:bg-destructive/90 sm:w-auto"
                >
                  Delete draft
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function getRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(1, Math.round(diffMs / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.max(1, Math.round(minutes / 60))
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.max(1, Math.round(hours / 24))
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return `${Math.round(days / 7)} week${days >= 14 ? 's' : ''} ago`
}
