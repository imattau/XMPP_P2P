import { test, expect } from '@playwright/test'

test.describe('UI Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4173')
  })

  test('shows welcome page for unauthenticated users', async ({ page }) => {
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByRole('heading', { name: 'Private messaging, without a central server' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create new identity' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import existing identity' })).toBeVisible()
  })

  test('can navigate through onboarding to create identity', async ({ page }) => {
    await page.getByRole('button', { name: 'Create new identity' }).click()
    await expect(page).toHaveURL(/\/onboarding\/create/)

    await page.getByLabel('Display name').fill('Test User')
    await page.getByLabel('Handle').fill('testuser')
    await page.getByRole('button', { name: 'Create identity' }).click()
    await expect(page).toHaveURL(/\/onboarding\/recovery/)
    await expect(page.getByRole('heading', { name: 'Secure recovery' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await page.getByRole('switch', { name: 'I saved my recovery phrase' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/onboarding\/permissions/)
  })

  test('uses 44px minimum button targets for touch input', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    try {
      await page.goto('http://localhost:4173/onboarding')
      await expect(page.getByRole('button', { name: 'Create new identity' })).toBeVisible()
      const touchSizes = await page.evaluate(() => ({
        coarsePointer: matchMedia('(pointer: coarse)').matches,
        buttons: [...document.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height),
      }))
      expect(touchSizes.coarsePointer).toBe(true)
      expect(touchSizes.buttons.length).toBeGreaterThan(0)
      for (const height of touchSizes.buttons) expect(height).toBeGreaterThanOrEqual(44)
    } finally {
      await context.close()
    }
  })

})

test.describe('UI Feed Interaction', () => {
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
    })
    await page.goto('http://localhost:4173/')
  })

  test('shows a useful empty state when no peers have published yet', async ({ page }) => {
    await expect(page.getByText('Your feed is quiet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Find people and rooms' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write a post' })).toBeVisible()
  })

  test('keeps visible Feed buttons at least 44px high on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const undersized = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter((button) => button.getClientRects().length > 0 && button.getBoundingClientRect().height < 44)
      .map((button) => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))
    expect(undersized).toEqual([])
  })

  test('can filter the feed', async ({ page }) => {
    const filters = page.getByRole('group', { name: 'Feed filters' })
    const topics = filters.getByRole('button', { name: 'Topics' })
    await topics.click()
    await expect(topics).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('No posts match these filters')).toBeVisible()
  })

  test('can search the feed', async ({ page }) => {
    await page.getByLabel('Open search').click()
    await page.getByLabel('Search posts, topics, and communities').fill('OMEMO')
    await expect(page.getByText('0 results for "OMEMO"')).toBeVisible()
  })

  test('empty feed can open the composer', async ({ page }) => {
    await page.getByRole('button', { name: 'Write a post' }).click()
    await expect(page).toHaveURL(/\/compose/)
  })

  test('creates and joins publishing communities by ID for community posts', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__testClipboardText = ''
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { (window as any).__testClipboardText = text } },
      })
    })
    await page.goto('http://localhost:4173/communities/new')
    await page.getByLabel('Community name').fill('Local Test Community')
    await expect(page.getByLabel('Community ID')).toHaveValue('local-test-community')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/\?collection=local-test-community$/)
    await expect(page.getByLabel('Post to local-test-community')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Post destination' }).getByRole('button', { name: 'Community' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Local Test Community', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Local Test Community', exact: true }).click()
    await page.getByRole('button', { name: 'Copy invite link' }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__testClipboardText)).toMatch(/\/communities\/join\?id=local-test-community$/)

    await page.goto('http://localhost:4173/communities/join?id=shared-community-id')
    await expect(page.getByLabel('Community ID')).toHaveValue('shared-community-id')
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page).toHaveURL(/\?collection=shared-community-id$/)
    await expect(page.getByLabel('Post to shared-community-id')).toBeVisible()
  })

  test('can navigate to settings', async ({ page }) => {
    await page.getByLabel('Settings').click()
    await expect(page).toHaveURL(/\/settings/)
  })
})

