import { test, expect } from '@playwright/test'

test.describe('XMPP server setup', () => {
  test.beforeEach(async ({ page }) => {
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
      const connections: Array<{ type: 'client'; domain: string; status: 'connected' | 'disconnected' }> = []
      const serverListeners = new Set<(info: any) => void>()
      const subscriptionRequestListeners = new Set<(request: { jid: string; server: string }) => void>()
      const pendingSubscriptionRequests = new Map<string, { jid: string; server: string }>()
      const emitServerState = () => serverListeners.forEach(listener => listener(connections[0] ?? {
        type: 'client', domain: 'example.org', status: 'disconnected',
      }))
      const bridge = {
        connectServer: async (jid: string, password: string, service?: string) => {
          ;(window as any).__serverConnectCall = { jid, password, service }
          if (password === 'reject-me') throw new Error('Authentication failed')
          if (password === 'timeout-me') throw new Error('Failed to connect: Connection timed out after 30 seconds')
          connections.splice(0, connections.length, { type: 'client', domain: jid.split('@')[1], status: 'connected' })
          emitServerState()
        },
        disconnectServer: async () => { connections.splice(0); emitServerState() },
        getServerConnections: () => connections,
        getServerStatus: () => ({ online: connections.length > 0, connections }),
        onServerConnection: (listener: (info: any) => void) => { serverListeners.add(listener); return () => serverListeners.delete(listener) },
        getConnectedPeers: () => [],
        getLocalJid: () => 'testuser@p2p',
        isServerConnected: () => connections.length > 0,
        registerServer: async (jid: string, password: string, service: string, registrationFields?: Record<string, string>) => {
          ;(window as any).__registerServerCall = { jid, password, service, registrationFields }
          connections.splice(0, connections.length, { type: 'client', domain: jid.split('@')[1], status: 'connected' })
          emitServerState()
        },
        getRosterEntries: async () => [],
        addRosterEntry: async (jid: string, name?: string) => {
          ;(window as any).__addedRosterEntry = { jid, name }
          return { jid, name, nickname: name }
        },
        onServerRosterChange: () => () => {},
        onServerPresenceSubscriptionRequest: (listener: (request: { jid: string; server: string }) => void) => {
          subscriptionRequestListeners.add(listener)
          pendingSubscriptionRequests.forEach(request => listener(request))
          return () => subscriptionRequestListeners.delete(listener)
        },
        approveServerPresenceSubscription: async (jid: string) => { pendingSubscriptionRequests.delete(jid); (window as any).__subscriptionRequestAction = { action: 'approve', jid } },
        denyServerPresenceSubscription: async (jid: string) => { pendingSubscriptionRequests.delete(jid); (window as any).__subscriptionRequestAction = { action: 'deny', jid } },
      }
      ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
      ;(window as any).__forceServerDisconnect = () => { connections.splice(0); emitServerState() }
      ;(window as any).__emitServerSubscriptionRequest = (jid: string, server: string) => {
        const request = { jid, server }
        pendingSubscriptionRequests.set(jid, request)
        subscriptionRequestListeners.forEach(listener => listener(request))
      }
      ;(window as any).__serverSubscriptionRequestListenerCount = () => subscriptionRequestListeners.size
    })
    await page.route('https://data.xmpp.net/**', route => route.abort())
    await page.goto('http://localhost:4173/onboarding/network')
  })

  test('shows website registration for providers without in-band account creation', async ({ page }) => {
    await page.route('https://data.xmpp.net/providers/v2/providers-B.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { jid: 'web-only.example', inBandRegistration: false, registrationWebPage: { en: 'https://web-only.example/register' } },
        { jid: 'in-band.example', inBandRegistration: true },
      ]),
    }))
    await page.reload()
    await page.getByRole('tab', { name: 'Create Account' }).click()
    await expect(page.getByLabel('XMPP registration server')).toContainText('web-only.example')
    await page.getByLabel('XMPP registration server').selectOption('web-only.example')
    await expect(page.getByRole('link', { name: 'Register on web-only.example' })).toHaveAttribute('href', 'https://web-only.example/register')
    await expect(page.getByLabel('New XMPP account username')).toHaveCount(0)

    await page.getByLabel('XMPP registration server').selectOption('in-band.example')
    await expect(page.getByLabel('New XMPP account username')).toBeVisible()
  })

  test('passes optional email details when creating an XMPP account', async ({ page }) => {
    await page.route('https://data.xmpp.net/providers/v2/providers-B.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ jid: 'in-band.example', inBandRegistration: true }]),
    }))
    await page.reload()
    await page.getByRole('tab', { name: 'Create Account' }).click()
    await page.getByLabel('New XMPP account username').fill('newuser')
    await page.getByLabel('New XMPP account password', { exact: true }).fill('test-password')
    await page.getByLabel('Confirm new XMPP account password', { exact: true }).fill('test-password')
    await page.getByLabel('Registration email address').fill('test@example.org')
    await page.getByRole('button', { name: 'Create Account & Connect' }).click()

    await expect(page.getByRole('heading', { name: 'Connected to in-band.example' })).toBeVisible()
    expect(await page.evaluate(() => (window as any).__registerServerCall)).toEqual({
      jid: 'newuser@in-band.example',
      password: 'test-password',
      service: 'in-band.example',
      registrationFields: { email: 'test@example.org' },
    })
  })

  test('connects with the normalized JID and explicit WebSocket endpoint', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign In' }).click()
    await page.getByLabel('XMPP account JID').fill('  alice@example.org  ')
    await page.getByLabel('XMPP account password').fill('test-password')
    await page.getByLabel('XMPP server WebSocket URL (optional)').fill('wss://chat.example.org/xmpp-websocket')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Connected to example.org' })).toBeVisible()
    const call = await page.evaluate(() => (window as any).__serverConnectCall)
    expect(call).toEqual({
      jid: 'alice@example.org',
      password: 'test-password',
      service: 'wss://chat.example.org/xmpp-websocket',
    })
  })

  test('shows authentication failures and allows the user to correct and retry', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign In' }).click()
    await page.getByLabel('XMPP account JID').fill('alice@example.org')
    await page.getByLabel('XMPP account password').fill('reject-me')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()

    await expect(page.getByRole('alert')).toHaveText('Authentication failed')
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled()
    await page.getByLabel('XMPP account password').fill('corrected-password')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Connected to example.org' })).toBeVisible()
  })

  test('explains how to recover from an XMPP connection timeout', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign In' }).click()
    await page.getByLabel('XMPP account JID').fill('alice@example.org')
    await page.getByLabel('XMPP account password').fill('timeout-me')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('Connection timed out after 30 seconds')
    await expect(page.getByRole('alert')).toContainText('Check your internet connection and the provider’s current secure WebSocket URL')
  })

  test('rejects insecure public endpoints before contacting the bridge', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign In' }).click()
    await page.getByLabel('XMPP account JID').fill('alice@example.org')
    await page.getByLabel('XMPP account password').fill('test-password')
    await page.getByLabel('XMPP server WebSocket URL (optional)').fill('https://chat.example.org')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toHaveText('Server URL must use wss://. ws:// is only allowed for a localhost development server served over http://.')
    await page.getByLabel('XMPP server WebSocket URL (optional)').fill('ws://chat.example.org/xmpp-websocket')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(alert).toHaveText('Server URL must use wss://. ws:// is only allowed for a localhost development server served over http://.')
    expect(await page.evaluate(() => (window as any).__serverConnectCall)).toBeUndefined()
  })

  test('Settings exposes connection errors and can connect with a secure endpoint', async ({ page }) => {
    await page.goto('http://localhost:4173/settings')
    await page.getByRole('button', { name: 'Connect to XMPP server' }).click()
    await page.getByLabel('XMPP account JID').fill('alice@example.org')
    await page.getByLabel('XMPP account password').fill('test-password')
    await page.getByLabel('XMPP server WebSocket URL (optional)').fill('ws://chat.example.org/xmpp-websocket')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toHaveText('Server URL must use wss://. ws:// is only allowed for a localhost development server served over http://.')
    expect(await page.evaluate(() => (window as any).__serverConnectCall)).toBeUndefined()

    await page.getByLabel('XMPP server WebSocket URL (optional)').fill('wss://chat.example.org/xmpp-websocket')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(page.getByText('Connected. Messages to server contacts will be routed through the XMPP connection.')).toBeVisible()
    await expect(page.getByText('Online — 1 server')).toBeVisible()
    expect(await page.evaluate(() => (window as any).__serverConnectCall)).toEqual({
      jid: 'alice@example.org',
      password: 'test-password',
      service: 'wss://chat.example.org/xmpp-websocket',
    })
    await page.evaluate(() => (window as any).__forceServerDisconnect())
    await expect(page.getByText('Disconnected', { exact: true })).toBeVisible()
  })

  test('Find your network adds a resource JID to the roster as a bare JID', async ({ page }) => {
    await page.goto('http://localhost:4173/onboarding/find-network')
    await page.getByLabel('Contact XMPP address').fill('alice@example.org/phone')
    await expect(page.getByRole('button', { name: 'Add contact', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Add contact', exact: true }).click()

    await expect(page.getByRole('status')).toContainText(
      'alice@example.org saved. Connect an XMPP server in Settings to message this contact.'
    )
    expect(await page.evaluate(() => (window as any).__addedRosterEntry)).toEqual({
      jid: 'alice@example.org',
      name: 'alice',
    })
  })

  test('Contacts lets users accept or decline XMPP presence requests', async ({ page }) => {
    // Start on the app shell so this route change exercises the runtime's
    // in-memory pending-request queue instead of destroying it with a reload.
    await page.goto('http://localhost:4173/')
    await page.evaluate(() => (window as any).__emitServerSubscriptionRequest('reader@example.org', 'example.org'))
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Contacts' }).click()
    await page.waitForFunction(() => (window as any).__serverSubscriptionRequestListenerCount() > 0)

    const request = page.getByRole('region', { name: 'XMPP contact requests' })
    await expect(request.getByText('reader@example.org', { exact: true })).toBeVisible()
    await expect(request.getByText(/Approving shares your online status/)).toBeVisible()
    await request.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(request).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__subscriptionRequestAction)).toEqual({ action: 'approve', jid: 'reader@example.org' })

    await page.evaluate(() => (window as any).__emitServerSubscriptionRequest('unknown@example.org', 'example.org'))
    const declineRequest = page.getByRole('region', { name: 'XMPP contact requests' })
    await declineRequest.getByRole('button', { name: 'Decline', exact: true }).click()
    await expect(declineRequest).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__subscriptionRequestAction)).toEqual({ action: 'deny', jid: 'unknown@example.org' })
  })
})
