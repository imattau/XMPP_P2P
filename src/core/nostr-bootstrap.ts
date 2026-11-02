import { multiaddr } from '@multiformats/multiaddr'
import { SimplePool } from 'nostr-tools/pool'
import { decode as decodeNip19 } from 'nostr-tools/nip19'
import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import type { Event, VerifiedEvent } from 'nostr-tools/core'

export const NOSTR_BOOTSTRAP_KIND = 30078
export const NOSTR_BOOTSTRAP_IDENTIFIER = 'xmpp-p2p-bootstrap-v1'
export const NOSTR_BOOTSTRAP_TTL_SECONDS = 24 * 60 * 60
const MAX_NOSTR_RELAYS = 8
const MAX_ANNOUNCEMENTS_PER_RELAY = 32
const MAX_ADDRESSES_PER_EVENT = 16
const MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60
const MAX_EVENT_FUTURE_SKEW_SECONDS = 5 * 60

export interface NostrBootstrapConfig {
  relayUrls: string[]
}

export interface NostrBootstrapConfigInput {
  relayUrls?: string | string[]
}

export interface NostrBootstrapAnnouncement {
  version: 1
  peerId: string
  bootstrapAddrs: string[]
}

export interface StartNostrBootstrapPublisherOptions {
  relayUrls: string[]
  secretKey: Uint8Array
  peerId: string
  bootstrapAddrs: string[]
  ttlSeconds?: number
  refreshIntervalMs?: number
  onError?: (error: Error) => void
  onPublished?: (event: VerifiedEvent) => void
}

const textEncoder = new TextEncoder()

function splitValues(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => item.split(/[\n,;]+/))
    .map((item) => item.trim())
    .filter(Boolean)
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '0:0:0:0:0:0:0:1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

export function normalizeNostrRelayUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    const local = isLoopbackHost(url.hostname)
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) return undefined
    if (url.username || url.password || url.hash || url.search) return undefined
    if (url.pathname.includes('..')) return undefined
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/')
  } catch {
    return undefined
  }
}

export function normalizeNostrRelayUrls(value: string | string[]): string[] {
  const result: string[] = []
  for (const candidate of splitValues(value)) {
    const normalized = normalizeNostrRelayUrl(candidate)
    if (normalized && !result.includes(normalized)) result.push(normalized)
    if (result.length >= MAX_NOSTR_RELAYS) break
  }
  return result
}

export function normalizeNostrBootstrapConfig(config: NostrBootstrapConfigInput | undefined): NostrBootstrapConfig {
  return { relayUrls: normalizeNostrRelayUrls(config?.relayUrls ?? []) }
}

export function nostrSecretKeyFromString(value: string): Uint8Array {
  const candidate = value.trim()
  if (/^[0-9a-f]{64}$/i.test(candidate)) {
    return Uint8Array.from(candidate.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)))
  }
  try {
    const decoded = decodeNip19(candidate)
    if (decoded.type === 'nsec' && decoded.data.length === 32) return decoded.data
  } catch {
    // Return a consistent configuration error below.
  }
  throw new Error('Nostr secret key must be a 32-byte hex key or an nsec value')
}

function isValidBootstrapAddress(value: string, expectedPeerId: string): boolean {
  if (value.length > 512 || value.includes('/http-path/')) return false
  try {
    const address = multiaddr(value)
    const components = address.getComponents()
    if (components.length !== 4) return false
    const [hostComponent, portComponent, websocketComponent, peerComponent] = components
    if (!['dns', 'dns4', 'dns6', 'ip4', 'ip6'].includes(hostComponent.name)) return false
    if (portComponent.name !== 'tcp') return false
    if (websocketComponent.name !== 'ws' && websocketComponent.name !== 'wss') return false
    if (peerComponent.name !== 'p2p' || peerComponent.value !== expectedPeerId) return false
    if (websocketComponent.name === 'ws' && !isLoopbackHost(hostComponent.value ?? '')) return false
    return true
  } catch {
    return false
  }
}

function expirationFor(event: Event): number | undefined {
  const tag = event.tags.find((candidate) => candidate[0] === 'expiration')
  const expiresAt = Number(tag?.[1])
  return Number.isSafeInteger(expiresAt) ? expiresAt : undefined
}

export function verifyNostrBootstrapEvent(
  event: Event,
  nowSeconds = Math.floor(Date.now() / 1000),
): string[] {
  if (event.kind !== NOSTR_BOOTSTRAP_KIND) return []
  if (!event.tags.some((tag) => tag[0] === 'd' && tag[1] === NOSTR_BOOTSTRAP_IDENTIFIER)) return []
  if (!Number.isSafeInteger(event.created_at)
    || event.created_at > nowSeconds + MAX_EVENT_FUTURE_SKEW_SECONDS
    || event.created_at < nowSeconds - MAX_EVENT_AGE_SECONDS) return []
  const expiresAt = expirationFor(event)
  if (!expiresAt || expiresAt <= nowSeconds || expiresAt > nowSeconds + MAX_EVENT_AGE_SECONDS) return []

  try {
    const candidate = { ...event, tags: event.tags.map((tag) => [...tag]) }
    if (!verifyEvent(candidate)) return []
    if (textEncoder.encode(event.content).length > 4096) return []
    const announcement = JSON.parse(event.content) as Partial<NostrBootstrapAnnouncement>
    if (announcement.version !== 1
      || typeof announcement.peerId !== 'string'
      || !Array.isArray(announcement.bootstrapAddrs)
      || announcement.bootstrapAddrs.length === 0
      || announcement.bootstrapAddrs.length > MAX_ADDRESSES_PER_EVENT) return []

    return [...new Set(announcement.bootstrapAddrs.filter((address): address is string =>
      typeof address === 'string' && isValidBootstrapAddress(address, announcement.peerId!)
    ))]
  } catch {
    return []
  }
}

