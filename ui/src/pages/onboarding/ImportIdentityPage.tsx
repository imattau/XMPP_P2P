import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, QrCode, FileText, FileArchive, User, AlertCircle } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import { isValidRecoveryPhrase } from '../../bridge/identity/controller'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'

const OPTIONS = [
  { key: 'phrase', icon: FileText, title: 'Recovery phrase', desc: 'Enter your saved recovery words', highlighted: true },
  { key: 'qr', icon: QrCode, title: 'Scan QR code', desc: 'Use another signed-in device', highlighted: false },
  { key: 'backup', icon: FileArchive, title: 'Identity backup', desc: 'Import an encrypted backup file', highlighted: false },
  { key: 'paste', icon: User, title: 'Paste identity', desc: 'Use a JID and private key bundle', highlighted: false },
]

const PLACEHOLDER_METHODS = new Set(['qr', 'backup'])
const INITIAL_METHOD = 'phrase'

export default function ImportIdentityPage() {
  const navigate = useNavigate()
  const { importIdentity } = useIdentityBridge()
  const [selected, setSelected] = React.useState<string>(INITIAL_METHOD)

  // Phrase import fields
  const [phraseText, setPhraseText] = React.useState('')
  const [phraseError, setPhraseError] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [handle, setHandle] = React.useState('')

  // Paste identity field
  const [pastedData, setPastedData] = React.useState('')
  const [pasteError, setPasteError] = React.useState('')

  const [publicProfile, setPublicProfile] = React.useState(true)

  // Generic error
  const [error, setError] = React.useState('')

  const isValid = () => {
    if (PLACEHOLDER_METHODS.has(selected)) {
      setError('This import method is not yet available. Please use the recovery phrase method instead.')
      return false
    }
    if (selected === 'phrase') {
      if (!displayName.trim()) { setError('Display name is required'); return false }
      if (!handle.trim()) { setError('Handle is required'); return false }
      if (!/^[a-zA-Z0-9_]+$/.test(handle.trim())) { setError('Handle must be letters, numbers, and underscores only'); return false }
      if (!phraseText.trim()) { setError('Please enter your recovery phrase'); return false }
      const words = phraseText.trim().split(/\s+/)
      if (words.length !== 12) { setError('Recovery phrase must be exactly 12 words'); return false }
      if (!isValidRecoveryPhrase(words)) { setError('One or more words are not in the recovery word list'); return false }
      return true
    }
    if (selected === 'paste') {
      if (!pastedData.trim()) { setError('Please paste your identity data'); return false }
      try {
        const parsed = JSON.parse(pastedData.trim())
        if (!parsed.handle) { setError('Pasted data must include a "handle" field'); return false }
      } catch {
        setError('Pasted data is not valid JSON')
        return false
      }
      return true
    }
    return true
  }

  const handleContinue = () => {
    setError('')
    setPhraseError('')
    setPasteError('')

    if (!isValid()) return

    if (selected === 'phrase') {
      const words = phraseText.trim().split(/\s+/)
      importIdentity('phrase', {
        displayName: displayName.trim(),
        handle: handle.trim(),
        phrase: words,
        publicProfile,
      })
    } else if (selected === 'paste') {
      const parsed = JSON.parse(pastedData.trim())
      importIdentity('paste', {
        displayName: parsed.displayName ?? parsed.handle ?? 'Imported',
        handle: parsed.handle ?? 'imported',
        jid: parsed.jid,
        phrase: parsed.recoveryPhrase,
        publicProfile: parsed.publicProfile ?? true,
      })
    }
    navigate('/onboarding/recovery')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Import identity</h1>
          <p className="text-[12px] text-muted-foreground">Restore an existing account</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={1} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {OPTIONS.map(({ key, icon: Icon, title, desc, highlighted }) => (
          <button
            key={key}
            onClick={() => { setSelected(key); setError(''); setPhraseError(''); setPasteError('') }}
            className={`w-full rounded-xl px-4 py-4 flex items-center gap-3 text-left transition-colors ${
              highlighted || selected === key ? 'bg-blue2' : 'bg-card'
            }`}
          >
            <Icon size={22} className={highlighted || selected === key ? 'text-primary' : 'text-muted-foreground'} />
            <div>
              <div className={`text-sm font-semibold ${highlighted || selected === key ? 'text-primary' : 'text-foreground'}`}>
                {title}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
            </div>
          </button>
        ))}

        {selected === 'phrase' && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your public name"
                className="w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Handle</label>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="yourhandle"
                autoComplete="username"
                className="w-full bg-secondary rounded-xl h-[50px] px-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Recovery phrase (12 words)</label>
              <textarea
                value={phraseText}
                onChange={(e) => { setPhraseText(e.target.value); setPhraseError('') }}
                placeholder="Enter your 12 recovery words separated by spaces"
                rows={3}
                className="w-full bg-secondary rounded-xl p-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 resize-none"
              />
              {phraseError && <p className="flex items-center gap-1 mt-1 text-[11px] text-destructive"><AlertCircle size={11} />{phraseError}</p>}
            </div>

            <div className="bg-card rounded-xl px-4 py-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Public profile</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Allow discovery by handle</div>
              </div>
              <Toggle checked={publicProfile} onChange={setPublicProfile} />
            </div>
          </div>
        )}

        {selected === 'qr' && (
          <div className="bg-card rounded-xl p-6 text-center space-y-3">
            <QrCode size={40} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Open the app on your other signed-in device, go to Settings → Export Identity, and scan the QR code shown there.
            </p>
            <p className="text-[11px] text-muted-foreground">
              QR scanning will be available in a future update. Use the recovery phrase method instead.
            </p>
          </div>
        )}

        {selected === 'backup' && (
          <div className="bg-card rounded-xl p-6 text-center space-y-3">
            <FileArchive size={40} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Import an encrypted backup file previously exported from your identity settings.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Backup import will be available in a future update. Use the recovery phrase method instead.
            </p>
          </div>
        )}

        {selected === 'paste' && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Paste identity JSON</label>
              <textarea
                value={pastedData}
                onChange={(e) => { setPastedData(e.target.value); setPasteError('') }}
                placeholder='{"handle": "maren", "displayName": "Maren Holdt", "jid": "maren@peer", "recoveryPhrase": ["word1", "word2", ...]}'
                rows={6}
                className="w-full bg-secondary rounded-xl p-4 text-foreground text-body outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 resize-none font-mono text-[12px]"
              />
              {pasteError && <p className="flex items-center gap-1 mt-1 text-[11px] text-destructive"><AlertCircle size={11} />{pasteError}</p>}
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1 text-[11px] text-destructive justify-center">
            <AlertCircle size={11} />{error}
          </p>
        )}

        <p className="text-[12px] text-muted-foreground text-center pt-2 px-2">
          Import happens locally. Nothing is uploaded to a server.
        </p>
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleContinue}
          className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
