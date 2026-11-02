export function sortMessagesChronologically<T extends { activityAt?: string }>(messages: T[]): T[] {
  return messages
    .map((message, index) => ({ message, index, time: Date.parse(message.activityAt ?? '') }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.time) ? left.time : Number.NEGATIVE_INFINITY
      const rightTime = Number.isFinite(right.time) ? right.time : Number.NEGATIVE_INFINITY
      return leftTime - rightTime || left.index - right.index
    })
    .map(({ message }) => message)
}
