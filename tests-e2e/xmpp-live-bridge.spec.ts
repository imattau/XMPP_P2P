import { test, expect } from '@playwright/test'

const jid = process.env.XMPP_TEST_JID
const password = process.env.XMPP_TEST_PASSWORD
const peerJid = process.env.XMPP_TEST_PEER_JID
const peerPassword = process.env.XMPP_TEST_PEER_PASSWORD
const service = process.env.XMPP_TEST_SERVICE
const serviceHost = (() => {
  try { return new URL(service ?? '').hostname.toLowerCase() } catch { return '' }
})()
const localTestEndpoint = serviceHost === 'localhost'
  || serviceHost.endsWith('.localhost')
  || serviceHost === '[::1]'
  || /^127(?:\.\d{1,3}){3}$/.test(serviceHost)

test.use({ ignoreHTTPSErrors: localTestEndpoint })

async function connectAccount(page: import('@playwright/test').Page, accountJid: string, secret: string, endpoint: string) {
  await page.goto('http://localhost:4173/settings')
  await page.getByRole('button', { name: 'Connect to XMPP server' }).click()
  await page.getByLabel('XMPP account JID').fill(accountJid)
  await page.getByLabel('XMPP account password').fill(secret)
  await page.getByLabel('XMPP server WebSocket URL (optional)').fill(endpoint)
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByText(accountJid.split('@')[1], { exact: true })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 20000 })
}

test('browser Settings connects and disconnects against a real XMPP WebSocket server', async ({ page }) => {
  test.skip(!jid || !password || !service, 'Set XMPP_TEST_JID, XMPP_TEST_PASSWORD, and XMPP_TEST_SERVICE to run the real-server check.')

  await page.addInitScript(() => {
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
      displayName: 'Local XMPP Test',
      handle: 'local-xmpp-test',
      jid: 'local-xmpp-test@p2p',
      recoveryPhrase: [],
      recoveryPhraseSaved: true,
      createdAt: new Date().toISOString(),
    }))
    localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
  })

  await connectAccount(page, jid!, password!, service!)
  const domain = jid!.split('@')[1]
  await expect(page.getByRole('status').filter({ hasText: 'Online — 1 server' })).toBeVisible()

  await page.getByRole('button', { name: `Disconnect from ${domain}` }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Disconnected' })).toBeVisible()
})

test('browser bridges exchange a direct message through a real XMPP server', async ({ browser }) => {
  test.skip(!jid || !password || !peerJid || !peerPassword || !service,
    'Set the primary and peer XMPP JIDs/passwords plus XMPP_TEST_SERVICE to run the two-account real-server check.')
  test.skip(jid!.toLowerCase() === peerJid!.toLowerCase(), 'The direct-message check requires two distinct XMPP accounts.')

  const senderJid = jid!
  const receiverJid = peerJid!
  const senderContext = await browser.newContext({ ignoreHTTPSErrors: localTestEndpoint })
  const receiverContext = await browser.newContext({ ignoreHTTPSErrors: localTestEndpoint })
  const senderPage = await senderContext.newPage()
  const receiverPage = await receiverContext.newPage()

  const prepareIdentity = (name: string, handle: string, localJid: string) => ({
    displayName: name,
    handle,
    jid: localJid,
    recoveryPhrase: [],
    recoveryPhraseSaved: true,
    createdAt: new Date().toISOString(),
  })

  try {
    await senderPage.addInitScript((identity) => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify(identity))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, prepareIdentity('XMPP Sender', 'xmpp-sender', 'xmpp-sender@p2p'))
    await receiverPage.addInitScript((identity) => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify(identity))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, prepareIdentity('XMPP Receiver', 'xmpp-receiver', 'xmpp-receiver@p2p'))

    await Promise.all([
      connectAccount(senderPage, senderJid, password!, service!),
      connectAccount(receiverPage, receiverJid, peerPassword!, service!),
    ])

    const body = `Real Prosody message ${Date.now()}`
    await receiverPage.evaluate((expectedBody) => {
      const bridge = (window as any).__XMPP_P2P_BRIDGE__
      ;(window as any).__incomingXMPPMessage = new Promise((resolve) => {
        const unsubscribe = bridge.onMessage((message: any) => {
          if (message.body !== expectedBody) return
          unsubscribe()
          resolve(message)
        })
      })
    }, body)
    await senderPage.evaluate(async ({ to, body }) => {
      const bridge = (window as any).__XMPP_P2P_BRIDGE__
      await bridge.sendChatMessage({ id: to, type: 'direct', name: 'Receiver', handle: to }, body)
    }, { to: receiverJid, body })

    const received = await receiverPage.evaluate(() => (window as any).__incomingXMPPMessage)
    expect(received.from.split('/')[0]).toBe(senderJid)
    expect(received.body).toBe(body)
  } finally {
    await senderContext.close()
    await receiverContext.close()
  }
})

