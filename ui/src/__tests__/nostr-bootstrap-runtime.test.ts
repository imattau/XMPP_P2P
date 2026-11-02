import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const discoverNostrBootstrapAddrs = vi.hoisted(() => vi.fn())

vi.mock('../../../src/core/nostr-bootstrap.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/core/nostr-bootstrap.js')>(),
  discoverNostrBootstrapAddrs,
}))

import {
  getBootstrapAddrs,
  getNostrBootstrapConfig,
  saveNostrBootstrapConfig,
  watchBootstrapAddrs,
} from '../bridge/runtime'

const deployedAddress = '/dns4/static.example.test/tcp/443/wss/p2p/12D3KooWJ5zq7gXxTSeK6pQZgUqUk9yJ2PZV5vVYz8dN1n8Q'
const discoveredAddress = '/dns4/discovered.example.test/tcp/443/wss/p2p/12D3KooWJK5aG5cD9XQk3x8k4Y3h6dQ7bPq9uM8vJ2eR1sT'

describe('Nostr peer bootstrap runtime', () => {
  beforeEach(() => {
    localStorage.clear()
    window.__XMPP_P2P_CONFIG__ = undefined
    window.__XMPP_P2P_CONFIG_READY__ = undefined
    discoverNostrBootstrapAddrs.mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it('adds trusted Nostr-discovered peers to deployment bootstrap addresses', async () => {
    window.__XMPP_P2P_CONFIG__ = {
      bootstrapAddrs: [deployedAddress],
      nostrBootstrap: { relayUrls: ['wss://relay.example.test'] },
    }
    window.__XMPP_P2P_CONFIG_READY__ = Promise.resolve(window.__XMPP_P2P_CONFIG__)
    discoverNostrBootstrapAddrs.mockResolvedValue([discoveredAddress])

    await expect(getBootstrapAddrs()).resolves.toEqual([deployedAddress, discoveredAddress])
    expect(discoverNostrBootstrapAddrs).toHaveBeenCalledWith(
      { relayUrls: ['wss://relay.example.test'] },
      { maxWaitMs: 2500 },
    )
  })

  it('uses saved discovery settings and keeps manual bootstrap addresses', async () => {
    window.__XMPP_P2P_CONFIG__ = { bootstrapAddrs: [deployedAddress] }
    window.__XMPP_P2P_CONFIG_READY__ = Promise.resolve(window.__XMPP_P2P_CONFIG__)
    localStorage.setItem('xmpp-p2p:bootstrap-addrs', JSON.stringify([discoveredAddress]))
    saveNostrBootstrapConfig({ relayUrls: ['wss://saved-relay.example.test/'] })
    discoverNostrBootstrapAddrs.mockResolvedValue([deployedAddress, discoveredAddress])

    expect(getNostrBootstrapConfig()).toEqual({
      relayUrls: ['wss://saved-relay.example.test'],
    })
    await expect(getBootstrapAddrs()).resolves.toEqual([discoveredAddress, deployedAddress])
  })

  it('falls back to static addresses when Nostr discovery fails', async () => {
    window.__XMPP_P2P_CONFIG__ = {
      bootstrapAddrs: [deployedAddress],
      nostrBootstrap: { relayUrls: ['wss://unavailable-relay.example.test'] },
    }
    window.__XMPP_P2P_CONFIG_READY__ = Promise.resolve(window.__XMPP_P2P_CONFIG__)
    discoverNostrBootstrapAddrs.mockRejectedValue(new Error('relay unavailable'))

    await expect(getBootstrapAddrs()).resolves.toEqual([deployedAddress])
  })

  it('retries discovery and reports newly published bootstrap addresses', async () => {
    window.__XMPP_P2P_CONFIG__ = {
      bootstrapAddrs: [],
      nostrBootstrap: { relayUrls: ['wss://watch-relay.example.test'] },
    }
    window.__XMPP_P2P_CONFIG_READY__ = Promise.resolve(window.__XMPP_P2P_CONFIG__)
    discoverNostrBootstrapAddrs.mockResolvedValueOnce([]).mockResolvedValue([discoveredAddress])
    const onChange = vi.fn()
    let poll: (() => void) | undefined
    vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      poll = handler as () => void
      return 1 as unknown as ReturnType<typeof window.setInterval>
    })
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    const stop = watchBootstrapAddrs(onChange, 60_000)
    await expect(getBootstrapAddrs()).resolves.toEqual([])
    for (let index = 0; index < 5; index += 1) await Promise.resolve()

    window.__XMPP_P2P_CONFIG__!.nostrBootstrap!.relayUrls = ['wss://watch-relay-2.example.test']
    poll?.()
    await expect(getBootstrapAddrs()).resolves.toEqual([discoveredAddress])
    for (let index = 0; index < 5; index += 1) await Promise.resolve()

    expect(onChange).toHaveBeenCalledWith([discoveredAddress])
    stop()
  })
})
