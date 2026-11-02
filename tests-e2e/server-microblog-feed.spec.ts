import { test, expect } from '@playwright/test'

test('reconnecting reloads followed XMPP microblogs into the feed', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Test User',
      handle: 'testuser',
      jid: 'testuser@p2p',
      recoveryPhrase: [],
      recoveryPhraseSaved: true,
      createdAt: new Date().toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    localStorage.setItem('xmpp-p2p:server-microblog-subscriptions:testuser%40p2p', JSON.stringify(['alice@example.org']))
    localStorage.setItem('xmpp-p2p:server-microblog-statuses:testuser%40p2p', JSON.stringify({ 'alice@example.org': 'subscribed' }))

    let connected = false
    const serverListeners: Array<(info: { status: string }) => void> = []
    const bridge = {
      getLocalJid: () => 'testuser@p2p',
      isServerConnected: () => connected,
      getConnectedPeers: () => [],
      getRosterEntries: async () => [{ jid: 'alice@example.org', name: 'Alice' }],
      getFeedPosts: async () => [],
      getCollectionPosts: async () => [],
      getAttachments: async () => [],
      getCollections: async () => [],
      refreshServerMicroblog: async (jid: string) => {
        const calls = (window as any).__microblogRefreshCalls ?? []
        calls.push(jid)
        ;(window as any).__microblogRefreshCalls = calls
        return 0
      },
      onConnectionChange: () => () => {},
      onServerConnection: (listener: (info: { status: string }) => void) => {
        serverListeners.push(listener)
        return () => {}
      },
      onServerRosterChange: () => () => {},
      onPresence: () => () => {},
      onMessage: () => () => {},
      onMucMessage: () => () => {},
      onFeedPost: () => () => {},
      onCollectionPost: () => () => {},
      onAttachmentSummary: () => () => {},
    }
    ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
    ;(window as any).__connectTestServer = () => {
      connected = true
      serverListeners.forEach((listener) => listener({ status: 'connected' }))
    }
  })

  await page.goto('http://localhost:4173/')
  await expect(page.getByRole('button', { name: /XMPP microblogs/ })).toBeVisible()
  await page.evaluate(() => (window as any).__connectTestServer())
  await expect.poll(() => page.evaluate(() => (window as any).__microblogRefreshCalls ?? [])).toEqual(['alice@example.org'])
})

test('Feed follows a server contact, loads its posts, and can unfollow it on mobile', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  try {
  await page.addInitScript(() => {
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Test User',
      handle: 'testuser',
      jid: 'testuser@p2p',
      recoveryPhrase: [],
      recoveryPhraseSaved: true,
      createdAt: new Date().toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))

    const feedListeners: Array<(post: any) => void> = []
    const bridge = {
      getLocalJid: () => 'testuser@p2p',
      isServerConnected: () => true,
      getConnectedPeers: () => [],
      getRosterEntries: async () => [{ jid: 'alice@example.org', name: 'Alice' }],
      getFeedPosts: async () => [],
      getCollectionPosts: async () => [],
      getAttachments: async () => [],
      getCollections: async () => [],
      subscribeServerMicroblog: async (jid: string) => {
        ;(window as any).__microblogSubscribeCalls = [...((window as any).__microblogSubscribeCalls ?? []), jid]
        return 'subscribed'
      },
      publishServerMicroblog: async () => 'published-item',
      unsubscribeServerMicroblog: async (jid: string) => {
        ;(window as any).__microblogUnsubscribeCalls = [...((window as any).__microblogUnsubscribeCalls ?? []), jid]
      },
      refreshServerMicroblog: async (jid: string) => {
        ;(window as any).__microblogRefreshCalls = [...((window as any).__microblogRefreshCalls ?? []), jid]
        feedListeners.forEach(listener => listener({
          id: 'alice@example.org:history-item-1',
          topic: 'xmpp-pep:alice@example.org',
          from: 'alice@example.org',
          author: 'Alice',
          title: 'A server microblog post',
          body: 'Loaded from Alice over XMPP PEP.',
          categories: ['XMPP'],
          publishedAt: new Date().toISOString(),
        }))
        return 1
      },
      onConnectionChange: () => () => {},
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
      onPresence: () => () => {},
      onMessage: () => () => {},
      onMucMessage: () => () => {},
      onFeedPost: (listener: (post: any) => void) => {
        feedListeners.push(listener)
        return () => {
          const index = feedListeners.indexOf(listener)
          if (index >= 0) feedListeners.splice(index, 1)
        }
      },
      onCollectionPost: () => () => {},
      onAttachmentSummary: () => () => {},
    }
    ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
  })

  await page.goto('http://localhost:4173/')
  const microblogs = page.getByRole('button', { name: /^XMPP microblogs 0 followed$/ })
  await microblogs.click()
  const contactJid = page.locator('#server-microblogs-panel').getByText('alice@example.org')
  const row = contactJid.locator('..').locator('..')
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  const smallActionTargets = async () => page.locator('#server-microblogs-panel button:visible').evaluateAll(buttons => buttons
    .filter(button => button.getBoundingClientRect().height < 44)
    .map(button => ({
      label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      height: Math.round(button.getBoundingClientRect().height),
    })))
  expect(await smallActionTargets()).toEqual([])
  await expect(row.getByRole('button', { name: 'Follow', exact: true })).toBeEnabled()
  await row.getByRole('button', { name: 'Follow', exact: true }).click()

  await expect.poll(() => page.evaluate(() => (window as any).__microblogSubscribeCalls ?? [])).toEqual(['alice@example.org'])
  await expect.poll(() => page.evaluate(() => (window as any).__microblogRefreshCalls ?? [])).toEqual(['alice@example.org'])
  await expect(page.getByText('Loaded from Alice over XMPP PEP.')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
  expect(await smallActionTargets()).toEqual([])
  await row.getByRole('button', { name: 'Unfollow', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__microblogUnsubscribeCalls ?? [])).toEqual(['alice@example.org'])
  await expect(row.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
  expect(await smallActionTargets()).toEqual([])
  } finally {
    await context.close()
  }
})
