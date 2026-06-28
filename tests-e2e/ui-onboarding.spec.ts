import { test, expect } from '@playwright/test'

test.describe('UI Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4173')
  })

  test('shows welcome page for unauthenticated users', async ({ page }) => {
    await expect(page.getByText('Nexus')).toBeVisible()
    await expect(page.getByText('XMPP P2P')).toBeVisible()
  })

  test('can navigate through onboarding to create identity', async ({ page }) => {
    await page.getByText('Create identity').click()
    await expect(page).toHaveURL(/\/onboarding\/create/)

    await page.fill('input', 'Test User')
    await page.fill('input[type="password"]', 'testpass')

    await page.getByText('Enter the network').click()
  })

  test('shows feed page after onboarding', async ({ page }) => {
    await page.goto('http://localhost:4173/')
    await page.getByText('Create identity').click()
    await page.fill('input', 'Test User')
    await page.getByText('Enter the network').click()

    await page.goto('http://localhost:4173/')
    await expect(page.getByText('Live')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('UI Feed Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4173/onboarding/ready')
    await page.evaluate(() => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
        displayName: 'Test User',
        handle: 'testuser',
        jid: 'testuser@peer',
        recoveryPhrase: ['abandon', 'ability', 'able'],
        recoveryPhraseSaved: true,
        createdAt: new Date().toISOString(),
      }))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    })
    await page.goto('http://localhost:4173/')
  })

  test('displays feed posts', async ({ page }) => {
    await expect(page.getByText('Live')).toBeVisible()
    await expect(page.getByText('DecentralWeb')).toBeVisible()
  })

  test('can filter feed by type', async ({ page }) => {
    await page.getByText('Topics').click()
    await expect(page.getByText('XMPPProtocol')).toBeVisible()
  })

  test('can search posts', async ({ page }) => {
    await page.getByLabel('Open search').click()
    await page.fill('input', 'OMEMO')
    await expect(page.getByText('1 results')).toBeVisible()
  })

  test('can open post detail', async ({ page }) => {
    await page.getByText('decentralized web').first().click()
    await expect(page).toHaveURL(/\/post\//)
  })

  test('can navigate to settings', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await expect(page).toHaveURL(/\/settings/)
  })
})
