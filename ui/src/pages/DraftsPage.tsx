import { useNavigate } from 'react-router'
import { ArrowLeft, MoreHorizontal, FileText, Plus } from 'lucide-react'
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
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
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
      setMenuOpen(null)
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
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-semibold text-sm text-foreground">Drafts</h1>
            <p className="text-xs text-muted-foreground">{drafts.length} unpublished {drafts.length === 1 ? 'article' : 'articles'}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No drafts yet</p>
            <button
              onClick={handleNewArticle}
              className="mt-2 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
                    className="bg-card rounded-xl border border-border p-4"
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
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          aria-label={`More options for ${draft.title || 'Untitled'}`}
                          aria-controls={menuOpen === draft.id ? `draft-options-${draft.id}` : undefined}
                          aria-expanded={menuOpen === draft.id}
                          onClick={(event) => {
                            menuTriggerRef.current = event.currentTarget
                            setMenuOpen(menuOpen === draft.id ? null : draft.id)
                          }}
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {menuOpen === draft.id && (
                          <div id={`draft-options-${draft.id}`} onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              event.stopPropagation()
                              setMenuOpen(null)
                              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus()
                            }
                          }} className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-card border border-border shadow-lg z-10 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleEdit(draft.id)}
                              className="w-full min-h-11 text-left px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => { setConfirmDeleteId(draft.id); setMenuOpen(null) }}
                              className="w-full min-h-11 text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="px-4 pb-6">
              <button
                onClick={handleNewArticle}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                New article
              </button>
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
              className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
            >
              <h2 id="delete-draft-title" className="text-base font-semibold text-foreground">Delete this draft?</h2>
              <p id="delete-draft-description" className="mt-1 text-sm leading-relaxed text-muted-foreground">
                “{title}” will be permanently removed from your drafts.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmDeleteId(null)}
                  className="min-h-11 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="min-h-11 rounded-lg bg-destructive px-3 text-sm font-semibold text-white hover:bg-destructive/90"
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
