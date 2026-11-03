import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Hash, Info, Loader } from 'lucide-react'
import { getBrowserXmppBridge } from '../bridge/runtime'
import { emitToast } from '../lib/toast-events'

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function CreateCommunityPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [communityId, setCommunityId] = useState('')
  const [idEdited, setIdEdited] = useState(false)
  const [creating, setCreating] = useState(false)

  const validId = /^[a-z0-9][a-z0-9._-]{0,99}$/.test(communityId)
  const canCreate = Boolean(name.trim()) && validId && !creating

  const handleCreate = async () => {
    if (!canCreate) return
    const bridge = getBrowserXmppBridge()
    if (!bridge) {
      emitToast('Connect to the peer network before creating a community', 'error')
      return
    }

    setCreating(true)
    try {
      await bridge.createCollection(communityId, name.trim())
      emitToast(`Community created: ${name.trim()}`, 'success')
      navigate(`/?collection=${encodeURIComponent(communityId)}`)
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not create the community', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <button type="button" onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-foreground">Create a community</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form id="create-community-form" onSubmit={(event) => { event.preventDefault(); void handleCreate() }} className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5">
          <label className="block">
            <span className="block text-xs font-medium text-foreground mb-1.5">Community name</span>
            <input value={name} onChange={(event) => {
              const next = event.target.value
              setName(next)
              if (!idEdited) setCommunityId(slugify(next))
            }} placeholder="e.g. XMPP Developers"
              className="min-h-11 w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-foreground mb-1.5">Community ID</span>
            <div className="flex items-center bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50">
              <Hash size={14} className="ml-3 text-muted-foreground" />
              <input value={communityId} onChange={(event) => {
                setCommunityId(slugify(event.target.value))
                setIdEdited(true)
              }} placeholder="community-name" aria-label="Community ID"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
            {communityId && !validId && <span className="block mt-1 text-xs text-destructive">Use lowercase letters, numbers, dots, underscores, or hyphens.</span>}
          </label>
          <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info size={15} className="mt-0.5 flex-shrink-0 text-primary" />
            <p>Anyone with this ID can publish. For group chat, choose New group in Chats.</p>
          </div>
        </form>
      </main>
      <footer className="flex-shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button type="submit" form="create-community-form" disabled={!canCreate}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {creating && <Loader size={15} className="animate-spin" />}{creating ? 'Creating…' : 'Create community'}
        </button>
      </footer>
    </div>
  )
}
