import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, FileText, FileArchive, User, AlertCircle } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import { isValidRecoveryPhrase } from '../../bridge/identity/controller'
import ProgressDots from '../../components/onboarding/ProgressDots'
import { decryptIdentityBackup } from '../../bridge/identity/backup'

const OPTIONS = [
  { key: 'phrase', icon: FileText, title: 'Recovery phrase' },
  { key: 'backup', icon: FileArchive, title: 'Identity backup' },
  { key: 'paste', icon: User, title: 'Paste JSON' },
]

const INITIAL_METHOD = 'phrase'

export default function ImportIdentityPage() {
  const navigate = useNavigate()
  const { importIdentity } = useIdentityBridge()
  const [selected, setSelected] = React.useState<string>(INITIAL_METHOD)
  const [importing, setImporting] = React.useState(false)
  const importInProgress = React.useRef(false)
  const methodRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  // Phrase import fields
  const [phraseText, setPhraseText] = React.useState('')
  const [phraseError, setPhraseError] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [handle, setHandle] = React.useState('')
  const [fieldErrors, setFieldErrors] = React.useState<{ displayName?: string; handle?: string }>({})

  // Paste identity field
  const [pastedData, setPastedData] = React.useState('')
  const [pasteError, setPasteError] = React.useState('')
  const [backupFile, setBackupFile] = React.useState<File | null>(null)
  const [backupPassphrase, setBackupPassphrase] = React.useState('')

  // Generic error
  const [error, setError] = React.useState('')

  const selectMethod = (key: string) => {
    setSelected(key)
    setError('')
    setPhraseError('')
    setPasteError('')
    setFieldErrors({})
  }

  const handleMethodKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentKey: string) => {
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1
        : 0
    if (!direction) return
    event.preventDefault()
    const currentIndex = OPTIONS.findIndex((option) => option.key === currentKey)
    const next = OPTIONS[(currentIndex + direction + OPTIONS.length) % OPTIONS.length]
    selectMethod(next.key)
    methodRefs.current[next.key]?.focus()
  }

  const isValid = () => {
    if (selected === 'phrase') {
      const nextErrors: typeof fieldErrors = {}
      if (!displayName.trim()) nextErrors.displayName = 'Display name is required'
      else if (displayName.trim().length < 2) nextErrors.displayName = 'Display name must be at least 2 characters'
      if (!handle.trim()) nextErrors.handle = 'Handle is required'
      else if (!/^[a-zA-Z0-9_]+$/.test(handle.trim())) nextErrors.handle = 'Handle must be letters, numbers, and underscores only'
      else if (handle.trim().length < 2) nextErrors.handle = 'Handle must be at least 2 characters'
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors)
        return false
      }
      if (!phraseText.trim()) { setPhraseError('Please enter your recovery phrase'); return false }
      const words = phraseText.trim().split(/\s+/)
      if (words.length !== 12) { setPhraseError('Recovery phrase must be exactly 12 words'); return false }
      if (!isValidRecoveryPhrase(words)) { setPhraseError('One or more words are not in the recovery word list'); return false }
      return true
    }
    if (selected === 'paste') {
      if (!pastedData.trim()) { setPasteError('Please paste your identity data'); return false }
      try {
        const parsed = JSON.parse(pastedData.trim())
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setPasteError('Pasted data must be a JSON object')
          return false
        }
        if (typeof parsed.handle !== 'string' || !/^[a-zA-Z0-9_]{2,}$/.test(parsed.handle.trim())) {
          setPasteError('Pasted data must include a handle with at least 2 letters, numbers, or underscores')
          return false
        }
        const pastedName = parsed.displayName ?? parsed.handle
        if (typeof pastedName !== 'string' || pastedName.trim().length < 2) {
          setPasteError('Pasted data must include a display name with at least 2 characters')
          return false
        }
        const words = Array.isArray(parsed.recoveryPhrase)
          ? parsed.recoveryPhrase
          : typeof parsed.recoveryPhrase === 'string'
            ? parsed.recoveryPhrase.trim().split(/\s+/)
            : []
        if (words.length !== 12 || !words.every((word: unknown) => typeof word === 'string') || !isValidRecoveryPhrase(words)) {
          setPasteError('Pasted data must include the valid 12-word "recoveryPhrase"')
          return false
        }
      } catch {
        setPasteError('Pasted data is not valid JSON')
        return false
      }
      return true
    }
    if (selected === 'backup') {
      if (!backupFile) { setError('Choose an encrypted identity backup file.'); return false }
      if (backupFile.size > 2 * 1024 * 1024) { setError('Backup file is larger than 2 MB.'); return false }
      if (!backupPassphrase) { setError('Enter the backup passphrase.'); return false }
      return true
    }
    return true
  }

  const handleContinue = async () => {
    if (importInProgress.current) return
    setError('')
    setPhraseError('')
    setPasteError('')
    setFieldErrors({})

    if (!isValid()) return

    importInProgress.current = true
    setImporting(true)
    try {
      let imported = false
      if (selected === 'phrase') {
        const words = phraseText.trim().split(/\s+/)
        imported = importIdentity('phrase', {
          displayName: displayName.trim(),
          handle: handle.trim(),
          phrase: words,
        })
      } else if (selected === 'paste') {
        const parsed = JSON.parse(pastedData.trim())
        const words = Array.isArray(parsed.recoveryPhrase)
          ? parsed.recoveryPhrase
          : parsed.recoveryPhrase.trim().split(/\s+/)
        imported = importIdentity('paste', {
          displayName: (parsed.displayName ?? parsed.handle).trim(),
          handle: parsed.handle.trim(),
          jid: parsed.jid,
          phrase: words,
          publicProfile: parsed.publicProfile ?? true,
        })
      } else if (selected === 'backup' && backupFile) {
        try {
          const payload = await decryptIdentityBackup(await backupFile.text(), backupPassphrase)
          if (!/^[a-zA-Z0-9_]{2,}$/.test(payload.handle)) throw new Error('Backup contains an invalid identity handle.')
          if (typeof payload.displayName !== 'string' || payload.displayName.trim().length < 2) throw new Error('Backup must contain a display name with at least 2 characters.')
          if (!isValidRecoveryPhrase(payload.recoveryPhrase)) throw new Error('Backup contains an invalid recovery phrase.')
          imported = importIdentity('backup', {
            displayName: payload.displayName,
            handle: payload.handle,
            jid: payload.jid,
            phrase: payload.recoveryPhrase,
            publicProfile: payload.publicProfile,
          })
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Could not import this backup.')
          return
        }
      } else {
        return
      }
      if (!imported) {
        setError('Could not save this identity in the browser. Check available storage and try again.')
        return
      }
      navigate('/onboarding/recovery')
    } finally {
      importInProgress.current = false
      setImporting(false)
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
            <h1 className="text-heading font-semibold text-foreground">Import identity</h1>
            <p className="text-[12px] text-muted-foreground">Restore an existing account</p>
          </div>
        </div>
        <div className="mt-2 pl-14">
          <ProgressDots current={1} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        <div role="radiogroup" aria-label="Import method" className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ key, icon: Icon, title }) => (
            <button
              key={key}
              ref={(element) => { methodRefs.current[key] = element }}
              type="button"
              role="radio"
              aria-checked={selected === key}
              tabIndex={selected === key ? 0 : -1}
              disabled={importing}
              onClick={() => selectMethod(key)}
              onKeyDown={(event) => handleMethodKeyDown(event, key)}
              className={`flex min-h-[76px] w-full flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center transition-colors disabled:cursor-wait disabled:opacity-60 sm:min-h-20 sm:gap-2 sm:px-3 ${
                selected === key ? 'bg-blue2' : 'bg-card'
              }`}
            >
              <Icon size={20} className={`shrink-0 ${selected === key ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="min-w-0">
                <div className={`text-xs font-semibold leading-tight ${selected === key ? 'text-primary' : 'text-foreground'}`}>
                  {title}
                </div>
              </div>
            </button>
          ))}
        </div>

        {selected === 'phrase' && (
          <div className="space-y-4 pt-2">
            <div>
              <label htmlFor="import-display-name" className="text-[12px] font-medium text-muted-foreground block mb-1.5">Display name</label>
              <input
                id="import-display-name"
                required
                aria-invalid={Boolean(fieldErrors.displayName)}
                aria-describedby={fieldErrors.displayName ? 'import-display-name-error' : undefined}
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setFieldErrors((prev) => ({ ...prev, displayName: undefined })) }}
                placeholder="Your public name"
                className={`w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 ${fieldErrors.displayName ? 'focus:ring-destructive ring-2 ring-destructive/50' : 'focus:ring-primary/50'}`}
              />
              {fieldErrors.displayName && <p id="import-display-name-error" role="alert" className="mt-1 text-[11px] text-destructive">{fieldErrors.displayName}</p>}
            </div>
            <div>
              <label htmlFor="import-handle" className="text-[12px] font-medium text-muted-foreground block mb-1.5">Handle</label>
              <input
                id="import-handle"
                required
                aria-invalid={Boolean(fieldErrors.handle)}
                aria-describedby={fieldErrors.handle ? 'import-handle-error' : undefined}
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setFieldErrors((prev) => ({ ...prev, handle: undefined })) }}
                placeholder="yourhandle"
                autoComplete="username"
                className={`w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 ${fieldErrors.handle ? 'focus:ring-destructive ring-2 ring-destructive/50' : 'focus:ring-primary/50'}`}
              />
              {fieldErrors.handle && <p id="import-handle-error" role="alert" className="mt-1 text-[11px] text-destructive">{fieldErrors.handle}</p>}
            </div>
            <div>
              <label htmlFor="import-recovery-phrase" className="text-[12px] font-medium text-muted-foreground block mb-1.5">Recovery phrase (12 words)</label>
              <textarea
                id="import-recovery-phrase"
                required
                aria-invalid={Boolean(phraseError)}
                aria-describedby={phraseError ? 'import-recovery-phrase-error' : undefined}
                value={phraseText}
                onChange={(e) => { setPhraseText(e.target.value); setPhraseError(''); setError('') }}
                placeholder="Separate words with spaces"
                rows={3}
                className="w-full bg-secondary rounded-xl p-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 resize-none"
              />
              {phraseError && <p id="import-recovery-phrase-error" role="alert" className="flex items-center gap-1 mt-1 text-[11px] text-destructive"><AlertCircle size={11} />{phraseError}</p>}
            </div>

            <p className="rounded-xl bg-card px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Share your peer address so people can connect.</p>
          </div>
        )}

        {selected === 'backup' && (
          <div className="bg-card rounded-xl p-4 space-y-3">
            <label className="block text-xs text-muted-foreground">
              Backup file
              <input type="file" aria-label="Encrypted identity backup file" accept=".json,application/json" onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); setError('') }} className="mt-1 block w-full min-w-0 text-xs file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-foreground" />
            </label>
            {backupFile && <p className="truncate text-[11px] text-muted-foreground">Selected: {backupFile.name}</p>}
            <label className="block text-xs text-muted-foreground">
              Backup passphrase
              <input type="password" aria-label="Backup passphrase" autoComplete="current-password" value={backupPassphrase} onChange={(event) => { setBackupPassphrase(event.target.value); setError('') }} placeholder="Passphrase" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
          </div>
        )}

        {selected === 'paste' && (
          <div className="space-y-4 pt-2">
            <div>
              <label htmlFor="import-identity-json" className="text-[12px] font-medium text-muted-foreground block mb-1.5">Paste identity JSON</label>
              <textarea
                id="import-identity-json"
                required
                aria-invalid={Boolean(pasteError)}
                aria-describedby={pasteError ? 'import-identity-json-error' : undefined}
                value={pastedData}
                onChange={(e) => { setPastedData(e.target.value); setPasteError(''); setError('') }}
                placeholder='{"handle": "maren", "displayName": "Maren Holdt", "recoveryPhrase": ["word1", "word2", "…"]}'
                rows={4}
                className="min-h-28 w-full resize-none rounded-xl bg-secondary p-4 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 sm:min-h-36"
              />
              {pasteError && <p id="import-identity-json-error" role="alert" className="flex items-center gap-1 mt-1 text-[11px] text-destructive"><AlertCircle size={11} />{pasteError}</p>}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-1 text-[11px] text-destructive justify-center">
            <AlertCircle size={11} />{error}
          </p>
        )}

      </main>

      <div className="flex-shrink-0 border-t border-border bg-background px-4 pt-2 pb-4">
        <p className="mb-2 text-[11px] leading-relaxed text-center text-muted-foreground">
          Imported locally. Nothing is uploaded.
        </p>
        <button
          onClick={handleContinue}
          disabled={importing}
          aria-busy={importing}
          className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {importing ? 'Importing identity…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
