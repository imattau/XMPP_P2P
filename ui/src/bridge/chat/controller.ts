import type { XmppRuntimeBridge } from '../runtime'
import type { ChatAttachment, ChatComposerState, ChatMessage, ChatMessageReply, ChatParticipant, ChatThread } from './types'

type Listener = (state: ChatComposerState) => void

const ME = 'me'
const MAX_ATTACHMENTS = 4

export class ChatBridgeController {
  private state: ChatComposerState
  private listeners = new Set<Listener>()

  constructor(
    private readonly chat: ChatThread,
    initialMessages: ChatMessage[],
    private readonly runtime?: XmppRuntimeBridge
  ) {
    this.state = {
      messages: initialMessages.map((message) => ({ ...message })),
      input: '',
      replyTo: undefined,
      thread: undefined,
      showImagePicker: false,
      showEmojiPicker: false,
      showMentionPicker: false,
      mentionQuery: '',
      emojiCategory: 'recent',
      emojiSearch: '',
      selectedAttachments: []
    }
  }

  getState() {
    return this.state
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getMentionableContacts() {
    return this.chat.participants.filter((participant) => participant.id !== ME)
  }

  setInput(value: string, cursorPos = value.length) {
    const textUpToCursor = value.slice(0, cursorPos)
    const atMatch = textUpToCursor.match(/@(\S*)$/)

    this.state = {
      ...this.state,
      input: value,
      mentionQuery: atMatch ? atMatch[1] : '',
      showMentionPicker: !!atMatch
    }
    this.emit()
  }

  setReplyTo(replyTo?: ChatMessageReply) {
    this.state = { ...this.state, replyTo }
    this.emit()
  }

  toggleImagePicker() {
    this.state = {
      ...this.state,
      showImagePicker: !this.state.showImagePicker,
      showEmojiPicker: false
    }
    this.emit()
  }

  setShowImagePicker(showImagePicker: boolean) {
    this.state = { ...this.state, showImagePicker }
    this.emit()
  }

  toggleEmojiPicker() {
    this.state = {
      ...this.state,
      showEmojiPicker: !this.state.showEmojiPicker,
      showImagePicker: false
    }
    this.emit()
  }

  setShowEmojiPicker(showEmojiPicker: boolean) {
    this.state = { ...this.state, showEmojiPicker }
    this.emit()
  }

  setShowMentionPicker(showMentionPicker: boolean) {
    this.state = {
      ...this.state,
      showMentionPicker,
      mentionQuery: showMentionPicker ? this.state.mentionQuery : ''
    }
    this.emit()
  }

  setEmojiCategory(emojiCategory: string) {
    this.state = { ...this.state, emojiCategory }
    this.emit()
  }

  setEmojiSearch(emojiSearch: string) {
    this.state = { ...this.state, emojiSearch }
    this.emit()
  }

  toggleAttachment(attachment: ChatAttachment) {
    this.state = {
      ...this.state,
      selectedAttachments: toggleSelectedAttachment(this.state.selectedAttachments, attachment)
    }
    this.emit()
  }

  removeAttachment(id: string) {
    this.state = {
      ...this.state,
      selectedAttachments: this.state.selectedAttachments.filter((attachment) => attachment.id !== id)
    }
    this.emit()
  }

  clearAttachments() {
    this.state = { ...this.state, selectedAttachments: [] }
    this.emit()
  }

  insertEmoji(emoji: string) {
    this.state = {
      ...this.state,
      input: `${this.state.input}${emoji}`
    }
    this.emit()
  }

  insertMention(participant: ChatParticipant, cursorPos = this.state.input.length) {
    const textUpToCursor = this.state.input.slice(0, cursorPos)
    const atMatch = textUpToCursor.match(/@(\S*)$/)
    if (!atMatch) {
      return
    }

    const start = cursorPos - atMatch[0].length
    const nick = this.chat.type === 'muc' ? participant.handle.split('@')[0] : participant.name.split(' ')[0]
    const replacement = `@${nick} `
    const nextInput = this.state.input.slice(0, start) + replacement + this.state.input.slice(cursorPos)

    this.state = {
      ...this.state,
      input: nextInput,
      mentionQuery: '',
      showMentionPicker: false
    }
    this.emit()
  }

  async sendMessage() {
    const body = this.state.input.trim()
    const attachments = this.state.selectedAttachments
    const replyTo = this.state.replyTo
    const thread = this.state.thread ?? replyTo?.messageId
    const quotedBody = replyTo ? buildQuotedBody(replyTo, body) : body

    if (!quotedBody && attachments.length === 0) {
      return false
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const message = buildOutgoingMessage(quotedBody, attachments, timestamp, thread)
    const nextMessages = [...this.state.messages, message]

    if (this.runtime?.sendChatMessage) {
      try {
        const bridgeId = await this.runtime.sendChatMessage(this.chat, quotedBody, {
          attachments,
          reply: replyTo ? { id: replyTo.messageId, to: replyTo.to } : undefined,
          thread
        })
        nextMessages[nextMessages.length - 1] = { ...message, id: bridgeId, delivered: true }
      } catch {
        nextMessages[nextMessages.length - 1] = { ...message, delivered: false }
      }
    }

    this.state = {
      ...this.state,
      messages: nextMessages,
      input: '',
      showImagePicker: false,
      showEmojiPicker: false,
      showMentionPicker: false,
      mentionQuery: '',
      emojiSearch: '',
      selectedAttachments: [],
      replyTo: undefined,
      thread: undefined
    }
    this.emit()
    return true
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

function buildOutgoingMessage(body: string, attachments: ChatAttachment[], timestamp: string, thread?: string): ChatMessage {
  return {
    id: `new-${Date.now()}`,
    senderId: ME,
    senderName: 'You',
    content: body || `Sent ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}`,
    timestamp,
    thread,
    delivered: false,
    kind: attachments.length > 0 && attachments.every((asset) => asset.kind === 'image')
      ? 'image'
      : attachments.length > 0
        ? 'file'
        : 'text',
    fileName: attachments.length > 0 ? attachments.map((asset) => asset.alt).join(', ') : undefined
  }
}

function buildQuotedBody(replyTo: ChatMessageReply, body: string): string {
  const lines: string[] = []
  const senderLine = replyTo.senderName ? `> ${replyTo.senderName}` : '> Quoted message'
  lines.push(senderLine)

  const quotedContent = (replyTo.content ?? '').trim()
  if (quotedContent) {
    for (const line of quotedContent.split('\n')) {
      lines.push(`> ${line}`)
    }
  } else {
    lines.push('> Referenced message')
  }

  if (body) {
    lines.push('', body)
  }

  return lines.join('\n')
}

function toggleSelectedAttachment(selectedAttachments: ChatAttachment[], attachment: ChatAttachment) {
  if (selectedAttachments.find((entry) => entry.id === attachment.id)) {
    return selectedAttachments.filter((entry) => entry.id !== attachment.id)
  }

  if (selectedAttachments.length >= MAX_ATTACHMENTS) {
    return selectedAttachments
  }

  return [...selectedAttachments, attachment]
}
