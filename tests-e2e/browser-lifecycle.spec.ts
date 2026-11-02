import { test, expect } from '@playwright/test'

test('signing out while browser networking starts shuts down the late client', async ({ page }) => {
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
  })
  await page.route('**/browser-bundle.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__BRIDGE_START_COUNT__ = 0;
      window.__LATE_BRIDGE_DISCONNECTS__ = 0;
      window.XmppP2P = { createBrowserXmppClient: () => {
        window.__BRIDGE_START_COUNT__ += 1;
        return new Promise((resolve) => {
          window.__RESOLVE_BROWSER_START__ = () => {
            const bridge = { disconnect: async () => {
              window.__LATE_BRIDGE_DISCONNECTS__ += 1;
              if (window.__XMPP_P2P_BRIDGE__ === bridge) delete window.__XMPP_P2P_BRIDGE__;
              window.dispatchEvent(new Event('xmpp-p2p:bridge-disconnected'));
            } };
            window.__XMPP_P2P_BRIDGE__ = bridge;
            window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'));
            resolve({ bridge });
          };
        });
      } };
    `,
  }))

  await page.goto('http://localhost:4173/settings')
  await expect.poll(() => page.evaluate(() => (window as any).__BRIDGE_START_COUNT__)).toBe(1)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out and clear profile' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
  expect(await page.evaluate(() => localStorage.getItem('xmpp-p2p:identity'))).toBeNull()

  await page.evaluate(() => (window as any).__RESOLVE_BROWSER_START__())
  await expect.poll(() => page.evaluate(() => (window as any).__LATE_BRIDGE_DISCONNECTS__)).toBe(1)
  expect(await page.evaluate(() => (window as any).__XMPP_P2P_BRIDGE__)).toBeUndefined()
})

test('a relay change during startup restarts the browser node with the new address', async ({ page }) => {
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
  })
  await page.route('**/browser-bundle.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__BRIDGE_START_ADDRESSES__ = [];
      window.__BRIDGE_RESOLVERS__ = [];
      window.__BRIDGE_DISCONNECTS__ = 0;
      window.XmppP2P = { createBrowserXmppClient: (options) => {
        window.__BRIDGE_START_ADDRESSES__.push(options.bootstrapAddrs);
        return new Promise((resolve) => window.__BRIDGE_RESOLVERS__.push(() => {
          const bridge = {
            getLocalJid: () => 'testuser@p2p',
            getConnectedPeers: () => [],
            getRosterEntries: async () => [],
            broadcastPresence: async () => {},
            disconnect: async () => {
              window.__BRIDGE_DISCONNECTS__ += 1;
              if (window.__XMPP_P2P_BRIDGE__ === bridge) delete window.__XMPP_P2P_BRIDGE__;
              window.dispatchEvent(new Event('xmpp-p2p:bridge-disconnected'));
            },
          };
          window.__XMPP_P2P_BRIDGE__ = bridge;
          window.dispatchEvent(new Event('xmpp-p2p:bridge-ready'));
          resolve({ bridge });
        }));
      } };
    `,
  }))

  await page.goto('http://localhost:4173/settings')
  await expect.poll(() => page.evaluate(() => (window as any).__BRIDGE_START_ADDRESSES__)).toEqual([[]])
  const address = '/dns4/relay.example/tcp/443/wss/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q'
  await page.getByLabel('Peer network relay address').fill(address)
  await page.getByRole('button', { name: 'Save and reconnect' }).click()
  await page.evaluate(() => (window as any).__BRIDGE_RESOLVERS__[0]())

  await expect.poll(() => page.evaluate(() => (window as any).__BRIDGE_START_ADDRESSES__)).toEqual([[], [address]])
  await expect.poll(() => page.evaluate(() => (window as any).__BRIDGE_DISCONNECTS__)).toBe(1)
  await page.evaluate(() => (window as any).__BRIDGE_RESOLVERS__[1]())
  await expect.poll(() => page.evaluate(() => (window as any).__XMPP_P2P_BRIDGE__?.getLocalJid())).toBe('testuser@p2p')
  expect(await page.evaluate(() => (window as any).__BRIDGE_DISCONNECTS__)).toBe(1)
})
