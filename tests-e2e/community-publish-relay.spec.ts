import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'

test('community composer publishes a post through a localhost P2P relay', async ({ page }) => {
  const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
  await relay.start()
  const bootstrapAddr = relay.getMultiaddrs().find((address: any) => address.toString().includes('/ws'))?.toString()
  expect(bootstrapAddr).toBeTruthy()

  const communityId = `relay-community-${Date.now()}`
  const communityTopic = `xmpp-collection:${communityId}`
  const pubsub = relay.services.pubsub
  let resolvePublishedItem!: (payload: string) => void
  const publishedItem = new Promise<string>((resolve) => { resolvePublishedItem = resolve })
  const onMessage = (event: any) => {
    if (event.detail.topic !== communityTopic) return
    const payload = new TextDecoder().decode(event.detail.data)
    if (!payload.includes('Community relay post check')) return
    resolvePublishedItem(payload)
  }

  try {
    await page.addInitScript((address) => {
      localStorage.setItem('xmpp-p2p:bootstrap-addrs', JSON.stringify([address]))
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
        displayName: 'Community Relay Author',
        handle: 'community-relay-author',
        jid: 'community-relay-author@p2p',
        recoveryPhrase: [],
        recoveryPhraseSaved: true,
        createdAt: new Date().toISOString(),
      }))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, bootstrapAddr!)

    await page.goto('http://localhost:4173/communities/new')
    await page.waitForFunction(() => Boolean((window as any).__XMPP_P2P_BRIDGE__?.getLocalJid?.()), undefined, { timeout: 20000 })
    await expect.poll(() => relay.getConnections().length, { timeout: 10000 }).toBeGreaterThan(0)
    pubsub.addEventListener('message', onMessage)
    await pubsub.subscribe(communityTopic)

    await page.getByLabel('Community name').fill('Relay Community')
    await page.getByLabel('Community ID').fill(communityId)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]collection=${communityId}$`))
    await expect(page.getByLabel(`Post to ${communityId}`)).toBeVisible()

    await page.getByLabel(`Post to ${communityId}`).fill('Community relay post check')
    await page.getByRole('button', { name: 'Post', exact: true }).last().click()

    const payload = await publishedItem
    expect(payload).toContain(communityId)
    expect(payload).toContain('Community relay post check')
    await expect(page.locator('article').filter({ hasText: 'Community relay post check' })).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: 'Post published' })).toBeVisible()
  } finally {
    pubsub.removeEventListener('message', onMessage)
    await relay.stop()
  }
})
