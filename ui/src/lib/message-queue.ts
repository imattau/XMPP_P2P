const QUEUE_KEY = 'xmpp-p2p:outbox'

interface QueuedMessage {
  id: string
  chatId: string
  target: string
  body: string
  timestamp: number
  attachments?: Array<{ id: string; url: string; alt: string; kind: string }>
}

function getQueue(): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedMessage[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* noop */ }
}

export function enqueueMessage(msg: Omit<QueuedMessage, 'timestamp'>): void {
  const queue = getQueue()
  queue.push({ ...msg, timestamp: Date.now() })
  saveQueue(queue)
}

export function dequeueMessage(id: string): void {
  const queue = getQueue().filter((m) => m.id !== id)
  saveQueue(queue)
}

export function getPendingMessages(): QueuedMessage[] {
  return getQueue()
}

export async function flushOutbox(sendFn: (msg: QueuedMessage) => Promise<boolean>): Promise<void> {
  const queue = getQueue()
  if (queue.length === 0) return

  const remaining: QueuedMessage[] = []
  for (const msg of queue) {
    try {
      const ok = await sendFn(msg)
      if (!ok) remaining.push(msg)
    } catch {
      remaining.push(msg)
    }
  }
  saveQueue(remaining)
}