test.describe('UI Messaging Routes', () => {
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
    })
  })

  test('keeps messaging and contact controls at least 44px high on a phone viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
    const mobilePage = await context.newPage()
    try {
      await mobilePage.addInitScript(() => {
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
      const undersizedByRoute: Record<string, Array<{ label: string; height: number }>> = {}
      for (const route of ['/chats', '/contacts', '/chats/new']) {
        await mobilePage.goto(`http://localhost:4173${route}`)
        await expect(mobilePage).toHaveURL(`http://localhost:4173${route}`)
        expect(await mobilePage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
        const undersized = await mobilePage.locator('button:visible').evaluateAll(buttons => buttons
          .filter(button => button.getBoundingClientRect().height < 44)
          .map(button => ({
            label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
            height: Math.round(button.getBoundingClientRect().height),
          })))
        if (undersized.length > 0) undersizedByRoute[route] = undersized
      }
      expect(undersizedByRoute).toEqual({})
    } finally {
      await context.close()
    }
  })

  test('mobile More navigation opens and closes with the keyboard and restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:4173/')
    const more = page.getByRole('button', { name: 'More navigation options' })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Contacts' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(more).toBeFocused()
  })

  test('gives visible controls accessible names across primary app routes', async ({ page }) => {
    const missingNamesByRoute: Record<string, Array<{ tag: string; type: string; html: string }>> = {}
    for (const route of ['/', '/topics', '/compose', '/drafts', '/chats', '/contacts', '/profile', '/settings']) {
      await page.goto(`http://localhost:4173${route}`)
      await expect(page).toHaveURL(`http://localhost:4173${route}`)
      const missingNames = await page.locator('button:visible, a:visible, input:visible, textarea:visible, select:visible').evaluateAll(elements => elements
        .filter(element => {
          const labelledBy = element.getAttribute('aria-labelledby')
          const labelledByText = labelledBy?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim()
          const label = element.getAttribute('aria-label')?.trim()
          const title = element.getAttribute('title')?.trim()
          const text = (element as HTMLElement).innerText?.trim()
          const labels = 'labels' in element ? (element as HTMLInputElement).labels?.length : 0
          return !label && !labelledByText && !title && !text && !labels
        })
        .map(element => ({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute('type') || '',
          html: element.outerHTML.slice(0, 180),
        })))
      if (missingNames.length > 0) missingNamesByRoute[route] = missingNames
    }
    expect(missingNamesByRoute).toEqual({})
  })
})

