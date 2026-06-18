// @ts-nocheck
import { createP2PNode } from '../../../../dist/core/p2p.js'
import { XmppNode } from '../../../../dist/core/xmpp-node.js'
import { collectionTopicForId, feedTopicForPeer, jidFromPeerId, peerIdFromJid } from '../../../../dist/core/xmpp-records.js'

type UiPresence = 'available' | 'away' | 'busy' | 'dnd'

export type UiMessage = {
  id?: string
  from: string
  text: string
  time: string
  self: boolean
  encrypted?: boolean
  encryption?: 'openpgp' | 'omemo'
  chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
  receipt?: { type: 'request' | 'received'; id: string }
  corrected?: boolean
  markers?: Record<string, string>
}

export type UiChat = {
  id: string
  kind: 'direct' | 'group' | 'muc'
  name: string
  secure: boolean
  unread: number
  preview: string
  lastActivityMinutesAgo: number
  messages: UiMessage[]
  peerId?: string
  jid?: string
  participants?: string[]
  topic?: string
  localNick?: string
  occupants?: Array<{ nick: string; presence: string }>
  roomName?: string
  defaultSecure?: boolean
  autoJoin?: boolean
  communityId?: string
  typingNicks?: string[]
}

export type UiFeedItem = {
  id: string
  sourceType: 'person' | 'community'
  sourceId: string
  sourceLabel: string
  topic?: string
  avatar: string
  title: string
  body: string
  time: string
  reactions: string[]
  secure: boolean
}

export type UiContact = {
  id: string
  name: string
  jid: string
  peerId: string
  presence: UiPresence | 'available' | 'unavailable'
  subscription: string
  trust: 'verified' | 'known' | 'pending'
  capability: string
}

export type UiCommunity = {
  id: string
  name: string
  tag: string
  description: string
  members: number
  visibility: 'public' | 'private'
  color: string
  joined: boolean
}

export type UiPeer = {
  id: string
  label: string
  kind: 'local' | 'contact' | 'community' | 'channel' | 'room'
  x: number
  y: number
  status: string
}

export type UiIdentity = {
  nickname: string
  jid: string
  peerId: string
  transport: string
  connection: string
}

export type UiProtocolEntry = {
  label: string
  value: string
}

export type UiAttachmentSummary = {
  topic: string
  targetId: string
  total: number
  noticed: number
  reactions: number
  reactionCounts: Record<string, number>
  updatedAt: string
}

export type UiSecuritySnapshot = {
  omemoDeviceId: number
  omemoRegistrationId: number
  omemoPreKeys: number
  openPgpFingerprint: string
  openPgpKeyAvailable: boolean
}

export type UiSnapshot = {
  identity: UiIdentity
  peers: UiPeer[]
  contacts: UiContact[]
  communities: UiCommunity[]
  chats: UiChat[]
  feedItems: UiFeedItem[]
  protocol: UiProtocolEntry[]
  presence: UiPresence
  presenceMessage: string
  secure: boolean
  security: UiSecuritySnapshot
  attachmentSummaries: UiAttachmentSummary[]
  section: 'feed' | 'chats' | 'contacts'
  feedFilter: string
  composerTargetId: string
  activeChatId: string
  activeFeedId: string
}

type ThreadRecord = {
  id: string
  kind: UiChat['kind']
  name: string
  secure: boolean
  unread: number
  preview: string
  lastActivityAt: string
  messages: UiMessage[]
  peerId?: string
  jid?: string
  participants?: string[]
  topic?: string
  localNick?: string
  occupants?: Array<{ nick: string; presence: string }>
  roomName?: string
  defaultSecure?: boolean
  autoJoin?: boolean
  communityId?: string
  typingNicks?: string[]
}

type RuntimeState = {
  directThreads: Map<string, ThreadRecord>
  groupThreads: Map<string, ThreadRecord>
  feedDrafts: Map<string, UiFeedItem>
}

const DEFAULT_PRESENCE: UiPresence = 'available'
const DEFAULT_PRESENCE_MESSAGE = 'Online and reachable'
const DEFAULT_SECTION: UiSnapshot['section'] = 'feed'
const DEFAULT_FEED_FILTER = 'all'

const globalKey = '__xmppUiRuntime__'

