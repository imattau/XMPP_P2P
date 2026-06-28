import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30000,
  webServer: {
    command: 'npm --prefix ui run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 15000,
  },
  use: {
    headless: true
  }
})
