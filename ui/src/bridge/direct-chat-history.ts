import type { ChatMessage } from './chat/types'

const DIRECT_CHAT_HISTORY_KEY = 'xmpp-p2p:direct-chat-history'

export function loadDirectChatHistory(chatId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(DIRECT_CHAT_HISTORY_KEY)
    if (!raw) return []
    const all: Record<string, ChatMessage[]> = JSON.parse(raw)
    return all[chatId] || []
  } catch {
    return []
  }
}

export function saveDirectChatMessage(chatId: string, msg: ChatMessage): void {
  try {
    const raw = localStorage.getItem(DIRECT_CHAT_HISTORY_KEY)
    const all: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {}
    const history = all[chatId] || []
    if (history.some((m) => m.id === msg.id)) return
    all[chatId] = [...history, msg]
    localStorage.setItem(DIRECT_CHAT_HISTORY_KEY, JSON.stringify(all))
  } catch { /* storage full */ }
}
