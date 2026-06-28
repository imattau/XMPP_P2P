import { useMemo } from 'react'
import { getBrowserXmppBridge } from './runtime'
import { useChatListBridge } from './useChatListBridge'
import { getGroupChatSession } from '../pages/chat-session'
import type { ChatMessage, ChatThread } from './chat/types'

type ChatThreadData = {
  chat: ChatThread
  messages: ChatMessage[]
}

const FALLBACK_CHATS: Record<string, ChatThread> = {
  '1': {
    id: '1', type: 'direct', name: 'Maren Holdt', handle: 'maren@social.coop',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format',
    server: 'social.coop', encrypted: true, online: true, verified: true,
    participants: [
      { id: 'maren', name: 'Maren Holdt', handle: 'maren@social.coop', server: 'social.coop', online: true, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format' },
      { id: 'me', name: 'You', handle: 'you@jabber.de', server: 'jabber.de', online: true },
    ],
  },
  '2': {
    id: '2', type: 'group', name: 'Protocol Working Group',
    subject: 'XMPP MUC spec review - deadline 2026-07-01',
    server: 'jabber.de', encrypted: true, memberCount: 7,
    participants: [
      { id: 'theo', name: 'Theo N', handle: 'theo_n@hachyderm.io', server: 'hachyderm.io', online: true, role: 'owner', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&auto=format' },
      { id: 'kaspar', name: 'Kaspar V', handle: 'kvold@fosstodon.org', server: 'fosstodon.org', online: false, role: 'admin', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&auto=format' },
      { id: 'elif', name: 'Elif Ş', handle: 'elif_dev@mastodon.social', server: 'mastodon.social', online: true, role: 'member', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&auto=format' },
      { id: 'maren', name: 'Maren H', handle: 'maren@social.coop', server: 'social.coop', online: true, role: 'member', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format' },
      { id: 'me', name: 'You', handle: 'you@jabber.de', server: 'jabber.de', online: true, role: 'member' },
    ],
  },
  '3': {
    id: '3', type: 'muc', name: '#fedidev', handle: 'fedidev@conference.fosstodon.org',
    server: 'conference.fosstodon.org', memberCount: 341,
    subject: 'Federated dev community · monthly call Thu 18:00 UTC',
    encrypted: false, persistent: true, moderated: false, anonymous: false,
    memberOnly: false, passwordProtected: false,
    participants: [
      { id: 'ingrid', name: 'Ingrid L', handle: 'ingridl@sigmoid.social', server: 'sigmoid.social', online: true, role: 'moderator', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format' },
      { id: 'kaspar', name: 'Kaspar V', handle: 'kvold@fosstodon.org', server: 'fosstodon.org', online: false, role: 'owner', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&auto=format' },
      { id: 'theo', name: 'Theo N', handle: 'theo_n@hachyderm.io', server: 'hachyderm.io', online: true, role: 'member', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&auto=format' },
      { id: 'me', name: 'you', handle: 'you@jabber.de', server: 'jabber.de', online: true, role: 'member' },
    ],
  },
  '7': {
    id: '7', type: 'direct', name: 'Ingrid Larsen', handle: 'ingridl@sigmoid.social',
    avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format',
    server: 'sigmoid.social', encrypted: true, online: true,
    participants: [
      { id: 'ingrid', name: 'Ingrid Larsen', handle: 'ingridl@sigmoid.social', server: 'sigmoid.social', online: true, avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format' },
      { id: 'me', name: 'You', handle: 'you@jabber.de', server: 'jabber.de', online: true },
    ],
  },
}

const FALLBACK_MESSAGES: Record<string, ChatMessage[]> = {
  '1': [
    { id: 'm1', senderId: 'maren', senderName: 'Maren', senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', content: 'Hey! Did you get a chance to look at the new RFC draft?', timestamp: '10:02', read: true },
    { id: 'm2', senderId: 'me', senderName: 'You', content: 'Just skimming it now. The push notification section is interesting.', timestamp: '10:04', delivered: true, read: true },
    { id: 'm3', senderId: 'maren', senderName: 'Maren', senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', content: 'Right? Finally addressing the battery drain properly. The proxy approach is clever.', timestamp: '10:06', reactions: [{ emoji: '👍', count: 1, mine: true }] },
    { id: 'm4', senderId: 'me', senderName: 'You', content: 'The mobile XMPP situation has always been the weakest link. If this lands, it removes the last major objection.', timestamp: '10:08', delivered: true, read: true },
    { id: 'm5', senderId: 'maren', senderName: 'Maren', senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&h=48&fit=crop&auto=format', content: 'Exactly. And the spec is already further along than I expected. The authors clearly know what they\'re doing.', timestamp: '10:11' },
    { id: 'm6', senderId: 'me', senderName: 'You', content: 'The new RFC looks solid. Did you get a chance to review the push notification section?', timestamp: '10:14', delivered: true, read: false },
  ],
  '2': [
    { id: 'm1', kind: 'system', senderId: 'system', senderName: '', content: 'Group created by Theo N · 7 members', timestamp: 'Mon' },
    { id: 'm2', senderId: 'theo', senderName: 'Theo', senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', content: 'Alright everyone, let\'s kick off the MUC spec review. I\'ve put the draft in the topic.', timestamp: 'Mon 14:00' },
    { id: 'm3', senderId: 'kaspar', senderName: 'Kaspar', senderAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', content: 'Read through sections 1-4 this morning. The history management changes are significant.', timestamp: 'Mon 14:22' },
    { id: 'm4', senderId: 'elif', senderName: 'Elif', senderAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=48&h=48&fit=crop&auto=format', content: 'The subscription model looks cleaner than the current XEP-0045 approach. Less state to manage on the server.', timestamp: 'Mon 15:01' },
    { id: 'm5', senderId: 'me', senderName: 'You', content: 'Agreed. The old model was complex enough that most servers had subtle incompatibilities.', timestamp: 'Mon 15:04', delivered: true, read: true },
    { id: 'm6', senderId: 'theo', senderName: 'Theo', senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', content: 'Benchmarks are looking great. 2x throughput at 10k connections.', timestamp: '4m', reactions: [{ emoji: '🚀', count: 3 }, { emoji: '🔥', count: 2 }] },
  ],
  '3': [
    { id: 'm1', kind: 'system', senderId: 'system', senderName: '', content: 'You joined #fedidev', timestamp: '2 weeks ago' },
    { id: 'm2', senderId: 'kaspar', senderName: 'kvold', senderAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=48&h=48&fit=crop&auto=format', content: 'Welcome everyone to the monthly sync. Agenda in the topic.', timestamp: 'Thu 17:59' },
    { id: 'm3', senderId: 'ingrid', senderName: 'ingridl', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Monthly call tomorrow 18:00 UTC - agenda in the topic', timestamp: '9m' },
    { id: 'm4', senderId: 'theo', senderName: 'theo_n', senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&fit=crop&auto=format', content: 'Will the call be recorded? Can\'t make it live.', timestamp: '7m' },
    { id: 'm5', senderId: 'ingrid', senderName: 'ingridl', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Yes, notes will be posted in the wiki within 24h.', timestamp: '5m' },
  ],
  '7': [
    { id: 'm1', senderId: 'ingrid', senderName: 'Ingrid', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Hey! Quick question - are you going to the FediDev call tomorrow?', timestamp: '09:15' },
    { id: 'm2', senderId: 'me', senderName: 'You', content: 'Planning to, yes. You presenting anything?', timestamp: '09:22', delivered: true, read: true },
    { id: 'm3', senderId: 'ingrid', senderName: 'Ingrid', senderAvatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=48&h=48&fit=crop&auto=format', content: 'Just a short update on the ActivityPub C2S item. 10 minutes max.', timestamp: '09:24', kind: 'audio', fileName: 'Voice message · 0:42' },
  ],
}

function chatFromListEntry(entry: { id: string; type: string; name: string; handle?: string; avatar?: string; server?: string; participants?: Array<{ name: string; handle: string; server: string; online?: boolean }>; encrypted?: boolean; online?: boolean; verified?: boolean; memberCount?: number }): ChatThread {
  return {
    id: entry.id,
    type: entry.type as ChatThread['type'],
    name: entry.name,
    handle: entry.handle,
    avatar: entry.avatar,
    server: entry.server,
    encrypted: entry.encrypted ?? false,
    online: entry.online,
    verified: entry.verified,
    memberCount: entry.memberCount,
    participants: (entry.participants ?? []).map((p) => ({
      id: p.handle,
      name: p.name,
      handle: p.handle,
      server: p.server,
      online: p.online,
    })),
  }
}

export function useChatThreadBridge(id?: string): ChatThreadData {
  const { chats } = useChatListBridge()

  return useMemo(() => {
    if (!id) {
      const fallback = FALLBACK_CHATS['1']
      return { chat: fallback, messages: FALLBACK_MESSAGES['1'] ?? [] }
    }

    const groupSession = getGroupChatSession(id)
    if (groupSession) {
      return {
        chat: groupSession.chat as unknown as ChatThread,
        messages: groupSession.messages as unknown as ChatMessage[],
      }
    }

    const listEntry = chats.find((c) => c.id === id)
    if (listEntry) {
      return {
        chat: chatFromListEntry(listEntry),
        messages: [],
      }
    }

    const fallbackChat = FALLBACK_CHATS[id]
    if (fallbackChat) {
      return {
        chat: fallbackChat,
        messages: FALLBACK_MESSAGES[id] ?? [],
      }
    }

    const firstFallback = FALLBACK_CHATS['1']
    return { chat: firstFallback, messages: FALLBACK_MESSAGES['1'] ?? [] }
  }, [id, chats])
}
