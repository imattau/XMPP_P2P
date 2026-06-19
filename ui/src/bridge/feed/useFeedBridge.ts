import { useEffect, useMemo, useState } from 'react'
import { getBrowserXmppBridge } from '../runtime'
import type { FeedViewState } from './types'
import { FeedBridgeController } from './controller'

export function useFeedBridge() {
  const controller = useMemo(() => new FeedBridgeController(getBrowserXmppBridge()), [])
  const [state, setState] = useState<FeedViewState>(controller.getState())

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    void controller.refresh()
    return unsubscribe
  }, [controller])

  return {
    ...state,
    filteredPosts: controller.getFilteredPosts(),
    setActiveFilter: (activeFilter: FeedViewState['activeFilter']) => controller.setActiveFilter(activeFilter),
    setSearchOpen: (searchOpen: boolean) => controller.setSearchOpen(searchOpen),
    setSearchQuery: (searchQuery: string) => controller.setSearchQuery(searchQuery),
    refresh: () => controller.refresh(),
    likePost: (id: string) => controller.likePost(id),
    reactPost: (id: string, emoji?: string) => controller.reactPost(id, emoji),
    bookmarkPost: (id: string) => controller.bookmarkPost(id)
  }
}
