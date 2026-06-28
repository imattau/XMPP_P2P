import { useNavigate } from 'react-router'
import { TrendingUp } from 'lucide-react'
import type { TrendingTopic } from '../bridge/feed/types'

export default function TrendingTopics({ topics }: { topics: TrendingTopic[] }) {
  const navigate = useNavigate()

  return (
    <div className="w-72 border-l border-border bg-card flex-shrink-0 h-full overflow-y-auto p-5 hidden lg:block">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Trending topics</span>
      </div>

      <div className="space-y-1">
        {topics.map((topic) => (
          <button
            key={topic.tag}
            onClick={() => navigate(`/topics/${topic.tag}`)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-left"
          >
            <span className="text-sm font-mono font-medium text-foreground">#{topic.tag}</span>
            <span className="text-[11px] font-mono text-muted-foreground">{topic.count} posts</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate('/topics')}
        className="mt-3 w-full text-center text-[11px] font-mono text-primary hover:underline"
      >
        View all topics →
      </button>
    </div>
  )
}
