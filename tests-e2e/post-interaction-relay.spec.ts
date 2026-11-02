import { test, expect } from '@playwright/test'
import { createP2PNode } from '../src/core/p2p.js'

test('post detail actions work on mobile and publish a reply through a localhost relay', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  const relay = await createP2PNode(0, { enableMdns: false, enableDht: true, enableRelay: true, host: '127.0.0.1' })
  await relay.start()
  const bootstrapAddr = relay.getMultiaddrs().find((address: any) => address.toString().includes('/ws'))?.toString()
  expect(bootstrapAddr).toBeTruthy()
  const receivedPayloads: string[] = []
  let feedTopic = ''
  const onMessage = (event: any) => {
    if (event.detail.topic === feedTopic) receivedPayloads.push(new TextDecoder().decode(event.detail.data))
  }

  try {
    await page.addInitScript((address) => {
      localStorage.setItem('xmpp-p2p:bootstrap-addrs', JSON.stringify([address]))
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
        displayName: 'Post Relay Author',
        handle: 'post-relay-author',
        jid: 'post-relay-author@p2p',
        recoveryPhrase: [],
        recoveryPhraseSaved: true,
        createdAt: new Date().toISOString(),
      }))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, bootstrapAddr!)
    await page.goto('http://localhost:4173/')
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await page.waitForFunction(() => Boolean((window as any).__XMPP_P2P_BRIDGE__?.getLocalJid?.()), undefined, { timeout: 20000 })
    const peerJid = await page.evaluate(() => (window as any).__XMPP_P2P_BRIDGE__.getLocalJid() as string)
    feedTopic = `xmpp-feed:${peerJid.split('@')[0]}`
    const pubsub = relay.services.pubsub
    pubsub.addEventListener('message', onMessage)
    await pubsub.subscribe(feedTopic)
    await expect.poll(() => relay.getConnections().length, { timeout: 10000 }).toBeGreaterThan(0)

    const body = `Post detail relay check ${Date.now()}`
    await page.getByLabel('Write a post').fill(body)
    await page.getByRole('button', { name: 'Post', exact: true }).last().click()
    const postCard = page.locator('article').filter({ hasText: body })
    await expect(postCard).toBeVisible()
    await expect.poll(() => receivedPayloads.some((payload) => payload.includes(body))).toBe(true)
    await postCard.getByRole('button', { name: 'Comments' }).click()
    await expect(page).toHaveURL(/\/post\//)
    await expect(page.getByText(body, { exact: true })).toBeVisible()
    const smallPostButtons = await page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))
    expect(smallPostButtons).toEqual([])

    const likeButton = page.getByRole('button', { name: 'Like post' })
    await likeButton.click()
    await expect(page.getByRole('button', { name: 'Post already liked' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Repost', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Post already reposted' })).toBeDisabled()

    await page.getByRole('button', { name: 'Bookmark post' }).click()
    await expect(page.getByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true')

    const reply = `Reply via P2P relay ${Date.now()}`
    await page.getByLabel(/Reply to @/).fill(reply)
    await page.getByRole('button', { name: 'Reply', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Reply published' })).toBeVisible()
    await expect(page.getByText(reply, { exact: true })).toBeVisible()
    await expect.poll(() => receivedPayloads.some((payload) => payload.includes(reply))).toBe(true)
    const replyPayload = receivedPayloads.find((payload) => payload.includes(reply)) ?? ''
    expect(replyPayload).toContain('in-reply-to')
  } finally {
    relay.services.pubsub.removeEventListener('message', onMessage)
    await relay.stop()
    await context.close()
  }
})
