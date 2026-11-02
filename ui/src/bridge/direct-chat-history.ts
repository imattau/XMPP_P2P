import type { ChatMessage } from './chat/types'
import { parseMessageAttachments } from './chat/attachments'
import { getAccountScopedStorageKey } from '../lib/account-storage'
import { sortMessagesChronologically } from '../lib/message-order'

const DIRECT_CHAT_HISTORY_KEY = 'xmpp-p2p:direct-chat-history'
const MUTED_DIRECT_CHATS_KEY = 'xmpp-p2p:muted-direct-chats'
const ENCRYPTED_DIRECT_CHATS_KEY = 'xmpp-p2p:encrypted-direct-chats'

const historyStorageKey = () => getAccountScopedStorageKey(DIRECT_CHAT_HISTORY_KEY)
const mutedStorageKey = () => getAccountScopedStorageKey(MUTED_DIRECT_CHATS_KEY)
const encryptedStorageKey = () => getAccountScopedStorageKey(ENCRYPTED_DIRECT_CHATS_KEY)

function notifyHistoryChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('xmpp-p2p:direct-chat-history-updated'))
}

export function canonicalDirectChatId(chatId: string): string {
  const bareJid = chatId.trim().split('/')[0]
  const separator = bareJid.lastIndexOf('@')
  if (separator <= 0) return bareJid
  const localpart = bareJid.slice(0, separator)
  const domain = bareJid.slice(separator + 1)
  // P2P localparts are Base58 libp2p peer IDs, whose letter casing carries
  // identity. Standard XMPP localparts and domains are case mapped.
  return domain.toLowerCase() === 'p2p' ? `${localpart}@p2p` : bareJid.toLowerCase()
}

function readHistoryMap(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(historyStorageKey())
    if (!raw) return {}
    const stored: Record<string, ChatMessage[]> = JSON.parse(raw)
    const normalized: Record<string, ChatMessage[]> = {}
    for (const [chatId, messages] of Object.entries(stored)) {
      const key = canonicalDirectChatId(chatId)
      const merged = new Map((normalized[key] ?? []).map((message) => [message.id, message]))
      for (const message of messages) {
        const previous = merged.get(message.id)
        merged.set(message.id, previous ? {
          ...previous,
          ...message,
          delivered: Boolean(previous.delivered || message.delivered),
          receiptReceived: Boolean(previous.receiptReceived || message.receiptReceived),
          read: Boolean(previous.read || message.read),
        } : message)
      }
      normalized[key] = sortMessagesChronologically([...merged.values()])
    }
    return normalized
  } catch {
    return {}
  }
}

function readChatIds(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? [...new Set((JSON.parse(raw) as string[]).map(canonicalDirectChatId))] : []
  } catch {
    return []
  }
}

export function isDirectChatEncryptionEnabled(chatId: string): boolean {
  return readChatIds(encryptedStorageKey()).includes(canonicalDirectChatId(chatId))
}

export function supportsDirectChatOmemo(chatId: string): boolean {
  return chatId.split('/')[0].toLowerCase().endsWith('@p2p')
}

export function setDirectChatEncryptionEnabled(chatId: string, enabled: boolean): void {
  const key = canonicalDirectChatId(chatId)
  const next = new Set(readChatIds(encryptedStorageKey()))
  if (enabled) next.add(key)
  else next.delete(key)
  try {
    localStorage.setItem(encryptedStorageKey(), JSON.stringify([...next]))
  } catch { /* storage unavailable */ }
  notifyHistoryChanged()
}

export function isDirectChatMuted(chatId: string): boolean {
  return readChatIds(mutedStorageKey()).includes(canonicalDirectChatId(chatId))
}

export function setDirectChatMuted(chatId: string, muted: boolean): void {
  const key = canonicalDirectChatId(chatId)
  const next = new Set(readChatIds(mutedStorageKey()))
  if (muted) next.add(key)
  else next.delete(key)
  try {
    localStorage.setItem(mutedStorageKey(), JSON.stringify([...next]))
  } catch { /* storage unavailable */ }
  notifyHistoryChanged()
}

