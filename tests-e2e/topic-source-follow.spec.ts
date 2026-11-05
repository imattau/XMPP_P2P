import { test, expect } from '@playwright/test'

test('Topics discover P2P and XMPP sources and follow each author feed', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString()
    const posts = [
      {
        id: 'peer-abc:topic-post',
        topic: 'xmpp-feed:peer-abc',
        from: 'peer-abc@p2p',
        author: 'P2P Author',
        body: 'A post from the peer network',
        categories: ['Mesh'],
        publishedAt: now,
        updatedAt: now,
        receivedAt: now,
      },
      {
        id: 'alice@example.org:topic-post',
        topic: 'xmpp-pep:alice@example.org',
        from: 'alice@example.org',
        author: 'Alice XMPP',
        body: 'A post from an XMPP PubSub feed',
        categories: ['Mesh'],
        publishedAt: now,
        updatedAt: now,
        receivedAt: now,
      },
    ]
    const followedKey = 'e2e:followed-feed-sources'
    const readFollowed = () => {
      try { return JSON.parse(localStorage.getItem(followedKey) || '[]') as Array<any> } catch { return [] }
    }
    const writeFollowed = (sources: Array<any>) => localStorage.setItem(followedKey, JSON.stringify(sources))
    const bridge = {
      getLocalJid: () => 'reader@p2p',
      getServerJid: () => 'reader@example.org',
      getConnectedPeers: () => [],
      getFeedPosts: async () => posts,
      getCollectionPosts: async () => [],
      getAttachments: async () => [],
      getCollections: async () => [],
      getFeedSubscriptions: async () => readFollowed()
        .filter((source) => source.protocol === 'p2p')
        .map((source) => ({ peerId: source.owner, jid: `${source.owner}@p2p`, topic: `xmpp-feed:${source.owner}`, subscribedAt: now, updatedAt: now, visibility: 'private' })),
      getServerMicroblogSubscriptions: async () => readFollowed()
        .filter((source) => source.protocol === 'xmpp')
        .map((source) => ({ jid: source.owner, node: 'urn:xmpp:microblog:0', status: 'subscribed', updatedAt: now })),
      getFollowedFeedSources: async () => readFollowed(),
      followFeedSource: async (source: { protocol: 'p2p' | 'xmpp'; owner: string }) => {
        const status = source.protocol === 'xmpp' ? 'pending' : 'subscribed'
        const next = readFollowed()
        if (!next.some((item) => item.protocol === source.protocol && item.owner === source.owner)) {
          next.push({ id: `${source.protocol}:${source.owner}`, ...source, node: source.protocol === 'p2p' ? `xmpp-feed:${source.owner}` : 'urn:xmpp:microblog:0', status, updatedAt: now })
          writeFollowed(next)
        }
        const calls = (window as any).__followCalls || []
        calls.push(source)
        ;(window as any).__followCalls = calls
        return status
      },
      unfollowFeedSource: async (source: { protocol: 'p2p' | 'xmpp'; owner: string }) => {
        writeFollowed(readFollowed().filter((item) => item.protocol !== source.protocol || item.owner !== source.owner))
        const calls = (window as any).__unfollowCalls || []
        calls.push(source)
        ;(window as any).__unfollowCalls = calls
      },
      isServerConnected: () => true,
      isComponentConnected: () => false,
      getServerStatus: () => ({ online: true, connections: [{ type: 'client', domain: 'example.org', status: 'connected' }] }),
      getServerConnections: () => [{ type: 'client', domain: 'example.org', status: 'connected' }],
      getRosterEntries: async () => [],
      getVCard: async () => ({ fn: 'Reader' }),
      broadcastPresence: async () => {},
      getBootstrapAddrs: async () => [],
      getLocalPeerAddresses: () => [],
      onConnectionChange: () => () => {},
      onFeedPost: () => () => {},
      onCollectionPost: () => () => {},
      onAttachmentSummary: () => () => {},
      onPresence: () => () => {},
      onMessage: () => () => {},
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
      onServerPresenceSubscriptionRequest: () => () => {},
      onMucMessage: () => () => {},
      onMucJoin: () => () => {},
      onMucLeave: () => () => {},
      onMucError: () => () => {},
      onMucChatState: () => () => {},
      onMucMarker: () => () => {},
      listSavedComponentConfigs: async () => [],
    }

    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Reader',
      handle: 'reader',
      jid: 'reader@p2p',
      recoveryPhrase: [],
      recoveryPhraseSaved: true,
      createdAt: now,
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: now }))
    ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
  })

  await page.goto('http://localhost:4173/topics')
  const directory = page.getByRole('region', { name: 'Discover topics' })
  await expect(directory.getByText('Mesh', { exact: true })).toBeVisible()
  await expect(directory.getByText('1 P2P')).toBeVisible()
  await expect(directory.getByText('1 XMPP')).toBeVisible()

  const topicFollow = directory.getByRole('button', { name: 'Follow Mesh' })
  await topicFollow.click()
  await expect(directory.getByRole('button', { name: 'Unfollow Mesh' })).toHaveAttribute('aria-pressed', 'true')

  await directory.getByRole('button', { name: 'Open topic Mesh' }).click()
  await expect(page).toHaveURL(/\/?q=Mesh$/)
  await page.getByRole('link', { name: 'Open post by P2P Author' }).click()
  await expect(page.getByText('A post from the peer network')).toBeVisible()
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => (window as any).__followCalls)).toContainEqual({ protocol: 'p2p', owner: 'peer-abc' })

  await page.goto('http://localhost:4173/topics')
  await page.getByRole('button', { name: 'Open topic Mesh' }).click()
  await page.getByRole('link', { name: 'Open post by Alice XMPP' }).click()
  await expect(page.getByText('A post from an XMPP PubSub feed')).toBeVisible()
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Requested', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').getByText('Subscription request sent; waiting for approval.')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).__followCalls)).toContainEqual({ protocol: 'xmpp', owner: 'alice@example.org' })

  await page.reload()
  await expect(page.getByRole('button', { name: 'Requested', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
