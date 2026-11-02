import type { FC } from 'react'

interface ProgressDotsProps {
  current: number
  total?: number
}

const ProgressDots: FC<ProgressDotsProps> = ({ current, total = 7 }) => (
  <div
    role="progressbar"
    aria-label="Onboarding progress"
    aria-valuemin={1}
    aria-valuemax={total}
    aria-valuenow={current}
    aria-valuetext={`Step ${current} of ${total}`}
    className="flex w-full items-center gap-3"
  >
    <div aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-[10px]">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 min-w-0 max-w-[38px] flex-1 rounded-full transition-colors ${
            i < current ? 'bg-primary' : 'bg-[#242B3A]'
          }`}
        />
      ))}
    </div>
    <span aria-hidden="true" className="shrink-0 text-[11px] text-muted-foreground">
      Step {current} of {total}
    </span>
  </div>
)

export default ProgressDots
