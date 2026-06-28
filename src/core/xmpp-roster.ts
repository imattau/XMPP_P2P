/**
 * @packageDocumentation Roster and vCard state management, including presence sync
 * and subscription handling.
 */

import { xml, Element } from '@xmpp/xml'
import { Multiaddr } from '@multiformats/multiaddr'
import { XmppStream } from './xmpp-stream.js'
import {
  XmppRosterEntry,
  XmppRosterSubscription,
  subscriptionToFlags,
  flagsToSubscription,
  jidFromPeerId,
  normalizeRosterEntry,
  createRosterEntry,
  normalizeVCardProfile,
  XmppVCardProfile,
  XmppPresence
} from './xmpp-records.js'
import { buildCapsElement } from './xmpp-discovery.js'
import { buildVCard } from './xmpp-vcard.js'
import {
  loadRosterState,
  persistRosterState,
  loadVCardState,
  persistVCardState
} from './xmpp-persistence.js'
import { XmppStorage } from './storage/types.js'

const ROSTER_XMLNS = 'jabber:iq:roster'

/**
 * Dependencies required by the roster manager.
 */
export interface XmppRosterContext {
  jid: string
  libp2p: any
  storage: XmppStorage
  ready: Promise<void>
  getOrCreateStream(peerAddr: string | Multiaddr): Promise<XmppStream>
  getStreamByJid(jid: string): XmppStream | undefined
  getStreams(): Map<string, XmppStream>
  emit(event: string, ...args: any[]): boolean
  sendIqRequest(target: string | Multiaddr, stanza: Element, timeoutMs?: number): Promise<Element>
  discoveryNode: string
  discoveryIdentity: any
  collections: any
}

/**
 * Manages roster entries, local vCard state, and presence subscriptions.
 */
export class XmppRosterManager {
  private readonly ctx: XmppRosterContext
  public readonly entries = new Map<string, XmppRosterEntry>()
  public selfPresence: { type: 'available' | 'unavailable'; status?: string; show?: string; nickname?: string } = {
    type: 'available'
  }
  public selfVCard: XmppVCardProfile = {}
  private rosterSaveQueue: Promise<void> = Promise.resolve()
  private vCardSaveQueue: Promise<void> = Promise.resolve()

  constructor(ctx: XmppRosterContext) {
    this.ctx = ctx
  }

  public async initialize(): Promise<void> {
    await this.loadRoster()
    await this.loadVCard()
  }

  private async loadRoster(): Promise<void> {
    await loadRosterState({
      storage: this.ctx.storage,
      roster: this.entries,
      normalizeRosterEntry: normalizeRosterEntry
    } as any)
  }

  private async loadVCard(): Promise<void> {
    await loadVCardState({
      storage: this.ctx.storage,
      vCard: this.selfVCard
    } as any)
    if (this.selfVCard.nickname && !this.selfPresence.nickname) {
      this.selfPresence.nickname = this.selfVCard.nickname
    }
  }

  public async persistRoster(): Promise<void> {
    await persistRosterState({
      storage: this.ctx.storage,
      roster: this.entries
    } as any)
  }

  public scheduleRosterPersist(): Promise<void> {
    this.rosterSaveQueue = this.rosterSaveQueue
      .then(() => this.persistRoster())
      .catch(err => {
        console.error('[XMPP] Failed to persist roster:', err)
      })

    return this.rosterSaveQueue
  }

  public async persistVCard(): Promise<void> {
    await persistVCardState({
      storage: this.ctx.storage,
      vCard: this.selfVCard
    } as any)
  }

  public scheduleVCardPersist(): Promise<void> {
    this.vCardSaveQueue = this.vCardSaveQueue
      .then(() => this.persistVCard())
      .catch(err => {
        console.error('[XMPP] Failed to persist vCard:', err)
      })

    return this.vCardSaveQueue
  }

