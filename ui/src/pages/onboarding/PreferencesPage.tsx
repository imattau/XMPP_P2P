import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Sun, Moon } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'

const TOGGLES: { key: 'messageNotifications' | 'feedNotifications' | 'autoDownloadMedia'; label: string; desc: string }[] = [
  { key: 'messageNotifications', label: 'Message notifications', desc: 'Alerts for direct and group chats' },
  { key: 'feedNotifications', label: 'Feed notifications', desc: 'Replies and mentions only' },
  { key: 'autoDownloadMedia', label: 'Auto-download media', desc: 'Wi-Fi only' },
]

export default function PreferencesPage() {
  const navigate = useNavigate()
  const { preferences, setPreferences, setTheme } = useIdentityBridge()
  const [localPrefs, setLocalPrefs] = React.useState({ ...preferences })
  const [localTheme, setLocalTheme] = React.useState(preferences.theme)

  const toggle = (key: keyof typeof localPrefs) => {
    setLocalPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleThemeChange = (theme: 'system' | 'dark') => {
    setLocalTheme(theme)
  }

  const handleContinue = () => {
    setPreferences(localPrefs)
    setTheme(localTheme)
    navigate('/onboarding/ready')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Preferences</h1>
          <p className="text-[12px] text-muted-foreground">Set up your default experience</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={5} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {TOGGLES.map(({ key, label, desc }) => (
          <div key={key} className="bg-card rounded-xl px-4 py-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
            </div>
            <Toggle
              checked={localPrefs[key]}
              onChange={() => toggle(key)}
            />
          </div>
        ))}

        <div className="pt-2">
          <div className="text-[13px] font-semibold text-foreground mb-2">Appearance</div>

          <button
            onClick={() => handleThemeChange('system')}
            className={`w-full rounded-xl px-4 py-4 flex items-center gap-3 text-left transition-colors ${
              localTheme === 'system' ? 'bg-blue2' : 'bg-card'
            }`}
          >
            <Sun size={22} className={localTheme === 'system' ? 'text-primary' : 'text-muted-foreground'} />
            <div>
              <div className={`text-sm font-semibold ${localTheme === 'system' ? 'text-primary' : 'text-foreground'}`}>
                Use system theme
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Match device appearance</div>
            </div>
          </button>

          <button
            onClick={() => handleThemeChange('dark')}
            className={`w-full rounded-xl px-4 py-4 flex items-center gap-3 text-left transition-colors mt-2 ${
              localTheme === 'dark' ? 'bg-blue2' : 'bg-card'
            }`}
          >
            <Moon size={22} className={localTheme === 'dark' ? 'text-primary' : 'text-muted-foreground'} />
            <div>
              <div className={`text-sm font-semibold ${localTheme === 'dark' ? 'text-primary' : 'text-foreground'}`}>
                Dark theme
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Always use the dark interface</div>
            </div>
          </button>
        </div>
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