test('browser UI joins an XMPP room and exchanges a group message', async ({ browser }) => {
  test.skip(!jid || !password || !peerJid || !peerPassword || !service,
    'Set the primary and peer XMPP JIDs/passwords plus XMPP_TEST_SERVICE to run the two-account real-server check.')
  test.skip(jid!.toLowerCase() === peerJid!.toLowerCase(), 'The room check requires two distinct XMPP accounts.')

  const senderJid = jid!
  const receiverJid = peerJid!
  const domain = jid!.split('@')[1]
  const senderContext = await browser.newContext({ ignoreHTTPSErrors: localTestEndpoint })
  const receiverContext = await browser.newContext({ ignoreHTTPSErrors: localTestEndpoint })
  const senderPage = await senderContext.newPage()
  const receiverPage = await receiverContext.newPage()
  const room = `ui-check-${Date.now()}@conference.${domain}`
  const roomName = room.split('@')[0]
  const message = `Real XMPP room message ${Date.now()}`

  const prepareIdentity = (name: string, handle: string, localJid: string) => ({
    displayName: name,
    handle,
    jid: localJid,
    recoveryPhrase: [],
    recoveryPhraseSaved: true,
    createdAt: new Date().toISOString(),
  })

  try {
    await senderPage.addInitScript((identity) => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify(identity))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, prepareIdentity('XMPP Room Sender', 'xmpp-room-sender', 'xmpp-room-sender@p2p'))
    await receiverPage.addInitScript((identity) => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify(identity))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, prepareIdentity('XMPP Room Receiver', 'xmpp-room-receiver', 'xmpp-room-receiver@p2p'))

    await Promise.all([
      connectAccount(senderPage, senderJid, password!, service!),
      connectAccount(receiverPage, receiverJid, peerPassword!, service!),
    ])

    for (const page of [senderPage, receiverPage]) {
      await page.evaluate(() => {
        const bridge = (window as any).__XMPP_P2P_BRIDGE__
        const events: { joins: any[]; errors: any[]; messages: any[] } = { joins: [], errors: [], messages: [] }
        bridge.onMucJoin((event: any) => events.joins.push(event))
        bridge.onMucError((event: any) => events.errors.push(event))
        bridge.onMucMessage((event: any) => events.messages.push(event))
        ;(window as any).__mucEvents = events
      })
    }

    const joinRoom = async (page: import('@playwright/test').Page) => {
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Chats' }).click()
      await page.getByRole('button', { name: 'New conversation' }).click()
      await page.getByRole('tab', { name: 'Channel' }).click()
      await page.getByLabel('P2P room ID or XMPP room JID').fill(room)
      await page.getByRole('button', { name: 'Join', exact: true }).click()
      await expect(page).toHaveURL(/\/chat\//)
      await expect(page.getByLabel(`Message ${roomName}`)).toBeVisible()
    }
    await joinRoom(receiverPage)
    await expect.poll(() => receiverPage.evaluate(() => (window as any).__mucEvents.joins.some((event: any) => event.fromSelf))).toBe(true)
    await joinRoom(senderPage)
    await expect.poll(() => receiverPage.evaluate((senderNick) => (window as any).__mucEvents.joins.some((event: any) => event.nick === senderNick), senderJid.split('@')[0])).toBe(true)

    const input = senderPage.getByLabel(`Message ${roomName}`)
    await input.fill(message)
    await receiverPage.evaluate((expectedBody) => { (window as any).__expectedMucMessage = expectedBody }, message)
    await input.press('Enter')
    await expect(senderPage.getByText(message, { exact: true })).toBeVisible()
    await expect.poll(() => receiverPage.evaluate(() => (window as any).__mucEvents.messages.some((event: any) => event.body === (window as any).__expectedMucMessage))).toBe(true)
    await expect(receiverPage.getByText(message, { exact: true })).toBeVisible({ timeout: 15000 })
  } finally {
    await senderContext.close()
    await receiverContext.close()
  }
})

