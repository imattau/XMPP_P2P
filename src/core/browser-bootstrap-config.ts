import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isIP } from 'node:net'
import { multiaddr } from '@multiformats/multiaddr'
import type { NostrBootstrapConfig } from './nostr-bootstrap.js'

export interface BrowserBootstrapConfigOptions {
  outputPath: string
  publicDomain?: string
  peerId: string
  relayEnabled: boolean
  secureWebSocket: boolean
  nostrBootstrap?: NostrBootstrapConfig
}

export async function writeBrowserBootstrapConfig(options: BrowserBootstrapConfigOptions): Promise<string[]> {
  const configuredDomain = options.publicDomain?.trim() ?? ''
  let bootstrapAddrs: string[] = []

  if (options.relayEnabled && configuredDomain && options.secureWebSocket) {
    const host = configuredDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    const ipVersion = isIP(host)
    const validDnsName = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)
    if (host.includes('/') || (!ipVersion && !validDnsName)) {
      console.warn(`Not writing browser bootstrap address: invalid public domain "${configuredDomain}"`)
    } else {
      const hostProtocol = ipVersion === 4 ? 'ip4' : ipVersion === 6 ? 'ip6' : 'dns4'
      bootstrapAddrs = [multiaddr(`/${hostProtocol}/${host}/tcp/443/wss/p2p/${options.peerId}`).toString()]
    }
  } else if (!options.relayEnabled) {
    console.warn('Browser relay is disabled; writing an empty bootstrap configuration')
  } else if (!options.secureWebSocket) {
    console.warn('A TLS-enabled WebSocket proxy is required for browser relay; writing an empty bootstrap configuration')
  } else {
    console.warn('No public domain is configured; writing an empty browser bootstrap configuration')
  }

  await mkdir(dirname(options.outputPath), { recursive: true })
  const temporaryPath = `${options.outputPath}.${process.pid}.tmp`
  const nostrBootstrap = options.nostrBootstrap && options.nostrBootstrap.relayUrls.length > 0
    ? options.nostrBootstrap
    : undefined
  await writeFile(temporaryPath, `${JSON.stringify({ bootstrapAddrs, ...(nostrBootstrap ? { nostrBootstrap } : {}) }, null, 2)}\n`, { mode: 0o644 })
  await rename(temporaryPath, options.outputPath)
  return bootstrapAddrs
}
