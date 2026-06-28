import * as React from 'react'
import { useNavigate } from 'react-router'
import {
  Bell, Lock, Moon, LogOut, ChevronRight, ArrowLeft, Zap,
} from 'lucide-react'

export default function SettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0 flex items-center gap-3 px-4 py-2.5">
        <button onClick={() => navigate(-1)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Settings</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="border-b border-border bg-card">
          {[
            { icon: Bell, label: 'Notifications' },
            { icon: Lock, label: 'Privacy & security' },
            { icon: Moon, label: 'Appearance' },
          ].map(({ icon: Icon, label }) => (
            <button key={label}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 transition-colors hover:bg-secondary text-left text-foreground/80">
              <Icon size={16} />
              <span className="text-sm">{label}</span>
              <ChevronRight size={14} className="ml-auto text-muted-foreground/40" />
            </button>
          ))}
        </div>

        <div className="mt-4 px-4">
          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border transition-colors hover:bg-destructive/10 text-destructive text-left"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </main>
    </div>
  )
}
