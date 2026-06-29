import { useMemo } from 'react'
import { getBrowserXmppBridge } from './runtime'
import { useChatListBridge } from './useChatListBridge'
import { getGroupChatSession } from '../pages/chat-session'
import { loadDirectChatHistory } from './direct-chat-history'
import type { ChatMessage, ChatThread } from './chat/types'
import type { ChatListEntry } from './useChatListBridge'

type ChatThreadData = {
  chat: ChatThread | null
  messages: ChatMessage[]
}

function chatFromListEntry(entry: ChatListEntry): ChatThread {
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
      return { chat: null, messages: [] }
    }

    // Group sessions may use unprefixed id (legacy) or group: prefix.
    const groupId = id.startsWith('group:') ? id.slice(6) : id
    const groupSession = getGroupChatSession(groupId)
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
        messages: listEntry.type === 'direct' ? loadDirectChatHistory(id) : [],
      }
    }

    return { chat: null, messages: [] }
  }, [id, chats])
}
