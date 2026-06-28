import * as React from 'react'
import { useNavigate } from 'react-router'
import { Check } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import ProgressDots from '../../components/onboarding/ProgressDots'

export default function ReadyPage() {
  const navigate = useNavigate()
  const { identity, completeOnboarding } = useIdentityBridge()
  const displayName = identity?.displayName ?? 'User'
  const handle = identity?.handle ?? 'user'

  const handleOpen = () => {
    completeOnboarding()
    navigate('/')
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <div>
          <h1 className="text-heading font-semibold text-foreground">You are ready</h1>
          <p className="text-[12px] text-muted-foreground">Your identity is active</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={7} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col items-center pt-8">
        <div className="w-[140px] h-[140px] bg-green2 rounded-full flex items-center justify-center">
          <Check size={48} className="text-accent" />
        </div>

        <h2 className="text-[25px] font-semibold text-foreground text-center mt-6">
          Welcome to Nexus
        </h2>
        <p className="text-body text-muted-foreground text-center max-w-xs mt-2 leading-relaxed">
          Your identity is secured and connected to the peer network.
        </p>

        <div className="bg-card rounded-xl p-6 w-full max-w-sm mt-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-blue2 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-[17px] font-semibold text-foreground mt-3">{displayName}</div>
            <div className="text-[12px] text-muted-foreground font-mono mt-0.5">{handle}@peer</div>
            <div className="flex items-center gap-3 mt-4">
              <span className="bg-green2 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-accent">
                Secure
              </span>
              <span className="text-[11px] text-muted-foreground">Connected to network</span>
            </div>
          </div>
        </div>
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleOpen}
          className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Open Nexus
        </button>
      </div>
    </div>
  )
}
