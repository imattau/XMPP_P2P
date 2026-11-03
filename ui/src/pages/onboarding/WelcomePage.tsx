import * as React from 'react'
import { useNavigate } from 'react-router'
import { Key, Shield, Rss } from 'lucide-react'

export default function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center overflow-y-auto px-4 pb-4 pt-6 sm:pt-12">
        <div className="my-auto flex w-full flex-col items-center">
          <div className="w-16 h-16 sm:w-[140px] sm:h-[140px] bg-blue2 rounded-2xl sm:rounded-3xl flex items-center justify-center flex-shrink-0">
            <span className="text-3xl sm:text-[52px] font-bold text-primary">N</span>
          </div>

          <h1 className="text-[21px] sm:text-[25px] font-semibold text-foreground leading-tight mt-4 sm:mt-10 text-center">
            Private messaging, without a central server
          </h1>
          <p className="text-[13px] sm:text-body text-muted-foreground mt-1.5 sm:mt-2 text-center leading-snug sm:leading-relaxed max-w-xs">
            Own your identity, communicate directly and join communities across the peer network.
          </p>

          <div className="w-full mt-3 sm:mt-8 space-y-1.5 sm:space-y-3">
            {[
              { icon: Key, title: 'Own your identity', desc: 'Your address and keys are created locally.' },
              { icon: Shield, title: 'Optional OMEMO encryption', desc: 'Secure chats and rooms use OMEMO and never fall back to plaintext.' },
              { icon: Rss, title: 'Feeds and communities', desc: 'Follow topics and join group discussions.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card rounded-xl p-2.5 sm:p-4 flex items-start gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-[42px] sm:h-[42px] bg-blue2 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug sm:leading-relaxed mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md flex-shrink-0 space-y-2 bg-background px-4 pb-6 pt-3 sm:space-y-3 sm:pb-8 sm:pt-4">
        <button
          onClick={() => navigate('/onboarding/create')}
          className="w-full bg-primary text-primary-foreground rounded-xl h-11 sm:h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Create new identity
        </button>
        <button
          onClick={() => navigate('/onboarding/import')}
          className="w-full bg-secondary text-foreground rounded-xl h-11 sm:h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Import existing identity
        </button>
      </footer>
    </div>
  )
}
