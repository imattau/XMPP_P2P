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
          <h1 className="text-heading font-semibold text-foreground">Setup complete</h1>
        </div>
        <div className="mt-3">
          <ProgressDots current={6} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col items-center pt-5 sm:pt-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green2 sm:h-[140px] sm:w-[140px]">
          <Check size={36} className="text-accent sm:h-12 sm:w-12" />
        </div>

        <h2 className="mt-4 break-words text-[22px] font-semibold text-foreground text-center sm:mt-6 sm:text-[25px]">
          You’re ready, {displayName}
        </h2>
        <p className="text-body text-muted-foreground text-center max-w-xs mt-2 leading-relaxed">
          {peerDiscoveryConfigured === null
            ? 'Checking peer network configuration…'
            : peerDiscoveryConfigured
              ? 'Peer discovery will start when Nexus opens.'
              : 'Add a peer relay in Settings or connect to an XMPP server to find people.'}
        </p>

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
