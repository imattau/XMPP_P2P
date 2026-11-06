import { useEffect, useRef, useState } from 'react'
import type { TouchEventHandler } from 'react'
import { RefreshCw } from 'lucide-react'

const ARM_DISTANCE = 56
const MAX_DISTANCE = 72

export function usePullToRefresh(onRefresh: () => Promise<unknown>, disabled = false) {
  const startY = useRef<number | null>(null)
  const distanceRef = useRef(0)
  const refreshRef = useRef(onRefresh)
  const refreshingRef = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])

  const reset = () => {
    startY.current = null
    distanceRef.current = 0
    setPullDistance(0)
  }

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (disabled || refreshingRef.current || event.touches.length !== 1 || event.currentTarget.scrollTop > 0) {
      reset()
      return
    }
    const target = event.target
    if (target instanceof Element && target.closest('button, input, textarea, select, summary, [role="button"]')) {
      reset()
      return
    }
    startY.current = event.touches[0].clientY
  }

  const onTouchMove: TouchEventHandler<HTMLElement> = (event) => {
    if (startY.current === null || event.touches.length !== 1) return
    const delta = event.touches[0].clientY - startY.current
    if (delta <= 0) {
      reset()
      return
    }
    const distance = Math.min(MAX_DISTANCE, delta * 0.65)
    distanceRef.current = distance
    setPullDistance(distance)
  }

  const onTouchEnd: TouchEventHandler<HTMLElement> = () => {
    const shouldRefresh = !disabled && !refreshingRef.current && distanceRef.current >= ARM_DISTANCE
    reset()
    if (!shouldRefresh) return
    refreshingRef.current = true
    setRefreshing(true)
    void refreshRef.current().catch(() => {}).finally(() => {
      refreshingRef.current = false
      setRefreshing(false)
    })
  }

  return {
    pullDistance,
    refreshing,
    ready: pullDistance >= ARM_DISTANCE,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  }
}

export function PullToRefreshIndicator({ pullDistance, refreshing, ready }: {
  pullDistance: number
  refreshing: boolean
  ready: boolean
}) {
  const visible = pullDistance > 0 || refreshing
  return (
    <div aria-live="polite" role={refreshing ? 'status' : undefined}
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center transition-opacity ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ transform: `translateY(${refreshing ? 12 : Math.min(pullDistance, MAX_DISTANCE)}px)` }}>
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-md">
        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ready ? 'text-primary' : ''} />
        {refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
      </div>
    </div>
  )
}
