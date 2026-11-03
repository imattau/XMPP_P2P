import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Zap, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex min-h-60 flex-col items-center justify-center gap-4 px-6 sm:min-h-[400px]">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Zap size={24} className="text-destructive" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-foreground mb-1">Something went wrong</h2>
            <p className="max-w-sm text-sm text-muted-foreground">Reload the app to continue.</p>
          </div>
          {this.state.error?.message && (
            <details className="max-w-sm text-center">
              <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">Technical details</summary>
              <p className="break-words rounded-lg bg-secondary px-3 py-2 text-left text-xs text-muted-foreground">{this.state.error.message}</p>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-mono text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw size={14} />
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
