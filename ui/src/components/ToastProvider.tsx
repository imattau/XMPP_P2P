import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info, Zap } from 'lucide-react'
import { onToast } from '../lib/toast-events'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  useEffect(() => {
    const unsub = onToast((message, type) => {
      showToast(message, type)
    })
    return () => { unsub() }
  }, [showToast])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-sm max-w-sm animate-in slide-in-from-right ${
              toast.type === 'error'
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : toast.type === 'success'
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-card border-border text-foreground'
            }`}
            style={{ animation: 'slideIn 0.2s ease-out' }}
          >
            {toast.type === 'error' ? (
              <AlertCircle size={15} className="flex-shrink-0" />
            ) : toast.type === 'success' ? (
              <CheckCircle size={15} className="flex-shrink-0" />
            ) : (
              <Info size={15} className="flex-shrink-0" />
            )}
            <span className="flex-1 min-w-0 text-[13px] leading-tight">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
