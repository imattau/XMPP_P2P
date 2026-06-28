import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, QrCode, FileText, FileArchive, User } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'

const OPTIONS = [
  { key: 'qr', icon: QrCode, title: 'Scan QR code', desc: 'Use another signed-in device', highlighted: true },
  { key: 'phrase', icon: FileText, title: 'Recovery phrase', desc: 'Enter your saved recovery words', highlighted: false },
  { key: 'backup', icon: FileArchive, title: 'Identity backup', desc: 'Import an encrypted backup file', highlighted: false },
  { key: 'paste', icon: User, title: 'Paste identity', desc: 'Use a JID and private key bundle', highlighted: false },
]

export default function ImportIdentityPage() {
  const navigate = useNavigate()
  const { importIdentity } = useIdentityBridge()
  const [selected, setSelected] = React.useState<string>('qr')

  const handleContinue = () => {
    importIdentity(selected as 'qr' | 'phrase' | 'backup' | 'paste', {
      displayName: 'Maren Holdt',
      handle: 'maren',
    })
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
            onClick={() => setSelected(key)}
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

        <p className="text-[12px] text-muted-foreground text-center pt-4 px-2">
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