  public async handleSubscribe(peerId: string, fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: flagsToSubscription(flags.to, true),
      ask: undefined
    })
    await this.sendPresenceToPeer(peerId, 'subscribed')
    await this.sendCurrentPresenceToPeer(peerId)
    this.ctx.emit('presence:subscribe', { from: fromJid })
  }

  public async handleSubscribed(fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: flagsToSubscription(true, flags.from),
      ask: undefined
    })
    this.ctx.emit('presence:subscribed', { from: fromJid })
  }

  public async handleUnsubscribe(peerId: string, fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: flagsToSubscription(false, flags.from),
      ask: undefined
    })
    await this.sendPresenceToPeer(peerId, 'unsubscribed')
    this.ctx.emit('presence:unsubscribe', { from: fromJid })
  }

  public async handleUnsubscribed(fromJid: string) {
    const entry = await this.upsertRosterEntry({ jid: fromJid })
    const flags = subscriptionToFlags(entry.subscription)
    await this.upsertRosterEntry({
      jid: fromJid,
      subscription: flagsToSubscription(flags.to, false),
      ask: undefined
    })
    this.ctx.emit('presence:unsubscribed', { from: fromJid })
  }

  public async sendCurrentPresenceToPeer(peerId: string) {
    const presenceType = this.selfPresence.type === 'unavailable' ? 'unavailable' : undefined
    await this.sendPresenceToPeer(peerId, presenceType, this.selfPresence.status, this.selfPresence.show, this.selfPresence.nickname)
  }

  public async sendPresenceToPeer(peerId: string, type?: string, status?: string, show?: string, nickname?: string) {
    const xmppStream = this.ctx.getStreamByJid(jidFromPeerId(peerId)) || this.ctx.getStreams().get(peerId)
    if (!xmppStream) {
      return
    }

    const presAttrs: Record<string, string> = {
      to: jidFromPeerId(peerId),
      from: this.ctx.jid
    }
    if (type) {
      presAttrs.type = type
    }

    const children: Element[] = []
    if (show) {
      children.push(xml('show', {}, show))
    }
    if (status) {
      children.push(xml('status', {}, status))
    }
    if (nickname) {
      children.push(xml('nick', { xmlns: 'http://jabber.org/protocol/nick' }, nickname))
    }
    if (!type || type === 'available') {
      children.push(buildCapsElement(this.ctx.discoveryNode, this.ctx.discoveryIdentity, this.ctx.collections))
    }

    const pres = children.length > 0
      ? xml('presence', presAttrs, ...children)
      : xml('presence', presAttrs)

    xmppStream.send(pres)
  }

  public async sendPresence(peerAddr: string | Multiaddr, type?: string, status?: string, show?: string, nickname?: string) {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'

    const presAttrs: Record<string, string> = {
      to: toJid,
      from: this.ctx.jid
    }
    if (type) {
      presAttrs.type = type
    }

    const children: Element[] = []
    if (show) {
      children.push(xml('show', {}, show))
    }
    if (status) {
      children.push(xml('status', {}, status))
    }
    if (nickname) {
      children.push(xml('nick', { xmlns: 'http://jabber.org/protocol/nick' }, nickname))
    }

    const pres = children.length > 0
      ? xml('presence', presAttrs, ...children)
      : xml('presence', presAttrs)

    xmppStream.send(pres)
  }

  public async addRosterEntry(jid: string, name?: string): Promise<XmppRosterEntry> {
    const entry = await this.upsertRosterEntry({
      jid,
      name,
      subscription: 'to',
      ask: 'subscribe'
    })

    const stream = this.ctx.getStreamByJid(jid)
    if (stream) {
      await this.sendPresenceToPeer(stream.remotePeer, 'subscribe')
    }

    return entry
  }

  public async removeRosterEntry(jid: string): Promise<void> {
    const stream = this.ctx.getStreamByJid(jid)
    if (stream) {
      await this.sendPresenceToPeer(stream.remotePeer, 'unsubscribe')
    }

    await this.deleteRosterEntry(jid)
  }

  public async subscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const jid = xmppStream.remotePeer.toString() + '@p2p'
    await this.upsertRosterEntry({
      jid,
      subscription: 'to',
      ask: 'subscribe'
    })
    await this.sendPresence(peerAddr, 'subscribe')
  }

  public async unsubscribePresence(peerAddr: string | Multiaddr): Promise<void> {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const jid = xmppStream.remotePeer.toString() + '@p2p'
    await this.upsertRosterEntry({
      jid,
      subscription: 'none',
      ask: 'unsubscribe'
    })
    await this.sendPresence(peerAddr, 'unsubscribe')
  }

  public async broadcastPresence(type?: string, status?: string, show?: string, nickname?: string) {
    await this.ctx.ready
    const normalizedType = type === 'unavailable' ? 'unavailable' : 'available'
    this.selfPresence = {
      type: normalizedType,
      status,
      show,
      nickname
    }
    this.selfVCard.nickname = nickname

    for (const peerId of this.ctx.getStreams().keys()) {
      await this.sendCurrentPresenceToPeer(peerId)
    }
  }

  public async upsertRosterEntry(entry: Partial<XmppRosterEntry> & { jid: string }): Promise<XmppRosterEntry> {
    await this.ctx.ready
    const current = this.entries.get(entry.jid) ?? createRosterEntry(entry.jid)
    const next = normalizeRosterEntry({
      ...current,
      ...entry,
      nickname: entry.nickname ?? current.nickname,
      groups: entry.groups ?? current.groups,
      presence: entry.presence ?? current.presence
    })

    this.entries.set(next.jid, next)
    await this.scheduleRosterPersist()
    this.ctx.emit('roster:change', next)
    return next
  }

  public async deleteRosterEntry(jid: string): Promise<void> {
    await this.ctx.ready
    if (this.entries.delete(jid)) {
      await this.scheduleRosterPersist()
      this.ctx.emit('roster:remove', jid)
    }
  }

  public async recordPresence(peerJid: string, presence: XmppPresence) {
    const next = await this.upsertRosterEntry({
      jid: peerJid,
      nickname: presence.nickname,
      presence: {
        type: presence.type === 'unavailable' ? 'unavailable' : 'available',
        status: presence.status,
        show: presence.show,
        nickname: presence.nickname,
        receivedAt: new Date().toISOString()
      }
    })

    this.ctx.emit('roster:presence', next)
  }

  public getRosterEntries(): XmppRosterEntry[] {
    return Array.from(this.entries.values()).sort((a, b) => a.jid.localeCompare(b.jid))
  }

  public getRosterEntry(jid: string): XmppRosterEntry | undefined {
    return this.entries.get(jid)
  }

  public buildRosterQuery(): Element {
    return xml(
      'query',
      { xmlns: ROSTER_XMLNS },
      ...Array.from(this.entries.values()).map(entry => this.buildRosterItem(entry))
    )
  }

  private buildRosterItem(entry: XmppRosterEntry): Element {
    const attrs: Record<string, string> = {
      jid: entry.jid,
      subscription: entry.subscription
    }
    if (entry.name) {
      attrs.name = entry.name
    }
    if (entry.ask) {
      attrs.ask = entry.ask
    }

    return xml(
      'item',
      attrs,
      ...(entry.groups ?? []).map(group => xml('group', {}, group))
    )
  }

  public buildRosterQueryResponse(): Element {
    return this.buildRosterQuery()
  }

  public parseRosterQuery(query: Element): XmppRosterEntry[] {
    return (query.children as any[])
      .filter(child => child?.name === 'item')
      .map((child: Element) => {
        const groups = (child.children as any[])
          .filter(group => group?.name === 'group')
          .map((group: Element) => group.text())

        return normalizeRosterEntry({
          jid: child.attrs.jid,
          name: child.attrs.name,
          subscription: child.attrs.subscription as XmppRosterSubscription | undefined,
          ask: child.attrs.ask as 'subscribe' | 'unsubscribe' | undefined,
          groups,
          updatedAt: new Date().toISOString()
        })
      })
  }

  public async requestRosterFromPeer(peerAddr: string | Multiaddr): Promise<XmppRosterEntry[]> {
    const xmppStream = await this.ctx.getOrCreateStream(peerAddr)
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = xmppStream.remotePeer.toString() + '@p2p'

    const iq = xml(
      'iq',
      {
        to: toJid,
        from: this.ctx.jid,
        type: 'get',
        id
      },
      xml('query', { xmlns: ROSTER_XMLNS })
    )

    const result = await this.ctx.sendIqRequest(peerAddr, iq)
    const query = result.getChild('query')
    if (!query) {
      return []
    }

    return this.parseRosterQuery(query)
  }

  public buildVCardQuery(): Element {
    return buildVCard({
      fn: this.selfVCard.fn,
      nickname: this.selfPresence.nickname ?? this.selfVCard.nickname,
      desc: this.selfVCard.desc,
      photo: this.selfVCard.photo
    }, this.ctx.libp2p.peerId.toString())
  }

  public async updateVCard(profile: XmppVCardProfile): Promise<XmppVCardProfile> {
    await this.ctx.ready
    const photoCleared = profile.photo === null
    const normalized = normalizeVCardProfile(profile)
    const nicknameChanged = normalized.nickname !== undefined && normalized.nickname !== this.selfPresence.nickname

    if (normalized.fn !== undefined) {
      this.selfVCard.fn = normalized.fn
    }

    if (normalized.nickname !== undefined) {
      this.selfVCard.nickname = normalized.nickname
      this.selfPresence.nickname = normalized.nickname
    }

    if (normalized.desc !== undefined) {
      this.selfVCard.desc = normalized.desc
    }

    if (photoCleared) {
      this.selfVCard.photo = undefined
    } else if (normalized.photo !== undefined) {
      this.selfVCard.photo = normalized.photo
    }

    await this.scheduleVCardPersist()

    if (nicknameChanged) {
      await this.broadcastPresence(this.selfPresence.type, this.selfPresence.status, this.selfPresence.show, this.selfPresence.nickname)
    }

    return {
      fn: this.selfVCard.fn,
      nickname: this.selfPresence.nickname ?? this.selfVCard.nickname,
      desc: this.selfVCard.desc,
      ...(this.selfVCard.photo ? { photo: this.selfVCard.photo } : {})
    }
  }

  public async flushRosterPresenceForPeer(peerId: string) {
    await this.ctx.ready
    const jid = jidFromPeerId(peerId)
    const entry = this.entries.get(jid)
    if (!entry) {
      return
    }

    if (entry.ask === 'subscribe') {
      await this.sendPresenceToPeer(peerId, 'subscribe')
    } else if (entry.ask === 'unsubscribe') {
      await this.sendPresenceToPeer(peerId, 'unsubscribe')
    }
  }

  public async close() {
    await this.rosterSaveQueue
    await this.persistRoster()
    await this.vCardSaveQueue
    await this.persistVCard()
  }
}
