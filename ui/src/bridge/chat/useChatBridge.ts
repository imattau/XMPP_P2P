import { useEffect, useMemo, useState } from 'react'
import { getBrowserXmppBridge } from '../runtime'
import type { ChatComposerState, ChatMessage, ChatMessageReply, ChatParticipant, ChatThread } from './types'
import { ChatBridgeController } from './controller'

export function useChatBridge(chat: ChatThread, initialMessages: ChatMessage[]) {
  const controller = useMemo(
    () => new ChatBridgeController(chat, initialMessages, getBrowserXmppBridge()),
    [chat, initialMessages]
  )
  const [state, setState] = useState<ChatComposerState>(controller.getState())

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    return () => { unsubscribe() }
  }, [controller])

  const mentionableContacts = controller.getMentionableContacts()
  const filteredMentions = getFilteredMentions(mentionableContacts, state.mentionQuery)

  return {
    ...state,
    mentionableContacts,
    filteredMentions,
    typingPeer: controller.getTypingPeer(),
    handleInputChange: (value: string, cursorPos?: number) => controller.setInput(value, cursorPos),
    setInput: (value: string) => controller.setInput(value),
    insertMention: (participant: ChatParticipant, cursorPos?: number) => controller.insertMention(participant, cursorPos),
    insertEmoji: (emoji: string) => controller.insertEmoji(emoji),
    toggleAttachment: (attachment: ChatComposerState['selectedAttachments'][number]) => controller.toggleAttachment(attachment),
    removeAttachment: (id: string) => controller.removeAttachment(id),
    clearAttachments: () => controller.clearAttachments(),
    setShowImagePicker: (showImagePicker: boolean) => controller.setShowImagePicker(showImagePicker),
    toggleImagePicker: () => controller.toggleImagePicker(),
    setShowEmojiPicker: (showEmojiPicker: boolean) => controller.setShowEmojiPicker(showEmojiPicker),
    toggleEmojiPicker: () => controller.toggleEmojiPicker(),
    setShowMentionPicker: (showMentionPicker: boolean) => controller.setShowMentionPicker(showMentionPicker),
    setEmojiCategory: (emojiCategory: string) => controller.setEmojiCategory(emojiCategory),
    setEmojiSearch: (emojiSearch: string) => controller.setEmojiSearch(emojiSearch),
    setReplyTo: (replyTo?: ChatMessageReply) => controller.setReplyTo(replyTo),
    sendMessage: () => controller.sendMessage(),
    startEdit: (messageId: string) => controller.startEdit(messageId),
    cancelEdit: () => controller.cancelEdit(),
  }
}

function getFilteredMentions(contacts: ChatParticipant[], mentionQuery: string) {
  if (!mentionQuery) {
    return []
  }

  const normalized = mentionQuery.toLowerCase()
  return contacts.filter((participant) =>
    participant.name.toLowerCase().includes(normalized) ||
    participant.handle.toLowerCase().includes(normalized)
  )
}
