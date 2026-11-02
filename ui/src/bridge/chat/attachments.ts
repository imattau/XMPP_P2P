import type { ChatAttachment, ChatMessage } from './types'

export function parseAttachmentReferences(body: string): { content: string; attachments: ChatAttachment[] } {
  const attachments: ChatAttachment[] = []
  const content = body.replace(/(!?)\[([^\]]+)\]\(((?:upload:\/\/|https?:\/\/)[^)]+)\)/g, (_match, imageMarker: string, alt: string, url: string) => {
    attachments.push({ id: url, url, alt, kind: imageMarker ? 'image' : 'file' })
    return ''
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { content, attachments }
}

export function getMessageKind(attachments: ChatAttachment[]): ChatMessage['kind'] {
  if (attachments.length === 0) return 'text'
  if (attachments.length === 1 && attachments[0].kind === 'file' && /\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(attachments[0].alt)) return 'audio'
  return attachments.every((attachment) => attachment.kind === 'image') ? 'image' : 'file'
}

export function parseMessageAttachments<T extends { content: string; kind?: ChatMessage['kind']; attachments?: ChatAttachment[]; fileName?: string }>(message: T): T {
  if (message.attachments?.length) return message
  const parsed = parseAttachmentReferences(message.content)
  if (parsed.attachments.length === 0) return message
  return {
    ...message,
    content: parsed.content,
    kind: getMessageKind(parsed.attachments),
    fileName: parsed.attachments.map((attachment) => attachment.alt).join(', '),
    attachments: parsed.attachments,
  }
}
