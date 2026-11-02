import { getActiveAccountStorageId, getAccountScopedStorageKey } from './account-storage'

const QUEUE_KEY = 'xmpp-p2p:outbox'
const activeFlushes = new Set<string>()

export interface QueuedMessage {
  id: string
  chatId: string
  target: string
  peerAddress?: string
  name: string
  body: string
  timestamp: number
  encrypted: boolean
  attachments?: Array<{ id: string; url: string; alt: string; kind: 'image' | 'file' }>
  reply?: { id: string; to?: string }
  thread?: string
}

function getScopedQueueKey(): string | undefined {
  return getActiveAccountStorageId() ? getAccountScopedStorageKey(QUEUE_KEY) : undefined
}

function getQueue(key: string): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as QueuedMessage[] : []
  } catch { return [] }
}

function saveQueue(key: string, queue: QueuedMessage[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(queue))
    return true
  } catch {
    return false
  }
}

export function enqueueMessage(msg: Omit<QueuedMessage, 'timestamp'>): boolean {
  const key = getScopedQueueKey()
  if (!key) return false
  const queue = getQueue(key)
  queue.push({ ...msg, timestamp: Date.now() })
  return saveQueue(key, queue)
}

export function dequeueMessage(id: string): void {
  const key = getScopedQueueKey()
  if (!key) return
  const queue = getQueue(key).filter((m) => m.id !== id)
  saveQueue(key, queue)
}

export function getPendingMessages(): QueuedMessage[] {
  const key = getScopedQueueKey()
  return key ? getQueue(key) : []
}

export function isMessageQueued(id: string): boolean {
  return getPendingMessages().some((message) => message.id === id)
}

export async function flushOutbox(sendFn: (msg: QueuedMessage) => Promise<string | false>): Promise<void> {
  const key = getScopedQueueKey()
  if (!key) return
  if (activeFlushes.has(key)) return
  const queue = getQueue(key)
  if (queue.length === 0) return

  activeFlushes.add(key)
  const processedIds = new Set(queue.map((message) => message.id))
  const failedIds = new Set<string>()
  try {
    for (const msg of queue) {
      try {
        const sentId = await sendFn(msg)
        if (!sentId) failedIds.add(msg.id)
      } catch {
        failedIds.add(msg.id)
      }
    }
  } finally {
    const latestQueue = getQueue(key)
    saveQueue(key, latestQueue.filter((message) => !processedIds.has(message.id) || failedIds.has(message.id)))
    activeFlushes.delete(key)
  }
}
