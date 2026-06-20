/**
 * @packageDocumentation CLI profile command verification script covering profile show,
 * update, photo clearing, and nickname alias behavior.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleCliCommand } from '../cli/commands.js'

type TestContext = {
  xmppNode: {
    jid: string
    getVCard: () => Promise<{ fn?: string; nickname?: string; photo?: { type?: string; binval?: string } }>
    setVCard: (profile: { fn?: string; nickname?: string; photo?: { type?: string; binval?: string } | null }) => Promise<{ fn?: string; nickname?: string; photo?: { type?: string; binval?: string } | null }>
    setNickname: (nickname: string) => Promise<void>
  }
  libp2p: {
    peerId: { toString: () => string }
    getMultiaddrs: () => Array<{ toString: () => string }>
    addEventListener: () => void
    getConnections: () => any[]
    start: () => Promise<void>
    stop: () => Promise<void>
  }
  discoveredPeers: Map<string, string[]>
  rl: { setPrompt: () => void; prompt: () => void }
  showPrompt: () => void
  resolvePeerTarget: (target: string) => string
}

/**
 * Executes the CLI profile verification scenario.
 */
async function runCliProfileTest() {
  console.log('Starting CLI profile command verification test...\n')

  const outputs: string[] = []
  const originalLog = console.log
  console.log = (...args: any[]) => {
    outputs.push(args.map(String).join(' '))
  }

  const profileCalls: Array<{ fn?: string; nickname?: string; photo?: { type?: string; binval?: string } | null }> = []
  const nicknameCalls: string[] = []

  const context: TestContext = {
    xmppNode: {
      jid: 'atlas@p2p',
      getVCard: async () => ({ fn: 'Atlas Prime', nickname: 'atlas-prime' }),
      setVCard: async (profile) => {
        profileCalls.push(profile)
        return profile
      },
      setNickname: async (nickname) => {
        nicknameCalls.push(nickname)
      }
    },
    libp2p: {
      peerId: { toString: () => 'peer-test' },
      getMultiaddrs: () => [{ toString: () => '/ip4/127.0.0.1/tcp/9001/p2p/peer-test' }],
      addEventListener: () => undefined,
      getConnections: () => [],
      start: async () => undefined,
      stop: async () => undefined
    },
    discoveredPeers: new Map(),
    rl: { setPrompt: () => undefined, prompt: () => undefined },
    showPrompt: () => undefined,
    resolvePeerTarget: (target: string) => target
  }

  try {
    await handleCliCommand('profile show', context as any)
    assert.ok(outputs.some(line => line.includes('Local profile:')), 'profile show should print a profile header')
    assert.ok(outputs.some(line => line.includes('Display name: Atlas Prime')), 'profile show should print the display name')
    assert.ok(outputs.some(line => line.includes('Nickname: atlas-prime')), 'profile show should print the nickname')

    outputs.length = 0
    await handleCliCommand('profile set --fn "Atlas Relay" --nick atlas-relay', context as any)
    assert.equal(profileCalls.length, 1)
    assert.deepEqual(profileCalls[0], { fn: 'Atlas Relay', nickname: 'atlas-relay' })
    assert.ok(outputs.some(line => line.includes('Profile updated!')), 'profile set should confirm success')

    const tempDir = await mkdtemp(join(tmpdir(), 'xmpp-profile-'))
    try {
      const photoPath = join(tempDir, 'avatar.png')
      const photoBytes = Buffer.from('avatar-bytes')
      await writeFile(photoPath, photoBytes)

      outputs.length = 0
      await handleCliCommand(`profile set --photo ${photoPath} --photo-type image/png`, context as any)
      assert.equal(profileCalls.length, 2)
      assert.deepEqual(profileCalls[1], {
        photo: {
          type: 'image/png',
          binval: photoBytes.toString('base64')
        }
      })
      assert.ok(outputs.some(line => line.includes('Profile updated!')), 'profile photo update should confirm success')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    outputs.length = 0
    await handleCliCommand('profile clear-photo', context as any)
    assert.equal(profileCalls.length, 3)
    assert.deepEqual(profileCalls[2], { photo: null })
    assert.ok(outputs.some(line => line.includes('Profile photo cleared!')), 'profile clear-photo should confirm success')

    outputs.length = 0
    await handleCliCommand('nick atlas-legacy', context as any)
    assert.equal(nicknameCalls.length, 1)
    assert.equal(nicknameCalls[0], 'atlas-legacy')
    assert.ok(outputs.some(line => line.includes('Nickname updated!')), 'nick alias should remain supported')

    originalLog('CLI profile command verification results:')
    originalLog('  - profile show prints current profile: SUCCESS')
    originalLog('  - profile set updates FN and nickname: SUCCESS')
    originalLog('  - profile clear-photo removes avatar: SUCCESS')
    originalLog('  - nick alias remains supported: SUCCESS')
    originalLog('\n>>> CLI PROFILE VERIFICATION SUCCESSFUL! <<<')
  } finally {
    console.log = originalLog
  }
}

runCliProfileTest().catch((err) => {
  console.error('CLI profile test error:', err)
  process.exit(1)
})
