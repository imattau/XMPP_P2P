import * as React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
import ProgressDots from '../../components/onboarding/ProgressDots'

const SUGGESTIONS = [
  { type: 'person', name: 'Maren Holdt', meta: 'Mutual contacts', action: 'Add', highlighted: false },
  { type: 'person', name: 'Protocol Working Group', meta: 'Mutual contacts', action: 'Add', highlighted: false },
  { type: 'community', name: '#xmpp', meta: 'Community · 194 active peers', action: 'Join', highlighted: true },
  { type: 'community', name: '#privacy', meta: 'Community · 231 active peers', action: 'Join', highlighted: false },
]

export default function FindNetworkPage() {
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="mt-1">
          <h1 className="text-heading font-semibold text-foreground">Find your network</h1>
          <p className="text-[12px] text-muted-foreground">People, communities and nearby peers</p>
        </div>
        <div className="mt-3">
          <ProgressDots current={4} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        <div className="bg-secondary rounded-xl h-[48px] flex items-center px-4 gap-2">
          <Search size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search handles, JIDs or communities"
            className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {SUGGESTIONS.map((s, i) => (
          <div key={i} className="bg-card rounded-xl px-4 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{s.name}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.meta}</div>
            </div>
            <button
              className={`rounded-lg px-4 py-1.5 text-[11px] font-semibold transition-colors ${
                s.highlighted
                  ? 'bg-blue2 text-primary hover:bg-blue2/80'
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >
              {s.action}
            </button>
          </div>
        ))}
      </main>

      <div className="flex-shrink-0 px-4 pb-4 flex gap-3">
        <button
          onClick={() => navigate('/onboarding/preferences')}
          className="flex-1 bg-primary text-white rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Continue
        </button>
        <button
          onClick={() => navigate('/onboarding/preferences')}
          className="w-[78px] bg-secondary text-foreground rounded-xl h-[50px] font-semibold text-sm transition-opacity hover:opacity-90"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
