import * as React from 'react'
import { useNavigate } from 'react-router'
import { Check, Loader } from 'lucide-react'
import { useIdentityBridge } from '../../bridge/identity/useIdentityBridge'
import { ensureBrowserXmppClient, getBootstrapAddrs, getBrowserXmppBridge } from '../../bridge/runtime'
import ProgressDots from '../../components/onboarding/ProgressDots'

export default function ReadyPage() {
  const navigate = useNavigate()
  const { identity, completeOnboarding, clearRecoveryPhrase } = useIdentityBridge()
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState('')
  const [peerDiscoveryConfigured, setPeerDiscoveryConfigured] = React.useState<boolean | null>(null)
  const displayName = identity?.displayName ?? 'User'
  const handle = identity?.handle ?? 'user'

  React.useEffect(() => {
    let active = true
    void getBootstrapAddrs()
      .then((addresses) => { if (active) setPeerDiscoveryConfigured(addresses.length > 0) })
      .catch(() => { if (active) setPeerDiscoveryConfigured(false) })
    return () => { active = false }
  }, [])

  const handleOpen = async () => {
    setStarting(true)
    setError('')
    try {
      const bridge = getBrowserXmppBridge()
      if (!bridge) {
        const bootstrapAddrs = await getBootstrapAddrs()
        await ensureBrowserXmppClient({
          bootstrapAddrs,
          dbName: 'xmpp-p2p',
          nickname: displayName,
          recoveryPhrase: identity?.recoveryPhraseKeyed ? identity.recoveryPhrase : undefined,
        })
        if (!getBrowserXmppBridge()) throw new Error('The peer network did not finish starting. Please try again.')
      }
      // Keep the recovery words only until the peer key has been derived and saved.
      if (!clearRecoveryPhrase() || !completeOnboarding()) {
        throw new Error('The peer network is running, but this browser could not save the activation state. Check available storage and retry.')
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start P2P node')
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col overflow-hidden">
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
          {peerDiscoveryConfigured === null
            ? 'Your identity is ready. Checking peer network configuration…'
            : peerDiscoveryConfigured
              ? 'Your identity is ready. The app will look for peers when it opens.'
              : 'Your identity is ready. Add a peer relay in Settings or connect to an XMPP server to get started.'}
        </p>

        <div className="bg-card rounded-xl p-6 w-full max-w-sm mt-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-blue2 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-[17px] font-semibold text-foreground mt-3">{displayName}</div>
            <div className="text-[12px] text-muted-foreground font-mono mt-0.5">@{handle}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Profile handle</div>
            <div className="flex items-center gap-3 mt-4">
              <span className="bg-green2 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-accent">
                Identity ready
              </span>
              <span className="text-[11px] text-muted-foreground">
                {peerDiscoveryConfigured === null ? 'Checking peer network…' : peerDiscoveryConfigured ? 'Peer discovery starts on open' : 'No peer relay configured'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[11px] text-destructive mt-3 text-center">{error}</p>
        )}
      </main>

      <div className="flex-shrink-0 px-4 pb-4">
        <button
          onClick={handleOpen}
          disabled={starting}
          className="w-full bg-primary text-primary-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {starting ? (
            <><Loader size={16} className="animate-spin" /> Starting…</>
          ) : (
            'Open Nexus'
          )}
        </button>
      </div>
    </div>
  )
}
