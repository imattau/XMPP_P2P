import { useNavigate } from 'react-router'
import { ArrowLeft, Home } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">404 · Page not found</p>
      <h1 className="text-xl font-semibold text-foreground">This page isn’t here</h1>
      <p className="max-w-sm text-sm text-muted-foreground">The link may be out of date, or the page may have moved.</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => navigate(-1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
          <ArrowLeft size={14} /> Go back
        </button>
        <button onClick={() => navigate('/')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Home size={14} /> Go to feed
        </button>
      </div>
    </main>
  )
}
