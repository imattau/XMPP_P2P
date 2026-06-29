import { useNavigate } from 'react-router'
import { ArrowLeft, MoreHorizontal, FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { useArticleBridge } from '../bridge/article/useArticleBridge'
import { createNewArticle } from '../bridge/article/controller'

export default function DraftsPage() {
  const navigate = useNavigate()
  const { drafts, deleteDraft, saveDraft } = useArticleBridge()
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const handleNewArticle = () => {
    const draft = createNewArticle()
    saveDraft(draft)
    navigate(`/compose?id=${draft.id}`)
  }

  const handleEdit = (id: string) => {
    navigate(`/compose?id=${id}`)
  }

  const handleDelete = (id: string) => {
    deleteDraft(id)
    setMenuOpen(null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
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
                  <div
                    key={draft.id}
                    className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:bg-white/[0.03] transition-colors relative"
                    onClick={() => handleEdit(draft.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[17px] font-semibold text-foreground leading-snug line-clamp-2">
                          {draft.title || 'Untitled'}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Edited {editedAgo}
                        </p>
                      </div>
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpen(menuOpen === draft.id ? null : draft.id)
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {menuOpen === draft.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-card border border-border shadow-lg z-10 overflow-hidden">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(draft.id)
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(draft.id)
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

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
                  </div>
                )
              })}
            </div>

            <div className="px-4 pb-6">
              <button
                onClick={handleNewArticle}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                New article
              </button>
            </div>
          </>
        )}
      </main>
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
