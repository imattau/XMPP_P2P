import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'

export default function CreateIdentityPage() {
  const navigate = useNavigate()
  const { identity, createIdentity } = useIdentityBridge()
  const [displayName, setDisplayName] = React.useState(identity?.displayName ?? 'Maren Holdt')
  const [handle, setHandle] = React.useState(identity?.handle ?? 'maren')
  const [passcode, setPasscode] = React.useState('')
  const [publicProfile, setPublicProfile] = React.useState(identity?.publicProfile ?? true)

  const handleCreate = () => {
    if (!displayName.trim() || !handle.trim()) return
    createIdentity(displayName.trim(), handle.trim(), passcode || undefined)
    navigate('/onboarding/recovery')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Create identity</h1>
          <p className="text-[12px] text-muted-foreground">Your peer-network identity</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={1} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Handle</label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Recovery passcode</label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter recovery passcode"
            className="w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <div className="text-[13px] font-semibold text-foreground mb-2">Identity preview</div>
          <div className="bg-card rounded-xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue2 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-primary">{displayName.charAt(0).toUpperCase() || '?'}</span>
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">{displayName || 'Your name'}</div>
                <div className="text-[12px] text-muted-foreground font-mono mt-0.5">
                  {handle ? `${handle}@peer` : 'handle@peer'}
                </div>
                <div className="text-[11px] text-accent bg-green2/20 px-2 py-0.5 rounded inline-block mt-1.5">
                  Generated locally
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl px-4 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Public profile</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Allow discovery by handle</div>
          </div>
          <Toggle checked={publicProfile} onChange={setPublicProfile} />
        </div>
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleCreate}
          disabled={!displayName.trim() || !handle.trim()}
          className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create identity
        </button>
      </div>
    </div>
  )
}
