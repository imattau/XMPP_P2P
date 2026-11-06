import { getBrowserXmppBridge } from './runtime'

/** Refresh reachable external feed sources before reloading the local feed view. */
export async function refreshExternalFeeds(): Promise<void> {
  const bridge = getBrowserXmppBridge()
  if (!bridge) return

  const [rssSources, followedSources] = await Promise.all([
    bridge.getRssFeeds?.().catch(() => []) ?? Promise.resolve([]),
    bridge.getFollowedFeedSources?.().catch(() => []) ?? Promise.resolve([]),
  ])
  const refreshes: Promise<unknown>[] = []

  if (bridge.refreshRssFeed) {
    for (const source of rssSources) {
      if (source.status !== 'paused') refreshes.push(bridge.refreshRssFeed(source.id))
    }
  }
  if (bridge.refreshServerMicroblog) {
    for (const source of followedSources) {
      if (source.protocol === 'xmpp' && source.status !== 'pending') {
        refreshes.push(bridge.refreshServerMicroblog(source.owner))
      }
    }
  }

  await Promise.allSettled(refreshes)
}
