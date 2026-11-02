import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let userData: string

test.beforeAll(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'nexus-electron-'))
})

test.afterAll(async () => {
  await rm(userData, { recursive: true, force: true })
})

async function launch() {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ELECTRON_OZONE_PLATFORM_HINT: 'x11'
    },
    timeout: 60_000
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root')
  await page.waitForTimeout(1500)
  return { app, page }
}

test('desktop shell exposes the native bridge and a stable identity', async () => {
  const first = await launch()

  const jid = await first.page.evaluate(async () => {
    const api = (window as any).__XMPP_P2P_NATIVE__
    if (!api) throw new Error('native preload is missing')
    const result = await api.createClient({ nickname: 'Desktop Test' })
    return result.bridge.getLocalJid() as string
  })

  expect(jid).toMatch(/@p2p$/)

  const digestBits = await first.page.evaluate(async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('secure-context'))
    return new Uint8Array(digest).byteLength
  })
  expect(digestBits).toBe(32)

  await first.app.close()
  await new Promise((resolve) => setTimeout(resolve, 750))

  const second = await launch()
  const secondJid = await second.page.evaluate(async () => {
    const api = (window as any).__XMPP_P2P_NATIVE__
    const result = await api.createClient({ nickname: 'Desktop Test' })
    return result.bridge.getLocalJid() as string
  })

  expect(secondJid).toBe(jid)
  await second.app.close()
})
