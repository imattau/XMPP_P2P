export type ChatType = 'direct' | 'group' | 'muc'

export interface ChatParticipant {
  id: string
  name: string
  handle: string
  avatar?: string
  server: string
  online?: boolean
  role?: 'owner' | 'admin' | 'moderator' | 'member' | 'visitor'
}

export interface ChatMessageReaction {
  emoji: string
  count: number
  mine?: boolean
}

export interface ChatMessageAttachment {
  id: string
  url: string
  alt: string
  kind: 'image' | 'file'
}

export interface ChatMessageReply {
  messageId: string
  senderName?: string
  content?: string
  to?: string
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  senderAvatar?: string
  content: string
  timestamp: string
  kind?: 'text' | 'image' | 'file' | 'audio' | 'system'
  delivered?: boolean
  read?: boolean
  reactions?: ChatMessageReaction[]
  replyTo?: ChatMessageReply
  thread?: string
  fileName?: string
  attachments?: ChatMessageAttachment[]
}

export interface ChatAttachment {
  id: string
  url: string
  alt: string
  kind: 'image' | 'file'
}

export interface ChatThread {
  id: string
  type: ChatType
  name: string
  handle?: string
  avatar?: string
  server?: string
  subject?: string
  participants: ChatParticipant[]
  encrypted: boolean
  muted?: boolean
  online?: boolean
  verified?: boolean
  memberCount?: number
  persistent?: boolean
  moderated?: boolean
  anonymous?: boolean
  passwordProtected?: boolean
  memberOnly?: boolean
  archived?: boolean
}

export interface ChatComposerState {
  messages: ChatMessage[]
  input: string
  replyTo?: ChatMessageReply
  thread?: string
  editingMessageId?: string
  showImagePicker: boolean
  showEmojiPicker: boolean
  showMentionPicker: boolean
  mentionQuery: string
  emojiCategory: string
  emojiSearch: string
  selectedAttachments: ChatAttachment[]
}

export type ChatBridgeTarget = Pick<ChatThread, 'id' | 'type' | 'name'> & {
  handle?: string
  server?: string
  subject?: string
}
