import { test, expect } from '@playwright/test'

test('joining a P2P room canonicalizes the room ID before calling the bridge', async ({ page }) => {
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
    const bridge = {
      getLocalJid: () => 'testuser@p2p',
      isServerConnected: () => false,
      getConnectedPeers: () => [],
      onConnectionChange: () => () => {},
      getRosterEntries: () => [],
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
      joinMucRoom: async (roomId: string, nick: string) => {
        ;(window as any).__joinedRoom = { roomId, nick }
      },
      getMucRoomSettings: async () => ({ defaultSecure: true }),
      getMucHistory: async () => [],
      getMucParticipants: () => [],
      onMucMessage: () => () => {},
      onMucJoin: () => () => {},
      onMucLeave: () => () => {},
    }
    ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
  })

  await page.goto('http://localhost:4173/chats/new')
  await page.getByRole('tab', { name: 'Channel' }).click()
  const roomInput = page.getByLabel('P2P room ID')
  await roomInput.fill('TeamRoom@MUC.P2P')
  await expect(roomInput).toHaveValue('teamroom@muc.p2p')
  await page.getByRole('button', { name: 'Join', exact: true }).click()

  await expect.poll(() => page.evaluate(() => (window as any).__joinedRoom)).toEqual({ roomId: 'teamroom', nick: 'testuser' })
  await expect(page).toHaveURL(/\/chat\/teamroom$/)
})

test('Groups empty state opens peer group and XMPP room flows directly', async ({ page }) => {
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
    ;(window as any).__XMPP_P2P_BRIDGE__ = {
      getLocalJid: () => 'testuser@p2p',
      isServerConnected: () => false,
      getConnectedPeers: () => [],
      onConnectionChange: () => () => {},
      getRosterEntries: () => [],
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
    }
  })

  await page.goto('http://localhost:4173/chats')
  await page.getByRole('button', { name: 'Groups' }).click()
  await expect(page.getByText('Peer groups appear here. Rooms joined from the Channel tab appear under Channels.', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Channels' }).click()
  await expect(page.getByText('Joined P2P and XMPP rooms appear here.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Browse or join a channel' }).click()
  await expect(page).toHaveURL(/\/chats\/new\?flow=muc$/)
  await expect(page.getByRole('tab', { name: 'Channel' })).toHaveAttribute('aria-selected', 'true')

  await page.goto('http://localhost:4173/chats')
  await page.getByRole('button', { name: 'Groups' }).click()
  await page.getByRole('button', { name: 'Find or create a peer group' }).click()
  await expect(page).toHaveURL(/\/chats\/new\?flow=group$/)
  await expect(page.getByRole('tab', { name: 'Group' })).toHaveAttribute('aria-selected', 'true')

  await page.goto('http://localhost:4173/chats')
  await page.getByRole('button', { name: 'Groups' }).click()
  await page.getByRole('button', { name: 'Browse XMPP rooms' }).click()
  await expect(page).toHaveURL(/\/chats\/new\?flow=muc$/)
  await expect(page.getByRole('tab', { name: 'Channel' })).toHaveAttribute('aria-selected', 'true')
})

test('XMPP room joins show occupants and explain server rejection', async ({ page }) => {
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
    const joinListeners: Array<(event: any) => void> = []
    const errorListeners: Array<(event: any) => void> = []
    const bridge = {
      getLocalJid: () => 'testuser@p2p',
      getServerJid: () => 'testuser@example.org/resource',
      isServerConnected: () => true,
      getConnectedPeers: () => [],
      onConnectionChange: () => () => {},
      getRosterEntries: async () => [],
      onServerConnection: () => () => {},
      onServerRosterChange: () => () => {},
      joinServerMuc: async (roomJid: string, nick: string) => {
        ;(window as any).__joinedServerRoom = { roomJid, nick }
      },
      queryServerMucHistory: async () => ({ hasMore: false }),
      onMucMessage: () => () => {},
      onMucJoin: (listener: (event: any) => void) => { joinListeners.push(listener); return () => {} },
      onMucLeave: () => () => {},
      onMucError: (listener: (event: any) => void) => { errorListeners.push(listener); return () => {} },
    }
    ;(window as any).__mucTestEmitJoin = (event: any) => joinListeners.forEach((listener) => listener(event))
    ;(window as any).__mucTestEmitError = (event: any) => errorListeners.forEach((listener) => listener(event))
    ;(window as any).__XMPP_P2P_BRIDGE__ = bridge
  })

  await page.goto('http://localhost:4173/chats/new')
  await page.getByRole('tab', { name: 'Channel' }).click()
  await page.getByLabel('P2P room ID or XMPP room JID').fill('lobby@conference.example.org')
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(/\/chat\/lobby%40conference\.example\.org$/)
  await expect.poll(() => page.evaluate(() => (window as any).__joinedServerRoom)).toEqual({
    roomJid: 'lobby@conference.example.org',
    nick: 'testuser',
  })

  await page.evaluate(() => (window as any).__mucTestEmitJoin({
    room: 'lobby@conference.example.org',
    from: 'lobby@conference.example.org/alice',
    nick: 'alice',
    occupantJid: 'alice@example.org/resource',
    peerJid: 'alice@example.org/resource',
    server: 'conference.example.org',
    role: 'participant',
  }))
  await page.getByRole('button', { name: 'Conversation details' }).click()
  await expect(page.getByText('alice', { exact: true })).toBeVisible()
  await expect(page.getByText('XMPP room · 2 members')).toBeVisible()
  await expect(page.getByText('2 visible', { exact: true })).toBeVisible()

  await page.evaluate(() => (window as any).__mucTestEmitError({
    room: 'lobby@conference.example.org',
    stanzaError: { condition: 'not-authorized', text: 'Room password required' },
  }))
  await expect(page.getByText('Could not join XMPP room: Room password required')).toBeVisible()

  await page.goto('http://localhost:4173/chats')
  await page.getByRole('button', { name: 'Channels' }).click()
  await expect(page.getByText('lobby', { exact: true })).toBeVisible()
})
