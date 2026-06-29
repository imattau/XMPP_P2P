import { XmppNode } from '../core/xmpp-node.js'
import { TuiState } from './bridge.js'

const recentMessageIds = new Set<string>()
const MAX_RECENT_IDS = 50

export const attachTuiEventListeners = (xmppNode: XmppNode, state: TuiState, onUpdate: () => void) => {
  xmppNode.on('message', (msg: any) => {
    const jid = msg.from
    if (!jid) {
      return
    }
    const msgId = msg.id || `${Date.now()}`
    if (recentMessageIds.has(msgId)) {
      return
    }
    recentMessageIds.add(msgId)
    if (recentMessageIds.size > MAX_RECENT_IDS) {
      const first = recentMessageIds.values().next().value
      if (first) recentMessageIds.delete(first)
    }

    if (!state.messages.has(jid)) {
      state.messages.set(jid, [])
    }
    state.messages.get(jid)!.push({
      id: msgId,
      from: jid,
      body: msg.body || '',
      nickname: msg.nickname,
      encrypted: msg.encrypted,
      encryption: msg.encryption,
      timestamp: msg.delay?.stamp || new Date().toISOString(),
      chatState: msg.chatState,
    })

    const chat = state.chats.find(c => c.jid === jid)
    if (chat) {
      chat.lastMessage = msg.body
      chat.lastTimestamp = new Date().toISOString()
      if (jid !== state.currentChatJid) {
        chat.unread++
      }
    } else {
      state.chats.unshift({
        jid,
        name: msg.nickname || jid.split('@')[0],
        lastMessage: msg.body,
        lastTimestamp: new Date().toISOString(),
        unread: 1,
      })
    }
    onUpdate()
  })

  xmppNode.on('presence', (pres: any) => {
    const chat = state.chats.find(c => c.jid === pres.from)
    if (chat) {
      chat.online = pres.type !== 'unavailable'
    }
    onUpdate()
  })

  xmppNode.on('feed:post', (post: any) => {
    const existing = state.posts.find(p => p.id === post.id)
    if (!existing) {
      state.posts.unshift({
        id: post.id || '',
        from: post.from || '',
        authorName: post.from?.split('@')[0] || '',
        authorHandle: post.from?.split('@')[0] || '',
        body: post.body || '',
        title: post.title,
        summary: post.summary,
        categories: post.categories,
        topic: post.topic,
        topicColor: post.topicColor,
        type: post.type,
        timestamp: post.publishedAt || '',
        publishedAt: post.publishedAt,
      })
    }
    onUpdate()
  })

  xmppNode.on('stream', ({ peerId }: { peerId: string }) => {
    state.connectedPeers++
    state.connected = true
    onUpdate()
  })

  xmppNode.on('stream-closed', () => {
    state.connectedPeers = Math.max(0, state.connectedPeers - 1)
    if (state.connectedPeers === 0) state.connected = false
    onUpdate()
  })
}