test.describe('UI Article Writing and Drafts', () => {
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
    })
  })

  test('autosaves article text, lists the draft, and reopens it for editing', async ({ page }) => {
    await page.goto('http://localhost:4173/compose')
    await page.getByLabel('Article title').fill('Local draft check')
    await page.getByLabel('Paragraph text').fill('This draft stays on this test browser until it is published.')
    await expect(page.getByRole('status')).toContainText('Saved just now', { timeout: 5000 })

    await page.reload()
    await expect(page.getByLabel('Article title')).toHaveValue('Local draft check')
    await expect(page.getByLabel('Paragraph text')).toHaveValue('This draft stays on this test browser until it is published.')

    await page.goto('http://localhost:4173/drafts')
    await expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible()
    await expect(page.getByText('Local draft check', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Edit Local draft check draft' }).click()
    await expect(page).toHaveURL(/\/compose\?id=/)
    await expect(page.getByLabel('Article title')).toHaveValue('Local draft check')
    await expect(page.getByLabel('Paragraph text')).toHaveValue('This draft stays on this test browser until it is published.')
  })

  test('shows a useful recovery path for a missing draft', async ({ page }) => {
    await page.goto('http://localhost:4173/compose?id=missing-draft')
    await expect(page.getByText('Draft not found')).toBeVisible()
    await page.getByRole('button', { name: 'Open drafts' }).click()
    await expect(page).toHaveURL(/\/drafts$/)
  })

  test('creates a draft, supports cancelling deletion, and removes it after confirmation', async ({ page }) => {
    await page.goto('http://localhost:4173/drafts')
    await page.getByRole('button', { name: 'New article', exact: true }).click()
    await expect(page).toHaveURL(/\/compose\?id=/)
    await page.getByLabel('Article title').fill('Draft deletion check')
    await page.getByLabel('Paragraph text').fill('This draft can be kept or removed.')
    await expect(page.getByRole('status')).toContainText('Saved just now', { timeout: 5000 })

    await page.goto('http://localhost:4173/drafts')
    await expect(page.getByText('Draft deletion check', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'More options for Draft deletion check' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toContainText('will be permanently removed')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByText('Draft deletion check', { exact: true })).toBeVisible()

    const menuTrigger = page.getByRole('button', { name: 'More options for Draft deletion check' })
    await menuTrigger.click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const deleteDialog = page.getByRole('alertdialog')
    const cancelDelete = deleteDialog.getByRole('button', { name: 'Cancel', exact: true })
    const confirmDelete = deleteDialog.getByRole('button', { name: 'Delete draft', exact: true })
    await expect(cancelDelete).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirmDelete).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancelDelete).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(deleteDialog).toBeHidden()
    await expect(menuTrigger).toBeFocused()

    await page.getByRole('button', { name: 'More options for Draft deletion check' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Delete draft', exact: true }).click()
    await expect(page.getByText('No drafts yet')).toBeVisible()
    await page.reload()
    await expect(page.getByText('No drafts yet')).toBeVisible()
  })

  test('offers recovery paths when an article link is unavailable', async ({ page }) => {
    await page.goto('http://localhost:4173/article/missing-article')
    await expect(page.getByText('Article not found')).toBeVisible()
    await page.getByRole('button', { name: 'Browse topics' }).click()
    await expect(page).toHaveURL(/\/topics$/)

    await page.goto('http://localhost:4173/article/missing-article')
    await expect(page.getByText('Article not found')).toBeVisible()
    await page.getByRole('button', { name: 'Go to feed' }).click()
    await expect(page).toHaveURL('http://localhost:4173/')
  })

  test('gives article block insert controls descriptive accessible names', async ({ page }) => {
    await page.goto('http://localhost:4173/compose')
    for (const blockType of ['heading', 'paragraph', 'quote', 'list', 'code', 'image', 'divider']) {
      await expect(page.getByRole('button', { name: `Insert ${blockType} block` })).toBeVisible()
    }
  })

  test('keeps visible article editor controls at least 44px high on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:4173/compose')
    const undersized = await page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))
    expect(undersized).toEqual([])
  })

  test('keeps visible draft actions at least 44px high on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:4173/drafts')
    const undersizedButtons = () => page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))

    await expect(page.getByText('No drafts yet')).toBeVisible()
    expect(await undersizedButtons()).toEqual([])
    await page.getByRole('button', { name: 'New article', exact: true }).click()
    await expect(page).toHaveURL(/\/compose\?id=/)
    await page.goto('http://localhost:4173/drafts')
    await page.getByRole('button', { name: 'More options for Untitled' }).click()
    expect(await undersizedButtons()).toEqual([])
  })
})

test.describe('UI Contacts Empty State', () => {
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
    })
    await page.goto('http://localhost:4173/contacts')
  })

  test('explains how to add the first contact and opens the conversation flow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.getByText('No contacts yet')).toBeVisible()
    await expect(page.getByText('Start a conversation with someone’s peer address or XMPP JID to add them to your contacts.')).toBeVisible()
    const visibleButtonHeights = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height))
    expect(visibleButtonHeights.length).toBeGreaterThan(0)
    for (const height of visibleButtonHeights) expect(height).toBeGreaterThanOrEqual(44)
    const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' })
    const navTargetHeights = await mobileNav.locator('a, button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
    expect(navTargetHeights.length).toBeGreaterThan(0)
    for (const height of navTargetHeights) expect(height).toBeGreaterThanOrEqual(44)
    await mobileNav.getByRole('button', { name: 'More navigation options' }).click()
    const moreTargetHeights = await page.locator('#mobile-more-menu a').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
    expect(moreTargetHeights.length).toBe(3)
    for (const height of moreTargetHeights) expect(height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    await expect(mobileNav.getByRole('button', { name: 'More navigation options' })).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: 'Start a conversation', exact: true }).click()
    await expect(page).toHaveURL(/\/chats\/new$/)
  })
})

