import type { FC } from 'react'

interface ProgressDotsProps {
  current: number
  total?: number
}

const ProgressDots: FC<ProgressDotsProps> = ({ current, total = 7 }) => (
  <div className="flex items-center gap-[10px]">
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        className={`h-1 rounded-full transition-colors ${
          i < current ? 'bg-primary' : 'bg-[#242B3A]'
        }`}
        style={{ width: 38 }}
      />
    ))}
  </div>
)

export default ProgressDots
