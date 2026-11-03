import * as React from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft, Copy, Download, Lock } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'
import { encryptIdentityBackup } from '../../bridge/identity/backup'
import { emitToast } from '../../lib/toast-events'

export default function RecoveryPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onboardingMode = pathname.startsWith('/onboarding/')
  const { identity, setPhraseSaved } = useIdentityBridge()
  const phrase = identity?.recoveryPhrase ?? []
  const [saved, setSaved] = React.useState(identity?.recoveryPhraseSaved ?? false)
  const [showBackupForm, setShowBackupForm] = React.useState(false)
  const [backupPassphrase, setBackupPassphrase] = React.useState('')
  const [backupConfirmation, setBackupConfirmation] = React.useState('')
  const [backupError, setBackupError] = React.useState('')
  const [creatingBackup, setCreatingBackup] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')
  const [copyStatus, setCopyStatus] = React.useState('')

  const handleCopyPhrase = async () => {
    if (phrase.length !== 12) return
    setCopyStatus('')
    try {
      await navigator.clipboard.writeText(phrase.join(' '))
      setCopyStatus('Recovery phrase copied. Clear it from your clipboard after saving it somewhere private.')
    } catch {
      setCopyStatus('Could not access the clipboard. Write the words down in order and store them somewhere private.')
    }
  }

  const handleContinue = () => {
    if (!onboardingMode) {
      navigate(-1)
      return
    }
    if (!saved) return
    setSaveError('')
    if (!setPhraseSaved()) {
      setSaveError('Could not save this recovery confirmation in the browser. Check available storage and try again.')
      return
    }
    navigate('/onboarding/network')
  }

  const handleCreateBackup = async () => {
    if (!identity || phrase.length !== 12) return
    if (backupPassphrase.length < 10) {
      setBackupError('Use a passphrase with at least 10 characters.')
      return
    }
    if (backupPassphrase !== backupConfirmation) {
      setBackupError('The passphrases do not match.')
      return
    }

    setBackupError('')
    setCreatingBackup(true)
    try {
      const contents = await encryptIdentityBackup({
        format: 'nexus-identity-backup',
        version: 1,
        displayName: identity.displayName,
        handle: identity.handle,
        jid: identity.jid,
        publicProfile: identity.publicProfile,
        recoveryPhrase: phrase,
        createdAt: identity.createdAt,
      }, backupPassphrase)
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `nexus-${identity.handle}-backup.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setShowBackupForm(false)
      setBackupPassphrase('')
      setBackupConfirmation('')
      emitToast('Encrypted identity backup downloaded', 'success')
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Could not create the backup.')
    } finally {
      setCreatingBackup(false)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-heading font-semibold text-foreground">{onboardingMode ? 'Secure recovery' : <><span className="sm:hidden">Recovery &amp; backup</span><span className="hidden sm:inline">Recovery phrase &amp; backup</span></>}</h1>
            <p className="text-[12px] text-muted-foreground">{onboardingMode ? 'Save these words offline' : <><span className="sm:hidden">Manage your recovery copy</span><span className="hidden sm:inline">Manage a recovery copy for this identity</span></>}</p>
          </div>
        </div>
        {onboardingMode && <div className="mt-2 pl-14"><ProgressDots current={2} /></div>}
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <div>
          <div className="text-[13px] font-semibold text-foreground mb-2">Recovery phrase</div>
          {phrase.length > 0 ? (
            <div className="bg-card rounded-xl p-4 sm:p-5">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">Copy only on a trusted device. Anyone with these words can restore your identity.</p>
                <button type="button" onClick={() => void handleCopyPhrase()} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-secondary sm:w-auto">
                  <Copy size={13} /> Copy phrase
                </button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 sm:grid-cols-3">
                {phrase.map((word, i) => (
                  <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-xs text-foreground font-mono">
                    {i + 1}. {word}
                  </div>
                ))}
              </div>
              {copyStatus && <p role="status" aria-live="polite" className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{copyStatus}</p>}
            </div>
          ) : (
            <div className="bg-card rounded-xl px-4 py-4 flex items-center justify-center min-h-20">
              <p className="text-sm text-muted-foreground">No recovery phrase available. Create an identity first.</p>
            </div>
          )}
        </div>

        {phrase.length === 12 && (
          <details className="rounded-xl border border-border bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-foreground">
              <Lock size={16} className="text-primary" />
              <span className="flex-1">Encrypted backup</span>
              <span className="text-[11px] font-normal text-muted-foreground">Optional</span>
            </summary>
            <div className="space-y-3 px-4 pb-4">
              <p className="text-[11px] text-muted-foreground">Protect a recovery copy with a separate passphrase. The passphrase is never stored.</p>
              {!showBackupForm ? (
                <button type="button" onClick={() => setShowBackupForm(true)} className="flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-3 text-xs font-semibold text-foreground hover:bg-secondary/80">
                  <Download size={14} /> Create encrypted backup
                </button>
              ) : (
                <div className="space-y-2">
                  <input type="password" autoComplete="new-password" value={backupPassphrase} onChange={(event) => setBackupPassphrase(event.target.value)} placeholder="Backup passphrase (10+ characters)" aria-label="Backup passphrase" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40" />
                  <input type="password" autoComplete="new-password" value={backupConfirmation} onChange={(event) => setBackupConfirmation(event.target.value)} placeholder="Confirm backup passphrase" aria-label="Confirm backup passphrase" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40" />
                  {backupError && <p role="alert" className="text-xs text-destructive">{backupError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void handleCreateBackup()} disabled={creatingBackup} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{creatingBackup ? 'Encrypting…' : 'Download backup'}</button>
                    <button type="button" onClick={() => { setShowBackupForm(false); setBackupError(''); setBackupPassphrase(''); setBackupConfirmation('') }} className="min-h-11 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {onboardingMode && phrase.length === 12 && <div className="bg-card rounded-xl px-4 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">I saved my recovery phrase</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Required before continuing</div>
          </div>
          <Toggle label="I saved my recovery phrase" checked={saved} onChange={setSaved} />
        </div>}
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleContinue}
          disabled={onboardingMode && (!saved || phrase.length === 0)}
          className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {onboardingMode ? 'Continue' : 'Done'}
        </button>
      </div>
    </div>
  )
}