test.describe('UI Profile', () => {
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
    })
  })

  test('keeps visible profile controls at least 44px high on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:4173/profile')
    await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible()
    const undersizedButtons = () => page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))
    expect(await undersizedButtons()).toEqual([])
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    expect(await undersizedButtons()).toEqual([])
  })

  test('saves profile edits and keeps cancelled changes out', async ({ page }) => {
    await page.goto('http://localhost:4173/profile')
    await expect(page.getByRole('heading', { name: 'Test User' })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Display Name').fill('Unsaved Name')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Test User' })).toBeVisible()

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Display Name').fill('Updated Profile')
    await page.getByLabel('Bio').fill('A profile saved from the browser UI.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Updated Profile' })).toBeVisible()
    await expect(page.getByText('A profile saved from the browser UI.')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Updated Profile' })).toBeVisible()
    await expect(page.getByText('A profile saved from the browser UI.')).toBeVisible()
  })
})

test.describe('UI Settings Touch Targets', () => {
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
    })
  })

  test('keeps visible settings and sign-out controls at least 44px high on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:4173/settings')
    const undersizedButtons = () => page.locator('button:visible').evaluateAll(buttons => buttons
      .filter(button => button.getBoundingClientRect().height < 44)
      .map(button => ({
        label: (button.getAttribute('aria-label') || button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        height: Math.round(button.getBoundingClientRect().height),
      })))

    await expect(page.getByRole('button', { name: 'Connect to XMPP server' })).toBeVisible()
    expect(await undersizedButtons()).toEqual([])
    await page.getByRole('button', { name: 'Notifications', exact: true }).click()
    expect(await undersizedButtons()).toEqual([])
    await page.getByRole('button', { name: 'Back to settings' }).click()
    await page.getByRole('button', { name: 'Connect to XMPP server' }).click()
    expect(await undersizedButtons()).toEqual([])
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('alertdialog', { name: 'Sign out of Nexus?' })).toBeVisible()
    expect(await undersizedButtons()).toEqual([])
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  })
})

test.describe('UI Recovery Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
        displayName: 'Test User',
        handle: 'testuser',
        jid: 'testuser@p2p',
        publicProfile: true,
        recoveryPhrase: ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'],
        recoveryPhraseKeyed: true,
        recoveryPhraseSaved: true,
        createdAt: new Date().toISOString(),
      }))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    })
    await page.goto('http://localhost:4173/settings')
  })

  test('creates an encrypted backup from Settings after onboarding', async ({ page }) => {
    await page.getByRole('button', { name: 'Privacy & security' }).click()
    await page.getByRole('button', { name: /Recovery phrase & backup/ }).click()
    await expect(page).toHaveURL(/\/settings\/recovery/)
    await expect(page.getByRole('heading', { name: 'Recovery phrase & backup' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'I saved my recovery phrase' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()

    await page.getByRole('button', { name: 'Create encrypted backup' }).click()
    await page.getByLabel('Backup passphrase', { exact: true }).fill('a-strong-backup-passphrase')
    await page.getByLabel('Confirm backup passphrase').fill('a-strong-backup-passphrase')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download backup' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('nexus-testuser-backup.json')
  })

  test('sign-out warning links to recovery options before clearing the profile', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Sign out of Nexus?' })
    await dialog.getByRole('button', { name: 'Recovery options' }).click()
    await expect(page).toHaveURL(/\/settings\/recovery/)
    await expect(page.getByRole('heading', { name: 'Recovery phrase & backup' })).toBeVisible()
  })
})