export function createNostrBootstrapEvent(
  secretKey: Uint8Array,
  peerId: string,
  bootstrapAddrs: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = NOSTR_BOOTSTRAP_TTL_SECONDS,
): VerifiedEvent {
  if (!bootstrapAddrs.length || bootstrapAddrs.length > MAX_ADDRESSES_PER_EVENT) {
    throw new Error('At least one and at most 16 bootstrap addresses are required')
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > MAX_EVENT_AGE_SECONDS) {
    throw new Error('Nostr bootstrap announcement lifetime must be between one minute and seven days')
  }
  if (bootstrapAddrs.some((address) => !isValidBootstrapAddress(address, peerId))) {
    throw new Error('Nostr bootstrap addresses must be root WebSocket multiaddresses for the announced peer')
  }

  const expiresAt = nowSeconds + ttlSeconds
  const announcement: NostrBootstrapAnnouncement = { version: 1, peerId, bootstrapAddrs }
  const event = finalizeEvent({
    kind: NOSTR_BOOTSTRAP_KIND,
    created_at: nowSeconds,
    tags: [
      ['d', NOSTR_BOOTSTRAP_IDENTIFIER],
      ['expiration', String(expiresAt)],
    ],
    content: JSON.stringify(announcement),
  }, secretKey)
  if (!verifyEvent(event)) throw new Error('Could not sign the Nostr bootstrap announcement')
  return event
}

export async function discoverNostrBootstrapAddrs(
  input: NostrBootstrapConfig,
  options: { maxWaitMs?: number; nowSeconds?: number } = {},
): Promise<string[]> {
  const config = normalizeNostrBootstrapConfig(input)
  if (config.relayUrls.length === 0) return []

  const pool = new SimplePool({ enableReconnect: false })
  try {
    const filter = {
      kinds: [NOSTR_BOOTSTRAP_KIND],
      '#d': [NOSTR_BOOTSTRAP_IDENTIFIER],
      limit: MAX_ANNOUNCEMENTS_PER_RELAY,
    }
    const results = await Promise.allSettled(config.relayUrls.map((relayUrl) =>
      pool.querySync([relayUrl], filter, { maxWait: options.maxWaitMs ?? 2500 })
    ))
    const addresses = results.flatMap((result) => result.status === 'fulfilled'
      ? result.value.flatMap((event) => verifyNostrBootstrapEvent(event, options.nowSeconds))
      : [])
    return [...new Set(addresses)].slice(0, MAX_NOSTR_RELAYS * MAX_ANNOUNCEMENTS_PER_RELAY * MAX_ADDRESSES_PER_EVENT)
  } finally {
    pool.close(config.relayUrls)
  }
}

export async function publishNostrBootstrapAnnouncement(options: Omit<StartNostrBootstrapPublisherOptions, 'refreshIntervalMs' | 'onError' | 'onPublished'>): Promise<VerifiedEvent> {
  const config = normalizeNostrBootstrapConfig({ relayUrls: options.relayUrls })
  if (config.relayUrls.length === 0) throw new Error('At least one valid Nostr WebSocket relay is required')
  const event = createNostrBootstrapEvent(
    options.secretKey,
    options.peerId,
    options.bootstrapAddrs,
    undefined,
    options.ttlSeconds,
  )
  const pool = new SimplePool({ enableReconnect: false })
  try {
    const acknowledgements = await Promise.allSettled(pool.publish(config.relayUrls, event, { maxWait: 7000 }))
    const accepted = acknowledgements.some((result) => result.status === 'fulfilled')
    if (!accepted) {
      const reason = acknowledgements.find((result) => result.status === 'rejected')
      throw new Error(reason?.status === 'rejected' ? `No Nostr relay accepted the bootstrap announcement: ${String(reason.reason)}` : 'No Nostr relay accepted the bootstrap announcement')
    }
    return event
  } finally {
    pool.close(config.relayUrls)
  }
}

export function startNostrBootstrapPublisher(options: StartNostrBootstrapPublisherOptions): () => void {
  const intervalMs = Math.max(60_000, options.refreshIntervalMs ?? 12 * 60 * 60 * 1000)
  let stopped = false
  let publishing = false
  const publish = async () => {
    if (stopped || publishing) return
    publishing = true
    try {
      const event = await publishNostrBootstrapAnnouncement(options)
      options.onPublished?.(event)
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
    } finally {
      publishing = false
    }
  }
  const timer = setInterval(() => { void publish() }, intervalMs)
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  void publish()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

