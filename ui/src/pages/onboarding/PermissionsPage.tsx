import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import type { PermissionsState } from '../../bridge/identity/types'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'
import { requestNotificationPermission } from '../../bridge/useNotifications'

const PERMISSIONS: { key: keyof PermissionsState; label: string; desc: string }[] = [
  { key: 'notifications', label: 'Notifications', desc: 'Message and feed alerts when you enable them in Preferences' },
  { key: 'photosAndFiles', label: 'Photos and files', desc: 'Choose uploads for messages, article covers, and your profile' },
]

const UNSUPPORTED_CAPABILITIES = [
  { label: 'Nearby discovery', detail: 'The browser client discovers peers through configured bootstrap nodes, not local network discovery.' },
]

export default function PermissionsPage() {
  const navigate = useNavigate()
  const { permissions, setPermissions } = useIdentityBridge()
  const [localPerms, setLocalPerms] = React.useState({ ...permissions })
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')

  const toggle = (key: keyof typeof localPerms) => {
    setLocalPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleContinue = async () => {
    if (saving) return
    setSaving(true)
    setSaveError('')
    const nextPermissions = { ...localPerms }
    try {
      if (nextPermissions.notifications) {
        nextPermissions.notifications = await requestNotificationPermission()
        setLocalPerms(nextPermissions)
      }
      if (!setPermissions(nextPermissions)) {
        setSaveError('Could not save permissions in this browser. Check available storage and try again.')
        return
      }
      navigate('/onboarding/network')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save permissions. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Permissions</h1>
          <p className="text-[12px] text-muted-foreground">Choose what Nexus can access</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={3} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {PERMISSIONS.map(({ key, label, desc }) => (
          <div key={key} className="bg-card rounded-xl px-4 py-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
            </div>
            <Toggle
              label={label}
              checked={localPerms[key as keyof typeof localPerms]}
              onChange={() => toggle(key as keyof typeof localPerms)}
            />
          </div>
        ))}

        {UNSUPPORTED_CAPABILITIES.map(({ label, detail }) => (
          <div key={label} className="bg-card/50 rounded-xl px-4 py-4 opacity-70">
            <div className="text-sm font-semibold text-foreground">{label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{detail}</div>
          </div>
        ))}

        <p className="text-[12px] text-muted-foreground text-center pt-2">
          You can change these later in Settings.
        </p>
        {saveError && <p role="alert" className="text-sm text-destructive text-center">{saveError}</p>}
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleContinue}
          disabled={saving}
          className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
