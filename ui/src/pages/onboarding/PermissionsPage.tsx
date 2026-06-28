import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import type { PermissionsState } from '../../bridge/identity/types'
import ProgressDots from '../../components/onboarding/ProgressDots'
import Toggle from '../../components/onboarding/Toggle'

const PERMISSIONS: { key: keyof PermissionsState; label: string; desc: string }[] = [
  { key: 'notifications', label: 'Notifications', desc: 'Message, mention and security alerts' },
  { key: 'nearbyDiscovery', label: 'Nearby discovery', desc: 'Find peers on your local network' },
  { key: 'photosAndFiles', label: 'Photos and files', desc: 'Attach media to posts and messages' },
  { key: 'microphone', label: 'Microphone', desc: 'Record voice messages' },
]

export default function PermissionsPage() {
  const navigate = useNavigate()
  const { permissions, setPermissions } = useIdentityBridge()
  const [localPerms, setLocalPerms] = React.useState({ ...permissions })

  const toggle = (key: keyof typeof localPerms) => {
    setLocalPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleContinue = () => {
    setPermissions(localPerms)
    navigate('/onboarding/network')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
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
              checked={localPerms[key as keyof typeof localPerms]}
              onChange={() => toggle(key as keyof typeof localPerms)}
            />
          </div>
        ))}

        <p className="text-[12px] text-muted-foreground text-center pt-2">
          You can change these later in Settings.
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
