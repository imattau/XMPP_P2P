import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, AlertCircle, UserRound } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'

export default function CreateIdentityPage() {
  const navigate = useNavigate()
  const { identity, createIdentity } = useIdentityBridge()
  const [displayName, setDisplayName] = useState(identity?.displayName ?? '')
  const [handle, setHandle] = useState(identity?.handle ?? '')
  const [errors, setErrors] = useState<{ displayName?: string; handle?: string }>({})
  const [saveError, setSaveError] = useState('')

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!displayName.trim()) next.displayName = 'Display name is required'
    else if (displayName.trim().length < 2) next.displayName = 'Display name must be at least 2 characters'
    if (!handle.trim()) next.handle = 'Handle is required'
    else if (!/^[a-zA-Z0-9_]+$/.test(handle.trim())) next.handle = 'Handle must be letters, numbers, and underscores only'
    else if (handle.trim().length < 2) next.handle = 'Handle must be at least 2 characters'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleCreate = () => {
    if (!validate()) return
    setSaveError('')
    try {
      if (!createIdentity(displayName.trim(), handle.trim())) {
        setSaveError('Could not save your identity in this browser. Check available storage and try again.')
        return
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not securely generate your recovery phrase.')
      return
    }
    navigate('/onboarding/recovery')
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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

      <main className="flex-1 overflow-y-auto px-4 pt-5">
        <form noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleCreate() }}>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <div>
          <label htmlFor="identity-display-name" className="text-[12px] font-medium text-muted-foreground block mb-1.5">Display name <span className="text-destructive" aria-hidden="true">*</span></label>
          <input
            id="identity-display-name"
            required
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={errors.displayName ? 'identity-display-name-error' : undefined}
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); if (errors.displayName) setErrors((prev) => ({ ...prev, displayName: undefined })) }}
            placeholder="Your public name"
            className={`w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 ${errors.displayName ? 'focus:ring-destructive ring-2 ring-destructive/50' : 'focus:ring-primary/50'}`}
          />
          {errors.displayName && <p id="identity-display-name-error" role="alert" className="flex items-center gap-1 mt-1 text-[11px] text-destructive"><AlertCircle size={11} />{errors.displayName}</p>}
        </div>

        <div>
          <label htmlFor="identity-handle" className="text-[12px] font-medium text-muted-foreground block mb-1.5">Handle <span className="text-destructive" aria-hidden="true">*</span></label>
          <input
            id="identity-handle"
            required
            aria-invalid={Boolean(errors.handle)}
            aria-describedby={errors.handle ? 'identity-handle-error' : undefined}
            value={handle}
            onChange={(e) => { setHandle(e.target.value); if (errors.handle) setErrors((prev) => ({ ...prev, handle: undefined })) }}
            autoComplete="username"
            placeholder="e.g. alex_42"
            className={`w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 ${errors.handle ? 'focus:ring-destructive ring-2 ring-destructive/50' : 'focus:ring-primary/50'}`}
          />
          {!errors.handle && <p className="mt-1 text-[11px] text-muted-foreground">Use 2 or more letters, numbers, or underscores.</p>}
          {errors.handle && <p id="identity-handle-error" role="alert" className="flex items-center gap-1 mt-1 text-[11px] text-destructive"><AlertCircle size={11} />{errors.handle}</p>}
        </div>

        <div>
          <div className="text-[13px] font-semibold text-foreground mb-2">Identity preview</div>
          <div className="bg-card rounded-xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue2 rounded-full flex items-center justify-center flex-shrink-0">
                {displayName.trim()
                  ? <span aria-hidden="true" className="text-2xl font-bold text-primary">{displayName.trim().charAt(0).toUpperCase()}</span>
                  : <UserRound aria-hidden="true" size={26} className="text-primary/70" />}
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">{displayName || 'Your name'}</div>
                <div className="text-[12px] text-muted-foreground font-mono mt-0.5">
                  @{handle || 'handle'}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">Profile handle · peer address created when Nexus opens</div>
                <div className="text-[11px] text-accent bg-green2/20 px-2 py-0.5 rounded inline-block mt-1.5">
                  Generated locally
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl px-4 py-4">
          <div className="text-sm font-semibold text-foreground">How people find you</div>
          <p className="text-xs leading-relaxed text-muted-foreground mt-1">Your handle is a profile label, not a network address. Open Nexus at the end of setup to create your peer address, then copy it from your profile to share with contacts. Nexus has no public handle directory.</p>
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 bg-background/95 px-4 pb-4 pt-3 backdrop-blur">
          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-colors hover:bg-primary/90"
          >
            Create identity
          </button>
        </div>
        </form>
      </main>
    </div>
  )
}