export function clearDirectChatHistory(chatId: string): boolean {
  try {
    const all = readHistoryMap()
    delete all[canonicalDirectChatId(chatId)]
    localStorage.setItem(historyStorageKey(), JSON.stringify(all))
  } catch {
    return false
  }
  notifyHistoryChanged()
  return true
}

export function markDirectChatHistoryRead(chatId: string): void {
  try {
    const all = readHistoryMap()
    const key = canonicalDirectChatId(chatId)
    if (!all[key]) return
    if (!all[key].some((message) => message.senderId !== 'me' && !message.read)) return
    all[key] = all[key].map((message) =>
      message.senderId === 'me' ? message : { ...message, read: true }
    )
    localStorage.setItem(historyStorageKey(), JSON.stringify(all))
  } catch { /* storage unavailable */ }
  notifyHistoryChanged()
}

export function markDirectChatMessageReceiptReceived(chatId: string, messageId: string): void {
  try {
    const all = readHistoryMap()
    const key = canonicalDirectChatId(chatId)
    const history = all[key]
    if (!history?.some((message) => message.id === messageId && message.senderId === 'me')) return
    all[key] = history.map((message) => message.id === messageId
      ? { ...message, delivered: true, receiptReceived: true }
      : message)
    localStorage.setItem(historyStorageKey(), JSON.stringify(all))
  } catch { /* storage unavailable */ }
  notifyHistoryChanged()
}

export function loadDirectChatHistory(chatId: string): ChatMessage[] {
  return (readHistoryMap()[canonicalDirectChatId(chatId)] ?? []).map(parseMessageAttachments)
}

export function listDirectChatHistories(): Array<{ chatId: string; messages: ChatMessage[] }> {
  return Object.entries(readHistoryMap()).map(([chatId, messages]) => ({
    chatId,
    messages: messages.map(parseMessageAttachments),
  }))
}

export function saveDirectChatMessage(chatId: string, msg: ChatMessage): boolean {
  try {
    const all = readHistoryMap()
    const key = canonicalDirectChatId(chatId)
    const history = all[key] || []
    const duplicateIndex = history.findIndex((message) => message.id === msg.id)
    if (duplicateIndex >= 0) {
      const existing = history[duplicateIndex]
      const merged = {
        ...existing,
        ...msg,
        delivered: Boolean(existing.delivered || msg.delivered),
        receiptReceived: Boolean(existing.receiptReceived || msg.receiptReceived),
        read: Boolean(existing.read || msg.read),
      }
      if (JSON.stringify(existing) === JSON.stringify(merged)) return true
      all[key] = sortMessagesChronologically(history.map((message, index) => index === duplicateIndex ? merged : message))
      localStorage.setItem(historyStorageKey(), JSON.stringify(all))
      notifyHistoryChanged()
      return true
    }
    all[key] = sortMessagesChronologically([...history, msg])
    localStorage.setItem(historyStorageKey(), JSON.stringify(all))
    notifyHistoryChanged()
    return true
  } catch {
    return false
  }
}

export function replaceDirectChatMessage(chatId: string, oldMessageId: string, msg: ChatMessage): boolean {
  try {
    const all = readHistoryMap()
    const key = canonicalDirectChatId(chatId)
    const history = all[key] || []
    all[key] = sortMessagesChronologically([...history.filter((entry) => entry.id !== oldMessageId && entry.id !== msg.id), msg])
    localStorage.setItem(historyStorageKey(), JSON.stringify(all))
    notifyHistoryChanged()
    return true
  } catch {
    return false
  }
}

export function markDirectChatMessageDelivered(chatId: string, oldMessageId: string, deliveredId: string): void {
  try {
    const all = readHistoryMap()
    const key = canonicalDirectChatId(chatId)
    const history = all[key] || []
    const pending = history.find((message) => message.id === oldMessageId)
    if (!pending) return
    all[key] = history.map((message) => message.id === oldMessageId
      ? { ...message, id: deliveredId, delivered: true }
      : message)
    localStorage.setItem(historyStorageKey(), JSON.stringify(all))
    notifyHistoryChanged()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xmpp-p2p:outbox-message-delivered', {
        detail: { chatId: key, oldMessageId, deliveredId },
      }))
    }
  } catch { /* storage unavailable */ }
}
