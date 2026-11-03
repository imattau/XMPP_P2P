import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Hash, Info, Loader } from 'lucide-react'
import { getBrowserXmppBridge } from '../bridge/runtime'
import { emitToast } from '../lib/toast-events'

export default function JoinCommunityPage() {
  const navigate = useNavigate()
  const [communityId, setCommunityId] = useState(() => new URLSearchParams(window.location.search).get('id') ?? '')
  const [joining, setJoining] = useState(false)
  const validId = /^[a-z0-9][a-z0-9._-]{0,99}$/.test(communityId.trim())

  const handleJoin = async () => {
    const id = communityId.trim()
    if (!validId || joining) return
    const bridge = getBrowserXmppBridge()
    if (!bridge) {
      emitToast('Connect to the peer network before joining a community', 'error')
      return
    }

    setJoining(true)
    try {
      await bridge.subscribeCollection(id)
      emitToast(`Joined community: ${id}`, 'success')
      navigate(`/?collection=${encodeURIComponent(id)}`)
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not join the community', 'error')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <button type="button" onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-foreground">Join a community</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form id="join-community-form" onSubmit={(event) => { event.preventDefault(); void handleJoin() }} className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5">
          <label className="block">
            <span className="block text-xs font-medium text-foreground mb-1.5">Community ID</span>
            <div className="flex items-center bg-secondary border border-border rounded-lg overflow-hidden focus-within:border-primary/50">
              <Hash size={14} className="ml-3 text-muted-foreground" />
              <input value={communityId} onChange={(event) => setCommunityId(event.target.value.toLowerCase().trim())}
                placeholder="community-name" aria-label="Community ID"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
            {communityId && !validId && <span className="block mt-1 text-xs text-destructive">Use lowercase letters, numbers, dots, underscores, or hyphens.</span>}
          </label>

          <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info size={15} className="mt-0.5 flex-shrink-0 text-primary" />
            <p>Ask a member for this ID. Posts load from connected peers.</p>
          </div>
        </form>
      </main>
      <footer className="flex-shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button type="submit" form="join-community-form" disabled={!validId || joining}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {joining && <Loader size={15} className="animate-spin" />}{joining ? 'Joining…' : 'Join community'}
        </button>
      </footer>
    </div>
  )
}
