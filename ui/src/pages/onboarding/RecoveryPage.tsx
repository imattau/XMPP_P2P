import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'

export default function RecoveryPage() {
  const navigate = useNavigate()
  const { identity, setPhraseSaved } = useIdentityBridge()
  const phrase = identity?.recoveryPhrase ?? []
  const [saved, setSaved] = React.useState(identity?.recoveryPhraseSaved ?? false)

  const handleContinue = () => {
    if (!saved) return
    setPhraseSaved()
    navigate('/onboarding/permissions')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Secure recovery</h1>
          <p className="text-[12px] text-muted-foreground">Save these words offline</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={2} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <div>
          <div className="text-[13px] font-semibold text-foreground mb-2">Recovery phrase</div>
          {phrase.length > 0 ? (
            <div className="bg-card rounded-xl p-5">
              <div className="grid grid-cols-3 gap-2">
                {phrase.map((word, i) => (
                  <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-[11px] text-foreground font-mono">
                    {i + 1}. {word}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl p-5 flex items-center justify-center h-[200px]">
              <p className="text-sm text-muted-foreground">No recovery phrase available. Create an identity first.</p>
            </div>
          )}
        </div>

        <p className="text-[12px] text-muted-foreground px-1">
          Store this somewhere private. Anyone with it can restore your identity.
        </p>

        <div className="bg-card rounded-xl px-4 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">I saved my recovery phrase</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Required before continuing</div>
          </div>
          <Toggle checked={saved} onChange={setSaved} />
        </div>
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleContinue}
          disabled={!saved || phrase.length === 0}
          className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
