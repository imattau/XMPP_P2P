import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'

test('article composer publishes its encoded article through a localhost P2P relay', async ({ page }) => {
  const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
  await relay.start()
  const bootstrapAddr = relay.getMultiaddrs().find((address: any) => address.toString().includes('/ws'))?.toString()
  expect(bootstrapAddr).toBeTruthy()
  const pubsub = relay.services.pubsub
  let feedTopic = ''
  const onMessage = (event: any) => {
    if (event.detail.topic !== feedTopic) return
    const payload = new TextDecoder().decode(event.detail.data)
    if (!payload.includes('nexus-article:v1')) return
    resolvePublishedPayload(payload)
  }
  let resolvePublishedPayload!: (payload: string) => void
  const publishedPayload = new Promise<string>((resolve) => { resolvePublishedPayload = resolve })

  try {
    await page.addInitScript((address) => {
      localStorage.setItem('xmpp-p2p:bootstrap-addrs', JSON.stringify([address]))
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
        displayName: 'Local Relay Author',
        handle: 'local-relay-author',
        jid: 'local-relay-author@p2p',
        recoveryPhrase: [],
        recoveryPhraseSaved: true,
        createdAt: new Date().toISOString(),
      }))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, bootstrapAddr!)
    await page.goto('http://localhost:4173/compose')
    await page.waitForFunction(() => Boolean((window as any).__XMPP_P2P_BRIDGE__?.getLocalJid?.()), undefined, { timeout: 20000 })
    const peerJid = await page.evaluate(() => (window as any).__XMPP_P2P_BRIDGE__.getLocalJid() as string)
    feedTopic = `xmpp-feed:${peerJid.split('@')[0]}`
    pubsub.addEventListener('message', onMessage)
    await pubsub.subscribe(feedTopic)

    await expect.poll(() => relay.getConnections().length, { timeout: 10000 }).toBeGreaterThan(0)
    await page.getByLabel('Article title').fill('Article relay check')
    await page.getByLabel('Paragraph text').fill('Published through a local relay.')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByRole('button', { name: '#P2P', exact: true }).click()
    await page.getByRole('button', { name: 'Publish now', exact: true }).click()

    await expect(page).toHaveURL(/\/article\//)
    await expect(page.getByRole('heading', { name: 'Article relay check' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Heading', exact: true })).toHaveCount(0)
    await expect(page.getByText('Paragraph', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Published through a local relay.')).toBeVisible()
    const payload = await publishedPayload
    expect(payload).toContain('Published through a local relay.')
    expect(payload).toContain('Article relay check')

    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Feed' }).click()
    const feedCard = page.locator('article').filter({ hasText: 'Article relay check' })
    await expect(feedCard).toHaveCount(1)
    await expect(feedCard.locator('p').filter({ hasText: 'Published through a local relay.' })).toHaveCount(1)

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:4173/topics')
    await expect(page.getByRole('button', { name: 'Article relay check' })).toBeVisible()
    const smallTopicButtons = await page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))
    expect(smallTopicButtons).toEqual([])
    await page.goto('http://localhost:4173/topics/P2P')
    await expect(page.getByRole('button', { name: 'Article relay check' })).toBeVisible()
    await expect(page.getByText('No articles in this topic yet')).toHaveCount(0)
    const smallTopicDetailButtons = await page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))
    expect(smallTopicDetailButtons).toEqual([])

    await page.goto('http://localhost:4173/drafts')
    await expect(page.getByText('No drafts yet')).toBeVisible()
  } finally {
    pubsub.removeEventListener('message', onMessage)
    await relay.stop()
  }
})
