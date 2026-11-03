import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Sun, Moon, Image } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'
import { requestNotificationPermission } from '../../bridge/useNotifications'

const TOGGLES: { key: 'messageNotifications' | 'feedNotifications'; label: string; desc: string }[] = [
  { key: 'messageNotifications', label: 'Message notifications', desc: 'Alerts for direct and group chats' },
  { key: 'feedNotifications', label: 'Feed notifications', desc: 'Alerts when new feed posts arrive' },
]

export default function PreferencesPage() {
  const navigate = useNavigate()
  const { permissions, preferences, setPreferences, setPermissions } = useIdentityBridge()
  const notificationsGranted = permissions.notifications
    && typeof Notification !== 'undefined'
    && Notification.permission === 'granted'
  const [localPrefs, setLocalPrefs] = React.useState(() => ({
    ...preferences,
    messageNotifications: preferences.messageNotifications && notificationsGranted,
    feedNotifications: preferences.feedNotifications && notificationsGranted,
  }))
  const [localTheme, setLocalTheme] = React.useState(preferences.theme)
  const [allowPhotosAndFiles, setAllowPhotosAndFiles] = React.useState(permissions.photosAndFiles)
  const [permissionPending, setPermissionPending] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')

  const toggle = async (key: keyof typeof localPrefs) => {
    if (permissionPending) return
    const enabled = !localPrefs[key]
    if ((key === 'messageNotifications' || key === 'feedNotifications') && enabled) {
      setPermissionPending(true)
      try {
        const granted = await requestNotificationPermission()
        if (!granted) {
          setPermissions({ notifications: false })
          return
        }
        setPermissions({ notifications: true })
      } finally {
        setPermissionPending(false)
      }
    }
    setLocalPrefs((prev) => ({ ...prev, [key]: enabled }))
  }

  const handleThemeChange = (theme: 'system' | 'dark') => {
    setLocalTheme(theme)
  }

  const handleContinue = () => {
    setSaveError('')
    if (!setPermissions({ photosAndFiles: allowPhotosAndFiles })) {
      setSaveError('Could not save permissions in this browser. Check available storage and try again.')
      return
    }
    if (!setPreferences({ ...localPrefs, theme: localTheme })) {
      setSaveError('Could not save your preferences in this browser. Check available storage and try again.')
      return
    }
    navigate('/onboarding/ready')
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-heading font-semibold text-foreground">Preferences</h1>
            <p className="text-[12px] text-muted-foreground">Set up your default experience</p>
          </div>
        </div>
        <div className="mt-2 pl-14">
          <ProgressDots current={5} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {TOGGLES.map(({ key, label, desc }) => (
          <div key={key} className="bg-card rounded-xl px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
            </div>
            <Toggle
              label={label}
              checked={localPrefs[key]}
              onChange={() => toggle(key)}
              disabled={permissionPending}
            />
          </div>
        ))}
        {!notificationsGranted && (
          <p className="text-[11px] text-muted-foreground px-1" role="status">
            {typeof Notification === 'undefined'
              ? 'This browser does not support notifications.'
              : Notification.permission === 'denied'
                ? 'Notifications are blocked by your browser. Allow them in site settings to receive alerts.'
                : 'Notifications are off. Turn on an alert above to request browser permission.'}
          </p>
        )}
        {permissionPending && <p role="status" className="text-[11px] text-primary px-1">Waiting for browser permission…</p>}
        {saveError && <p role="alert" className="text-[11px] text-destructive px-1">{saveError}</p>}

        <div className="pt-2">
          <div className="text-[13px] font-semibold text-foreground mb-2">Files and media</div>
          <div className="bg-card rounded-xl px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Image size={15} className="text-primary" /> Photos and files
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Uploads for chats, articles, and your profile</div>
            </div>
            <Toggle
              label="Photos and files"
              checked={allowPhotosAndFiles}
              onChange={() => setAllowPhotosAndFiles((enabled) => !enabled)}
            />
          </div>
        </div>

        <div className="pt-2">
          <div className="text-[13px] font-semibold text-foreground mb-2">Appearance</div>
          <div role="group" aria-label="Appearance" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={localTheme === 'system'}
              onClick={() => handleThemeChange('system')}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${localTheme === 'system' ? 'border-primary bg-blue2 text-primary' : 'border-border bg-card text-foreground'}`}
            >
              <Sun size={16} className={localTheme === 'system' ? 'text-primary' : 'text-muted-foreground'} />
              System
            </button>
            <button
              type="button"
              aria-pressed={localTheme === 'dark'}
              onClick={() => handleThemeChange('dark')}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${localTheme === 'dark' ? 'border-primary bg-blue2 text-primary' : 'border-border bg-card text-foreground'}`}
            >
              <Moon size={16} className={localTheme === 'dark' ? 'text-primary' : 'text-muted-foreground'} />
              Dark
            </button>
          </div>
        </div>
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleContinue}
          className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
