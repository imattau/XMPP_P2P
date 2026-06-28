import * as React from 'react'
import { useNavigate } from 'react-router'
import { Key, Shield, Rss } from 'lucide-react'

export default function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-md mx-auto w-full px-4 pb-8 pt-12 flex flex-col items-center min-h-full">
        <div className="w-[140px] h-[140px] bg-blue2 rounded-3xl flex items-center justify-center flex-shrink-0">
          <span className="text-[52px] font-bold text-primary">N</span>
        </div>

        <h1 className="text-[25px] font-semibold text-foreground leading-tight mt-10 text-center">
          Private messaging, without a central server
        </h1>
        <p className="text-body text-muted-foreground mt-2 text-center leading-relaxed max-w-xs">
          Own your identity, communicate directly and join communities across the peer network.
        </p>

        <div className="w-full mt-8 space-y-3">
          {[
            { icon: Key, title: 'Own your identity', desc: 'Your address and keys are created locally.' },
            { icon: Shield, title: 'End-to-end encrypted', desc: 'OMEMO protects direct and group conversations.' },
            { icon: Rss, title: 'Feeds and communities', desc: 'Follow topics and join group discussions.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card rounded-xl p-4 flex items-start gap-3">
              <div className="w-[42px] h-[42px] bg-blue2 rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{title}</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="w-full mt-auto pt-8 space-y-3">
          <button
            onClick={() => navigate('/onboarding/create')}
            className="w-full bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
          >
            Create new identity
          </button>
          <button
            onClick={() => navigate('/onboarding/import')}
            className="w-full bg-secondary text-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
          >
            Import existing identity
          </button>
        </div>
      </div>
    </div>
  )
}