test('Feed follows an XMPP microblog and displays live PEP posts', async ({ browser }) => {
  test.skip(!jid || !password || !peerJid || !peerPassword || !service,
    'Set the primary and peer XMPP JIDs/passwords plus XMPP_TEST_SERVICE to run the two-account real-server check.')
  test.skip(jid!.toLowerCase() === peerJid!.toLowerCase(), 'The PEP check requires two distinct XMPP accounts.')

  const senderJid = jid!
  const receiverJid = peerJid!
  const domain = senderJid.split('@')[1]
  const senderContext = await browser.newContext({ ignoreHTTPSErrors: localTestEndpoint })
  const receiverContext = await browser.newContext({ ignoreHTTPSErrors: localTestEndpoint })
  const senderPage = await senderContext.newPage()
  const receiverPage = await receiverContext.newPage()
  const node = 'urn:xmpp:microblog:0'
  const firstItemId = `feed-history-${Date.now()}`
  const liveItemId = `feed-live-${Date.now()}`
  const firstBody = `Local XMPP PEP history ${Date.now()}`
  const liveBody = `Local XMPP PEP live post ${Date.now()}`

  const prepareIdentity = (name: string, handle: string, localJid: string) => ({
    displayName: name,
    handle,
    jid: localJid,
    recoveryPhrase: [],
    recoveryPhraseSaved: true,
    createdAt: new Date().toISOString(),
  })

  const publishPepPost = async (itemId: string, body: string) => senderPage.evaluate(async ({ senderJid, node, itemId, body }) => {
    const clientBridge = (window as any).__XMPP_P2P_BRIDGE__.xmppNode.clientBridge
    const publishedAt = new Date().toISOString()
    const payload = {
      parent: null,
      write: (writer: (value: string) => void) => writer(
        `<entry xmlns="http://www.w3.org/2005/Atom"><id>${itemId}</id><title>${body}</title><content type="text">${body}</content><author><name>Local PEP Author</name></author><published>${publishedAt}</published><updated>${publishedAt}</updated></entry>`
      ),
    }
    await clientBridge.pubsubPublish(senderJid, node, itemId, payload)
    const items = await clientBridge.pubsubGetItems(senderJid, node, 20)
    if (!items.some((item: any) => item.attrs.id === itemId)) throw new Error('The XMPP server did not return the published PEP item.')
  }, { senderJid, node, itemId, body })

  try {
    await senderPage.addInitScript((identity) => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify(identity))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, prepareIdentity('XMPP PEP Author', 'xmpp-pep-author', 'xmpp-pep-author@p2p'))
    await receiverPage.addInitScript((identity) => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify(identity))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    }, prepareIdentity('XMPP PEP Reader', 'xmpp-pep-reader', 'xmpp-pep-reader@p2p'))

    await Promise.all([
      connectAccount(senderPage, senderJid, password!, service!),
      connectAccount(receiverPage, receiverJid, peerPassword!, service!),
    ])
    await senderPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Contacts' }).click()
    await publishPepPost(firstItemId, firstBody)
    await senderPage.evaluate(() => {
      ;(window as any).__incomingPresenceRequests = []
      ;(window as any).__XMPP_P2P_BRIDGE__.onServerPresenceSubscriptionRequest((request: { jid: string; server: string }) => {
        ;(window as any).__incomingPresenceRequests.push(request)
      })
    })
    const senderAlreadyHasContact = await senderPage.evaluate(async (contactJid) => {
      const bridge = (window as any).__XMPP_P2P_BRIDGE__
      const entries = await bridge.getRosterEntries()
      return entries.some((entry: any) => entry.jid.toLowerCase() === contactJid.toLowerCase())
    }, receiverJid)
    await receiverPage.evaluate(async (contactJid) => {
      const bridge = (window as any).__XMPP_P2P_BRIDGE__
      await bridge.addRosterEntry(contactJid, 'Local PEP Author')
    }, senderJid)
    if (!senderAlreadyHasContact) {
      await expect.poll(() => senderPage.evaluate(() => (window as any).__incomingPresenceRequests), { timeout: 10000 })
        .toContainEqual({ jid: receiverJid, server: domain })
      const contactRequest = senderPage.getByRole('region', { name: 'XMPP contact requests' })
      await expect(contactRequest.getByText(receiverJid, { exact: true })).toBeVisible({ timeout: 10000 })
      await contactRequest.getByRole('button', { name: 'Accept', exact: true }).click()
      await expect(senderPage.getByRole('status').filter({ hasText: `Approved ${receiverJid}'s XMPP contact request` })).toBeVisible()
      await expect(contactRequest).toHaveCount(0)
    }

    await receiverPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Feed' }).click()
    await receiverPage.getByRole('button', { name: /^XMPP microblogs \d+ followed$/ }).click()
    await expect(receiverPage.getByText(senderJid, { exact: true })).toBeVisible()
    await receiverPage.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(receiverPage.getByText(firstBody, { exact: true })).toBeVisible({ timeout: 15000 })

    await publishPepPost(liveItemId, liveBody)
    await expect(receiverPage.getByText(liveBody, { exact: true })).toBeVisible({ timeout: 15000 })

    const uiBody = `XMPP microblog from the UI ${Date.now()}`
    await senderPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Feed' }).click()
    const destinations = senderPage.getByRole('group', { name: 'Post destination' })
    await expect(destinations.getByRole('button', { name: 'XMPP', exact: true })).toBeVisible()
    await destinations.getByRole('button', { name: 'XMPP', exact: true }).click()
    await senderPage.getByLabel('Post to XMPP microblog').fill(uiBody)
    await senderPage.getByRole('button', { name: 'Post', exact: true }).last().click()
    await expect(senderPage.getByRole('status').filter({ hasText: 'Published to your XMPP microblog' })).toBeVisible()
    await expect(senderPage.getByText(uiBody, { exact: true })).toBeVisible()
    await expect(receiverPage.getByText(uiBody, { exact: true })).toBeVisible({ timeout: 15000 })

    const publishedItems = await senderPage.evaluate(async ({ senderJid, node }) => {
      const clientBridge = (window as any).__XMPP_P2P_BRIDGE__.xmppNode.clientBridge
      const items = await clientBridge.pubsubGetItems(senderJid, node, 20)
      return items.map((item: any) => item.toString())
    }, { senderJid, node })
    expect(publishedItems.some((item: string) => item.includes(uiBody))).toBe(true)

    const articleTitle = `XMPP article from the UI ${Date.now()}`
    const articleBody = `Long-form article published over XMPP PEP ${Date.now()}`
    await senderPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Write' }).click()
    await senderPage.getByLabel('Article title').fill(articleTitle)
    await senderPage.getByLabel('Paragraph text').fill(articleBody)
    await senderPage.getByRole('button', { name: 'Continue', exact: true }).click()
    await senderPage.getByRole('button', { name: 'Publish', exact: true }).click()
    await senderPage.getByRole('button', { name: 'Select', exact: true }).click()
    await senderPage.getByRole('button', { name: '#XMPP', exact: true }).click()
    const articleDestinations = senderPage.getByRole('group', { name: 'Article publishing destination' })
    await expect(articleDestinations.getByRole('button', { name: /XMPP microblog/ })).toBeEnabled()
    await articleDestinations.getByRole('button', { name: /XMPP microblog/ }).click()
    await senderPage.getByRole('button', { name: 'Publish to XMPP', exact: true }).click()
    await expect(senderPage).toHaveURL(/\/article\//)
    await expect(senderPage.getByRole('heading', { name: articleTitle })).toBeVisible()
    await expect(senderPage.getByText(articleBody)).toBeVisible()

    const articleItems = await senderPage.evaluate(async ({ senderJid, node }) => {
      const clientBridge = (window as any).__XMPP_P2P_BRIDGE__.xmppNode.clientBridge
      const items = await clientBridge.pubsubGetItems(senderJid, node, 20)
      return items.map((item: any) => item.toString())
    }, { senderJid, node })
    expect(articleItems.some((item: string) => item.includes(articleTitle) && item.includes('nexus-article:v1'))).toBe(true)

  } finally {
    await senderContext.close()
    await receiverContext.close()
  }
})
