import type { XmppNode } from '../core/xmpp-node.js'
import { StoredPost, StoredMessage, StoredChat } from './types.js'

export type TuiState = {
  connected: boolean
  connectedPeers: number
  peerId: string
  jid: string
  profileFn: string
  profileNick: string
  posts: StoredPost[]
  chats: StoredChat[]
  messages: Map<string, StoredMessage[]>
  currentChatJid: string | null
  currentPostId: string | null
}

export const createTuiState = (xmppNode: XmppNode): TuiState => ({
  connected: false,
  connectedPeers: 0,
  peerId: '',
  jid: xmppNode.jid || '',
  profileFn: '',
  profileNick: '',
  posts: [],
  chats: [],
  messages: new Map(),
  currentChatJid: null,
  currentPostId: null,
})

export const loadInitialData = async (xmppNode: XmppNode, state: TuiState) => {
  try {
    const profile = await xmppNode.getVCard()
    state.profileFn = profile.fn ?? ''
    state.profileNick = profile.nickname ?? ''
  } catch (_) {}

  try {
    const roster = await xmppNode.getRosterEntries()
    state.chats = roster.map((entry: any) => ({
      jid: entry.jid,
      name: entry.nickname || entry.jid.split('@')[0],
      unread: 0,
      online: entry.presence?.type === 'available',
    }))
  } catch (_) {}

  try {
    const feedPosts = await xmppNode.getFeedPosts()
    state.posts = (feedPosts || []).map((p: any) => ({
      id: p.id || '',
      from: p.from || '',
      authorName: p.authorName || p.from?.split('@')[0] || '',
      authorHandle: p.from?.split('@')[0] || '',
      body: p.body || '',
      title: p.title,
      summary: p.summary,
      categories: p.categories,
      topic: p.topic,
      topicColor: p.topicColor,
      type: p.type,
      timestamp: p.publishedAt || p.timestamp || '',
      publishedAt: p.publishedAt,
    }))
  } catch (_) {}
}