function initials(label: string): string {
  const trimmed = label.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function minutesAgo(isoString: string): number {
  const delta = Date.now() - new Date(isoString).getTime()
  return Math.max(0, Math.round(delta / 60000))
}

function relativeLabel(isoString: string): string {
  const mins = minutesAgo(isoString)
  if (mins <= 0) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function peerStatusFromPresence(entry?: XmppRosterEntry['presence']): UiPresence | 'available' | 'unavailable' {
  if (!entry || entry.type === 'unavailable') {
    return 'unavailable'
  }
  if (entry.show === 'away') return 'away'
  if (entry.show === 'chat') return 'available'
  if (entry.show === 'dnd' || entry.show === 'xa') return 'dnd'
  return 'available'
}

function trustFromSubscription(subscription: string): UiContact['trust'] {
  if (subscription === 'both') return 'verified'
  if (subscription === 'to' || subscription === 'from') return 'known'
  return 'pending'
}

function capabilityFromTrust(trust: UiContact['trust'], presence: UiContact['presence']) {
  if (presence === 'unavailable') return 'Offline'
  if (trust === 'verified') return 'OMEMO + OpenPGP'
  if (trust === 'known') return 'OMEMO'
  return 'PubSub only'
}

function sortByRecent<T extends { lastActivityAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
}

class XmppUiRuntime {
  private libp2pPromise: Promise<any>
  private xmppNodePromise: Promise<XmppNode>
  private runtimeState: RuntimeState = {
    directThreads: new Map(),
    groupThreads: new Map(),
    feedDrafts: new Map()
  }
  private presence: UiPresence = DEFAULT_PRESENCE
  private presenceMessage = DEFAULT_PRESENCE_MESSAGE
  private secure = true
  private activeChatId = ''
  private activeFeedId = ''
  private discoveredPeers = new Map<string, string[]>()
  private eventListenersAttached = false

  constructor() {
    this.libp2pPromise = this.createLibp2p()
    this.xmppNodePromise = this.libp2pPromise.then(async (libp2p) => {
      const xmppNode = new XmppNode(libp2p, {
        nickname: process.env.XMPP_UI_NICKNAME ?? 'atlas'
      })
      await xmppNode.ready
      this.attachListeners(xmppNode)
      return xmppNode
    })
  }

  private async createLibp2p() {
    const libp2p = await createP2PNode(undefined, {
      host: '127.0.0.1'
    })
    await libp2p.start()
    libp2p.addEventListener('peer:discovery', (evt: any) => {
      const peerId = evt.detail.id.toString()
      const addrs = evt.detail.multiaddrs.map((ma: any) => ma.toString())
      this.discoveredPeers.set(peerId, addrs)
    })
    return libp2p
  }

  private attachListeners(xmppNode: XmppNode) {
    if (this.eventListenersAttached) {
      return
    }

    this.eventListenersAttached = true

    xmppNode.on('message', (message: any) => {
      void this.recordDirectMessage(message)
    })

    xmppNode.on('muc:message', (message: any) => {
      void this.recordMucMessage(message)
    })

    xmppNode.on('muc:join', (evt: any) => {
      void this.recordMucJoin(evt)
    })

    xmppNode.on('muc:leave', (evt: any) => {
      void this.recordMucLeave(evt)
    })

    xmppNode.on('muc:chatstate', (evt: any) => {
      const thread = this.runtimeState.groupThreads.get(evt.room)
      if (thread) {
        if (!thread.typingNicks) thread.typingNicks = []
        if (evt.chatState === 'composing') {
          if (!thread.typingNicks.includes(evt.from)) {
            thread.typingNicks.push(evt.from)
          }
        } else {
          thread.typingNicks = thread.typingNicks.filter((n: string) => n !== evt.from)
        }
      }
    })

    xmppNode.on('muc:marker', (evt: any) => {
      const thread = this.runtimeState.groupThreads.get(evt.room)
      if (thread) {
        const msg = thread.messages.find((m: any) => m.id === evt.id)
        if (msg) {
          if (!msg.markers) msg.markers = {}
          msg.markers[evt.from] = evt.type
        }
      }
    })

    xmppNode.on('roster:change', (entry: XmppRosterEntry) => {
      this.updateRosterThread(entry)
    })

    xmppNode.on('roster:remove', (jid: string) => {
      const peerId = peerIdFromJid(jid)
      this.runtimeState.directThreads.delete(peerId)
      this.runtimeState.groupThreads.delete(jid)
    })

    xmppNode.on('feed:post', (post: XmppFeedPost) => {
      this.runtimeState.feedDrafts.set(post.id, this.feedPostToItem(post))
    })

    xmppNode.on('collection:post', (post: XmppCollectionPost) => {
      this.runtimeState.feedDrafts.set(post.id, this.collectionPostToItem(post))
    })
  }

  private updateRosterThread(entry: XmppRosterEntry) {
    const peerId = peerIdFromJid(entry.jid)
    const existing = this.runtimeState.directThreads.get(peerId)
    if (!existing) {
      this.runtimeState.directThreads.set(peerId, {
        id: peerId,
        kind: 'direct',
        name: entry.name ?? entry.nickname ?? entry.jid,
        secure: trustFromSubscription(entry.subscription) === 'verified',
        unread: 0,
        preview: entry.presence?.status ?? 'No messages yet',
        lastActivityAt: entry.presence?.receivedAt ?? new Date().toISOString(),
        messages: [],
        peerId,
        jid: entry.jid
      })
      return
    }

    existing.name = entry.name ?? entry.nickname ?? existing.name
    existing.secure = trustFromSubscription(entry.subscription) === 'verified'
    existing.preview = entry.presence?.status ?? existing.preview
    existing.lastActivityAt = entry.presence?.receivedAt ?? existing.lastActivityAt
    existing.jid = entry.jid
    existing.peerId = peerId
  }

  private async recordDirectMessage(message: any) {
    const from = safeString(message?.from, '')
    if (!from) return

    const peerId = peerIdFromJid(from)
    const localJid = (await this.getXmppNode()).jid
    const thread = this.runtimeState.directThreads.get(peerId) ?? {
      id: peerId,
      kind: 'direct',
      name: peerId,
      secure: Boolean(message?.encrypted),
      unread: 0,
      preview: '',
      lastActivityAt: new Date().toISOString(),
      messages: [],
      peerId,
      jid: from
    }

    const outgoing = from === localJid
    const text = safeString(message?.body, '')
    const time = message?.delay?.stamp ?? message?.timestamp ?? new Date().toISOString()

    if (text || message?.chatState) {
      thread.messages.push({
        from: outgoing ? 'You' : message?.nickname ?? from,
        text: text || (message?.chatState ? `Chat state: ${message.chatState}` : ''),
        time: relativeLabel(time),
        self: outgoing,
        encrypted: Boolean(message?.encrypted),
        encryption: message?.encryption,
        chatState: message?.chatState,
        receipt: message?.receipt
      })
    }

    thread.secure = thread.secure || Boolean(message?.encrypted)
    thread.preview = text || thread.preview || 'No messages yet'
    thread.lastActivityAt = time
    this.runtimeState.directThreads.set(peerId, thread)
    this.activeChatId = thread.id
  }

  private async recordMucJoin(evt: any) {
    const roomName = safeString(evt?.room, '')
    if (!roomName) return
    const xmppNode = await this.getXmppNode()
    const roomState = await this.getRoomState(roomName)
    if (!roomState) return
    const settings = await xmppNode.ensureMucRoomSettings(roomName)
    this.runtimeState.groupThreads.set(roomName, {
      id: roomName,
      kind: 'muc',
      name: `#${roomName}`,
      secure: settings?.defaultSecure ?? true,
      unread: 0,
      preview: `${evt?.nick ?? roomState.localNick} joined`,
      lastActivityAt: new Date().toISOString(),
      messages: [],
      topic: settings?.topic ?? roomState.topic,
      localNick: roomState.localNick,
      occupants: Array.from(roomState.occupants.values()).map((occupant: any) => ({
        nick: occupant.nick,
        presence: 'available'
      })),
      roomName,
      defaultSecure: settings?.defaultSecure ?? true,
      autoJoin: settings?.autoJoin ?? true,
      communityId: settings?.communityId
    })
  }

  private async recordMucLeave(evt: any) {
    const roomName = safeString(evt?.room, '')
    if (!roomName) return
    const thread = this.runtimeState.groupThreads.get(roomName)
    if (!thread) return
    thread.preview = `${evt?.nick ?? 'Someone'} left`
    thread.lastActivityAt = new Date().toISOString()
  }

  private async recordMucMessage(message: any) {
    const roomName = safeString(message?.room, '')
    if (!roomName) return
    const xmppNode = await this.getXmppNode()
    const settings = await xmppNode.ensureMucRoomSettings(roomName)
    const thread = this.runtimeState.groupThreads.get(roomName) ?? {
      id: roomName,
      kind: 'muc',
      name: `#${roomName}`,
      secure: Boolean(message?.encrypted),
      unread: 0,
      preview: '',
      lastActivityAt: new Date().toISOString(),
      messages: [],
      topic: settings?.topic ?? message?.roomJid ?? '',
      localNick: '',
      occupants: [],
      roomName,
      defaultSecure: settings?.defaultSecure ?? true,
      autoJoin: settings?.autoJoin ?? true,
      communityId: settings?.communityId
    }

    const text = safeString(message?.body, '')
    if (message?.replace) {
      const existingMsg = thread.messages.find((m: any) => m.id === message.replace)
      if (existingMsg) {
        existingMsg.text = text
        existingMsg.corrected = true
        if (thread.messages[thread.messages.length - 1] === existingMsg) {
          thread.preview = text
        }
        return
      }
    }

    const uiMsg = {
      id: message?.id,
      from: safeString(message?.from, 'Room'),
      text,
      time: relativeLabel(message?.timestamp ?? new Date().toISOString()),
      self: message?.from === thread.localNick || message?.fromPeerId === xmppNode.jid.split('@')[0],
      encrypted: Boolean(message?.encrypted),
      encryption: message?.encryption,
      markers: {}
    }
    thread.messages.push(uiMsg)
    if (thread.typingNicks) {
      thread.typingNicks = thread.typingNicks.filter((n: string) => n !== message?.from)
    }

    thread.preview = text || thread.preview
    thread.secure = thread.secure || Boolean(message?.encrypted)
    thread.lastActivityAt = message?.timestamp ?? new Date().toISOString()
    thread.topic = settings?.topic ?? safeString(message?.roomJid, thread.topic ?? '')
    thread.defaultSecure = settings?.defaultSecure ?? thread.defaultSecure
    thread.autoJoin = settings?.autoJoin ?? thread.autoJoin
    thread.communityId = settings?.communityId ?? thread.communityId
    thread.occupants = Array.isArray(message?.occupants)
      ? message.occupants.map((occupant: any) => ({
          nick: safeString(occupant?.nick, 'Unknown'),
          presence: safeString(occupant?.presence, 'available')
        }))
      : thread.occupants
    this.runtimeState.groupThreads.set(roomName, thread)
    this.activeChatId = thread.id
  }

  private async getXmppNode() {
    return await this.xmppNodePromise
  }

  private async getLibp2p() {
    return await this.libp2pPromise
  }

  private async getRoomState(roomName: string) {
    const xmppNode = await this.getXmppNode()
    return xmppNode.muc.getRoomState(roomName)
  }

  private normalizeCollectionEntry(collection: XmppCollectionNode, subscribedIds: Set<string>): UiCommunity {
    const memberCount = collection.members.length
    return {
      id: collection.id,
      name: collection.name ?? collection.id,
      tag: `#${collection.id}`,
      description: `${memberCount} member${memberCount === 1 ? '' : 's'} in the collection`,
      members: memberCount,
      visibility: subscribedIds.has(collection.id) ? 'public' : 'private',
      color: subscribedIds.has(collection.id) ? 'community' : 'community-alt',
      joined: subscribedIds.has(collection.id)
    }
  }

  private collectionPostToItem(post: XmppCollectionPost): UiFeedItem {
    const title = post.title ?? `Community update from ${post.collectionId}`
    return {
      id: post.id,
      sourceType: 'community',
      sourceId: post.collectionId,
      sourceLabel: `#${post.collectionId}`,
      topic: post.sourceTopic,
      avatar: initials(post.collectionId),
      title,
      body: post.summary ?? post.body,
      time: relativeLabel(post.publishedAt),
      reactions: ['↩︎ 0', '♥ 0'],
      secure: false
    }
  }

  private feedPostToItem(post: XmppFeedPost): UiFeedItem {
    const authorLabel = post.author ?? post.from
    const peerId = peerIdFromJid(post.from)
    return {
      id: post.id,
      sourceType: 'person',
      sourceId: peerId,
      sourceLabel: authorLabel,
      topic: post.topic,
      avatar: initials(authorLabel),
      title: post.title ?? post.summary ?? 'Feed update',
      body: post.summary ?? post.body,
      time: relativeLabel(post.publishedAt),
      reactions: ['↩︎ 0', '♥ 0'],
      secure: false
    }
  }

  private buildFeedItems(feedPosts: XmppFeedPost[], collectionPosts: XmppCollectionPost[]) {
    return [
      ...feedPosts.map(post => ({ item: this.feedPostToItem(post), at: post.publishedAt })),
      ...collectionPosts.map(post => ({ item: this.collectionPostToItem(post), at: post.publishedAt }))
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(entry => entry.item)
  }

  private buildContacts(roster: XmppRosterEntry[]): UiContact[] {
    return roster.map((entry) => {
      const trust = trustFromSubscription(entry.subscription)
      return {
        id: peerIdFromJid(entry.jid),
        name: entry.name ?? entry.nickname ?? peerIdFromJid(entry.jid),
        jid: entry.jid,
        peerId: peerIdFromJid(entry.jid),
        presence: peerStatusFromPresence(entry.presence),
        subscription: entry.subscription,
        trust,
        capability: capabilityFromTrust(trust, peerStatusFromPresence(entry.presence))
      }
    })
  }

  private buildPeers(identity: UiIdentity, contacts: UiContact[], communities: UiCommunity[], chats: UiChat[]): UiPeer[] {
    const peers: UiPeer[] = [
      { id: 'self', label: identity.nickname, kind: 'local', x: 140, y: 86, status: this.presence }
    ]

    contacts.slice(0, 2).forEach((contact, index) => {
      peers.push({
        id: contact.id,
        label: contact.name,
        kind: 'contact',
        x: 52 + index * 168,
        y: 40 + index * 6,
        status: contact.presence
      })
    })

    communities.slice(0, 2).forEach((community, index) => {
      peers.push({
        id: community.id,
        label: community.tag,
        kind: 'community',
        x: 52 + index * 168,
        y: 130 + index * 4,
        status: community.joined ? 'live' : 'idle'
      })
    })

    chats.filter(chat => chat.kind === 'muc').slice(0, 1).forEach((chat) => {
      peers.push({
        id: chat.id,
        label: chat.name.replace('#', ''),
        kind: 'room',
        x: 224,
        y: 128,
        status: chat.secure ? 'secure' : 'live'
      })
    })

    return peers
  }

  private buildProtocol(identity: UiIdentity, contacts: UiContact[], communities: UiCommunity[], chats: UiChat[]): UiProtocolEntry[] {
    return [
      { label: 'Peer discovery', value: `${this.discoveredPeers.size} live peers` },
      { label: 'Roster sync', value: `${contacts.length} contacts` },
      { label: 'Secure sessions', value: `${chats.filter(chat => chat.secure).length} active` },
      { label: 'PubSub topics', value: `${communities.length + chats.filter(chat => chat.kind === 'muc').length} subscribed` },
      { label: 'DHT', value: 'reachable' }
    ]
  }

  private async buildChats(xmppNode: XmppNode, roster: XmppRosterEntry[], collections: XmppCollectionNode[]): Promise<UiChat[]> {
    const seededDirects = roster.map((entry) => {
      const peerId = peerIdFromJid(entry.jid)
      const trust = trustFromSubscription(entry.subscription)
      return this.runtimeState.directThreads.get(peerId) ?? {
        id: peerId,
        kind: 'direct' as const,
        name: entry.name ?? entry.nickname ?? peerId,
        secure: trust === 'verified',
        unread: 0,
        preview: entry.presence?.status ?? 'No messages yet',
        lastActivityAt: entry.presence?.receivedAt ?? new Date().toISOString(),
        messages: [],
        peerId,
        jid: entry.jid
      }
    })

    const directThreadMap = new Map<string, ThreadRecord>()
    for (const thread of [...seededDirects, ...this.runtimeState.directThreads.values()]) {
      directThreadMap.set(thread.id, thread)
    }

    const directThreads = Array.from(directThreadMap.values()).map(thread => ({
      id: thread.id,
      kind: 'direct' as const,
      name: thread.name,
      secure: thread.secure,
      unread: thread.unread,
      preview: thread.preview,
      lastActivityMinutesAgo: minutesAgo(thread.lastActivityAt),
      messages: thread.messages,
      peerId: thread.peerId,
      jid: thread.jid
    }))

    const groupThreads = Array.from(this.runtimeState.groupThreads.values())
      .map(thread => ({
        id: thread.id,
        kind: thread.kind,
        name: thread.name,
        secure: thread.secure,
        unread: thread.unread,
        preview: thread.preview,
        lastActivityMinutesAgo: minutesAgo(thread.lastActivityAt),
        messages: thread.messages,
        participants: thread.participants,
        topic: thread.topic,
        localNick: thread.localNick,
        occupants: thread.occupants,
        roomName: thread.roomName,
        defaultSecure: thread.defaultSecure,
        autoJoin: thread.autoJoin,
        communityId: thread.communityId
      }))

    const joinedMucThreads = await Promise.all(
      xmppNode.muc.getRooms().map(async (roomName) => {
        const roomState = xmppNode.muc.getRoomState(roomName)
        if (!roomState) return null
        const settings = await xmppNode.ensureMucRoomSettings(roomName)
        return {
          id: roomName,
          kind: 'muc' as const,
          name: `#${roomName}`,
          secure: settings?.defaultSecure ?? (roomState.topic ? true : false),
          unread: 0,
          preview: `${roomState.localNick} in room`,
          lastActivityMinutesAgo: 0,
          messages: [],
          topic: settings?.topic ?? roomState.topic,
          localNick: roomState.localNick,
          occupants: Array.from(roomState.occupants.values()).map((occupant: any) => ({
            nick: occupant.nick,
            presence: 'available'
          })),
          roomName,
          defaultSecure: settings?.defaultSecure ?? true,
          autoJoin: settings?.autoJoin ?? true,
          communityId: settings?.communityId
        }
      })
    )

    const mucThreadMap = new Map<string, any>()
    for (const thread of [...groupThreads, ...joinedMucThreads]) {
      mucThreadMap.set(thread.id, thread)
    }

    const seededGroups = roster
      .flatMap(entry => entry.groups ?? [])
      .filter((group, index, all) => all.indexOf(group) === index)
      .map((group) => {
        const participants = roster.filter(entry => (entry.groups ?? []).includes(group))
        return {
          id: `group:${group}`,
          kind: 'group' as const,
          name: group,
          secure: true,
          unread: 0,
          preview: `${participants.slice(0, 2).map(entry => entry.name ?? peerIdFromJid(entry.jid)).join(', ')}${participants.length > 2 ? ` +${participants.length - 2}` : ''}`,
          lastActivityMinutesAgo: 45,
          messages: [],
          participants: participants.map(entry => entry.name ?? peerIdFromJid(entry.jid))
        }
      })

    const mucThreads = collections
      .filter(collection => collection.members.length > 1)
      .slice(0, 1)
      .map((collection) => ({
        id: `muc:${collection.id}`,
        kind: 'muc' as const,
        name: `#${collection.id}`,
        secure: false,
        unread: 0,
        preview: `${collection.members.slice(0, 2).map(member => member.jid.split('@')[0]).join(', ')}${collection.members.length > 2 ? ` +${collection.members.length - 2}` : ''}`,
        lastActivityMinutesAgo: 7,
        messages: [],
        topic: collection.topic,
        localNick: 'atlas',
        defaultSecure: true,
        autoJoin: true,
        communityId: collection.id,
        occupants: collection.members.map(member => ({
          nick: member.jid.split('@')[0],
          presence: 'available'
        })),
        roomName: collection.id
      }))

    return [...directThreads, ...Array.from(mucThreadMap.values()), ...seededGroups, ...mucThreads].sort((a, b) => a.lastActivityMinutesAgo - b.lastActivityMinutesAgo)
  }

  private buildIdentity(libp2p: any, xmppNode: XmppNode, nickname: string): UiIdentity {
    const addresses = libp2p.getMultiaddrs().map((addr: any) => addr.toString())
    return {
      nickname,
      jid: xmppNode.jid,
      peerId: libp2p.peerId.toString(),
      transport: addresses.some((addr: string) => addr.includes('/ws')) ? 'tcp + ws' : 'tcp',
      connection: 'connected'
    }
  }

  async snapshot(): Promise<UiSnapshot> {
    const xmppNode = await this.getXmppNode()
    const libp2p = await this.getLibp2p()
    const [roster, feedPosts, collections, collectionSubscriptions, vCard] = await Promise.all([
      xmppNode.getRosterEntries(),
      xmppNode.getFeedPosts(),
      xmppNode.getCollections(),
      xmppNode.getCollectionSubscriptions(),
      xmppNode.getVCard()
    ])

    const subscribedIds = new Set(collectionSubscriptions.map(subscription => subscription.id))
    const communities = collections.map(collection => this.normalizeCollectionEntry(collection, subscribedIds))
    const contacts = this.buildContacts(roster)
    const chats = await this.buildChats(xmppNode, roster, collections)
    const feedItems = this.buildFeedItems(feedPosts, await xmppNode.getCollectionPosts())
    const identity = this.buildIdentity(libp2p, xmppNode, vCard.nickname ?? vCard.fn ?? libp2p.peerId.toString())
    const peers = this.buildPeers(identity, contacts, communities, chats)
    const protocol = this.buildProtocol(identity, contacts, communities, chats)
    const [omemoBundle, openPgpFingerprint, attachmentSummaries] = await Promise.all([
      xmppNode.getOmemoBundleSummary(),
      xmppNode.getOpenPgpFingerprint(),
      xmppNode.getAttachmentSummaries()
    ])

    if (this.activeChatId && !chats.find(chat => chat.id === this.activeChatId)) {
      this.activeChatId = chats[0]?.id ?? ''
    } else if (!this.activeChatId && chats[0]) {
      this.activeChatId = chats[0].id
    }

    if (this.activeFeedId && !feedItems.find(item => item.id === this.activeFeedId)) {
      this.activeFeedId = feedItems[0]?.id ?? ''
    } else if (!this.activeFeedId && feedItems[0]) {
      this.activeFeedId = feedItems[0].id
    }

    return {
      identity,
      peers,
      contacts,
      communities,
      chats,
      feedItems,
      protocol,
      presence: this.presence,
      presenceMessage: this.presenceMessage,
      secure: this.secure,
      security: {
        omemoDeviceId: omemoBundle.deviceId,
        omemoRegistrationId: omemoBundle.registrationId,
        omemoPreKeys: omemoBundle.preKeyCount,
        openPgpFingerprint,
        openPgpKeyAvailable: Boolean(openPgpFingerprint)
      },
      attachmentSummaries,
      section: DEFAULT_SECTION,
      feedFilter: DEFAULT_FEED_FILTER,
      composerTargetId: communities[0]?.id ?? 'feed',
      activeChatId: this.activeChatId,
      activeFeedId: this.activeFeedId
    }
  }

  async setPresence(presence: UiPresence, message: string) {
    this.presence = presence
    this.presenceMessage = message || DEFAULT_PRESENCE_MESSAGE
    const xmppNode = await this.getXmppNode()
    await xmppNode.broadcastPresence(
      presence === 'dnd' ? 'available' : presence,
      this.presenceMessage,
      presence === 'away' ? 'away' : presence === 'busy' ? 'dnd' : undefined,
      xmppNode.jid.replace('@p2p', '')
    )
  }

  async publishFeed(body: string, targetId: string, secure: boolean, topicTitle?: string, categories: string[] = []) {
    const xmppNode = await this.getXmppNode()
    const profile = await xmppNode.getVCard()
    const author = profile.nickname ?? profile.fn ?? xmppNode.jid.replace('@p2p', '')
    this.secure = secure
    if (!targetId || targetId === 'feed') {
      const itemId = await xmppNode.publishFeed(body, { title: topicTitle, author, categories })
      this.activeFeedId = itemId
      return
    }

    const itemId = await xmppNode.publishCollection(targetId, body, {
      title: topicTitle,
      categories,
      author
    })
    this.activeFeedId = itemId
  }

  async sendDirectMessage(peerId: string, body: string, secure: boolean) {
    const xmppNode = await this.getXmppNode()
    const text = body.trim()
    if (!text) return

    const target = jidFromPeerId(peerId)
    const thread = this.runtimeState.directThreads.get(peerId) ?? {
      id: peerId,
      kind: 'direct' as const,
      name: peerId,
      secure,
      unread: 0,
      preview: text,
      lastActivityAt: new Date().toISOString(),
      messages: [],
      peerId,
      jid: target
    }

    thread.messages.push({
      from: 'You',
      text,
      time: 'now',
      self: true
    })
    thread.preview = text
    thread.secure = secure
    thread.lastActivityAt = new Date().toISOString()
    this.runtimeState.directThreads.set(peerId, thread)
    this.activeChatId = peerId

    if (secure) {
      await xmppNode.sendEncryptedMessage(target, text, { requestReceipt: true })
    } else {
      await xmppNode.sendMessage(target, text, { requestReceipt: true })
    }
  }

  async sendGroupMessage(groupName: string, body: string, secure: boolean, participantIds: string[] = []) {
    const text = body.trim()
    if (!text) return

    const xmppNode = await this.getXmppNode()
    const threadId = `group:${groupName || participantIds.join('-') || Date.now()}`
    const thread = this.runtimeState.groupThreads.get(threadId) ?? {
      id: threadId,
      kind: 'group' as const,
      name: groupName || participantIds.join(', ') || 'Group',
      secure,
      unread: 0,
      preview: text,
      lastActivityAt: new Date().toISOString(),
      messages: [],
      participants: participantIds
    }

    thread.messages.push({
      from: 'You',
      text,
      time: 'now',
      self: true
    })
    thread.preview = text
    thread.secure = secure
    thread.lastActivityAt = new Date().toISOString()
    thread.participants = participantIds
    this.runtimeState.groupThreads.set(threadId, thread)
    this.activeChatId = threadId

    for (const participantId of participantIds) {
      const target = jidFromPeerId(participantId)
      try {
        if (secure) {
          await xmppNode.sendEncryptedMessage(target, text, { requestReceipt: true })
        } else {
          await xmppNode.sendMessage(target, text, { requestReceipt: true })
        }
      } catch {
        await xmppNode.sendMessage(target, text, { requestReceipt: true })
      }
    }
  }

  async sendRoomMessage(
    roomName: string,
    body: string,
    secure: boolean,
    options: { topic?: string; communityId?: string; autoJoin?: boolean; defaultMode?: 'secure' | 'open' } = {}
  ) {
    const xmppNode = await this.getXmppNode()
    const text = body.trim()
    const roomTopic = safeString(options.topic, '')
    const communityId = safeString(options.communityId, '')
    const defaultMode = options.defaultMode ?? (secure ? 'secure' : 'open')
    const autoJoin = options.autoJoin ?? true

    if (!xmppNode.muc.getRoomState(roomName)) {
      await xmppNode.joinMucRoom(roomName, xmppNode.jid.replace('@p2p', ''))
    }
    await xmppNode.updateMucRoomSettings(roomName, {
      topic: roomTopic || undefined,
      defaultMode,
      autoJoin,
      communityId: communityId || undefined
    })

    if (text) {
      if (secure) {
        await xmppNode.muc.sendGroupMessageSecure(roomName, text)
      } else {
        await xmppNode.muc.sendGroupMessage(roomName, text)
      }
    }

    const thread = this.runtimeState.groupThreads.get(roomName) ?? {
      id: roomName,
      kind: 'muc' as const,
      name: `#${roomName}`,
      secure,
      unread: 0,
      preview: text,
      lastActivityAt: new Date().toISOString(),
      messages: [],
      topic: `${roomName}@muc.p2p`,
      localNick: xmppNode.jid.replace('@p2p', ''),
      occupants: [],
      roomName,
      defaultSecure: defaultMode === 'secure',
      autoJoin,
      communityId: communityId || undefined
    }

    if (roomTopic) {
      thread.topic = roomTopic
    } else if (communityId) {
      const community = (await xmppNode.getCollections()).find((item: any) => item.id === communityId)
      thread.topic = community?.description ?? thread.topic
    }

    if (text) {
      thread.messages.push({
        from: 'You',
        text,
        time: 'now',
        self: true,
        encrypted: secure ? true : undefined
      })
      thread.preview = text
    } else {
      thread.preview = roomTopic || 'Created room'
    }
    thread.secure = secure || thread.secure
    thread.defaultSecure = defaultMode === 'secure'
    thread.autoJoin = autoJoin
    thread.communityId = communityId || undefined
    thread.lastActivityAt = new Date().toISOString()
    thread.roomName = roomName
    this.runtimeState.groupThreads.set(roomName, thread)
    this.activeChatId = roomName
  }

  async updateRoomSettings(roomName: string, options: { topic?: string; communityId?: string; autoJoin?: boolean; defaultMode?: 'secure' | 'open' }) {
    const xmppNode = await this.getXmppNode()
    const existing = xmppNode.getMucRoomSettings(roomName)
    const next = {
      topic: options.topic ?? existing?.topic,
      defaultMode: options.defaultMode ?? (existing?.defaultSecure === false ? 'open' : 'secure'),
      autoJoin: options.autoJoin ?? existing?.autoJoin ?? true,
      communityId: options.communityId ?? existing?.communityId
    }

    await xmppNode.updateMucRoomSettings(roomName, next)

    const thread = this.runtimeState.groupThreads.get(roomName)
    if (thread) {
      thread.topic = next.topic || thread.topic
      thread.defaultSecure = next.defaultMode === 'secure'
      thread.autoJoin = next.autoJoin
      thread.communityId = next.communityId
      thread.lastActivityAt = new Date().toISOString()
      this.runtimeState.groupThreads.set(roomName, thread)
    }
  }

  async queryRoomHistory(roomName: string) {
    const xmppNode = await this.getXmppNode()
    const roomState = xmppNode.muc.getRoomState(roomName)
    if (!roomState) return
    const otherOccupant = Array.from(roomState.occupants.values())
      .find(occ => occ.jid !== xmppNode.jid)
    if (otherOccupant) {
      await xmppNode.muc.queryHistory(roomName, otherOccupant.jid)
    }
  }

  async addRosterContact(jid: string, name?: string) {
    const xmppNode = await this.getXmppNode()
    await xmppNode.addRosterEntry(jid, name)
  }

  async removeRosterContact(jid: string) {
    const xmppNode = await this.getXmppNode()
    await xmppNode.removeRosterEntry(jid)
  }

  async subscribeRosterPresence(jid: string) {
    const xmppNode = await this.getXmppNode()
    await xmppNode.subscribePresence(jid)
  }

  async unsubscribeRosterPresence(jid: string) {
    const xmppNode = await this.getXmppNode()
    await xmppNode.unsubscribePresence(jid)
  }

  async joinCommunity(id: string, name?: string) {
    const xmppNode = await this.getXmppNode()
    await xmppNode.createCollection(id, name)
    await xmppNode.subscribeCollection(id)
  }

  async leaveCommunity(id: string) {
    const xmppNode = await this.getXmppNode()
    await xmppNode.unsubscribeCollection(id)
  }

  async requestUploadSlot(target: string, filename: string, size: number, contentType?: string) {
    const xmppNode = await this.getXmppNode()
    const slot = await xmppNode.requestUploadSlot(target, {
      filename,
      size,
      contentType
    })
    return {
      putUrl: slot.putUrl,
      getUrl: slot.getUrl
    }
  }

  async putUpload(putUrl: string, base64: string, contentType?: string) {
    const body = Buffer.from(base64, 'base64')
    const response = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'content-type': contentType ?? 'application/octet-stream'
      },
      body
    })

    if (!response.ok) {
      throw new Error(`Upload PUT failed with ${response.status}`)
    }
  }

  async notice(topic: string, targetId: string, value?: string) {
    const xmppNode = await this.getXmppNode()
    return await xmppNode.notice(topic, targetId, value)
  }

  async react(topic: string, targetId: string, reaction: string) {
    const xmppNode = await this.getXmppNode()
    return await xmppNode.react(topic, targetId, reaction)
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __xmppUiRuntime__: Promise<XmppUiRuntime> | undefined
}

export async function getXmppUiRuntime(): Promise<XmppUiRuntime> {
  const runtimeGlobal = globalThis as any
  if (!runtimeGlobal[globalKey]) {
    runtimeGlobal[globalKey] = Promise.resolve(new XmppUiRuntime())
  }
  return await runtimeGlobal[globalKey]
}
