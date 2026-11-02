import type { XmppRuntimeBridge } from '../runtime'
import type { ChatAttachment, ChatComposerState, ChatMessage, ChatMessageReply, ChatParticipant, ChatThread } from './types'
import { getMessageKind, parseAttachmentReferences } from './attachments'
import { emitToast } from '../../lib/toast-events'
import { canonicalDirectChatId, replaceDirectChatMessage, saveDirectChatMessage } from '../direct-chat-history'
import { isActiveGroupChat, updateGroupChatSession } from '../../pages/chat-session'
import { enqueueMessage, isMessageQueued } from '../../lib/message-queue'

type Listener = (state: ChatComposerState) => void

const ME = 'me'
const MAX_ATTACHMENTS = 4

function bareJid(value?: string): string {
  // XMPP JIDs are case mapped for comparison; resources are deliberately
  // ignored for one-to-one chat routing.
  return canonicalDirectChatId(value ?? '')
}

export class ChatBridgeController {
  private state: ChatComposerState
  private listeners = new Set<Listener>()
  private chatStateTimeout?: ReturnType<typeof setTimeout>
  private lastSentState?: string
  private typingPeer: string | undefined
  private sendingMessage = false
  private runtimeUnsubscribers: Array<() => void> = []

  constructor(
    private chat: ChatThread,
    initialMessages: ChatMessage[],
    private readonly runtime?: XmppRuntimeBridge
  ) {
    this.state = {
      messages: initialMessages.map((message) => ({ ...message })),
      input: '',
      sending: false,
      replyTo: undefined,
      thread: undefined,
      editingMessageId: undefined,
      showImagePicker: false,
      showEmojiPicker: false,
      showMentionPicker: false,
      mentionQuery: '',
      emojiCategory: 'recent',
      emojiSearch: '',
      selectedAttachments: []
    }

    if (runtime?.onChatState) {
      this.runtimeUnsubscribers.push(runtime.onChatState(({ from, state: chatState }) => {
        const peerJid = this.chat.handle || this.chat.id
        if (bareJid(from) === bareJid(peerJid) || bareJid(from) === bareJid(this.chat.id)) {
          this.typingPeer = chatState === 'composing' ? from : undefined
          this.chat = {
            ...this.chat,
            online: chatState === 'composing' ? true : this.chat.online
          }
          this.emit()
        }
      }))
    }

    if (runtime?.onMessage) {
      this.runtimeUnsubscribers.push(runtime.onMessage((incoming) => {
        const peerJid = this.chat.handle || this.chat.id
        if (incoming.type === 'error' || incoming.stanzaError) {
          let failedMessage: ChatMessage | undefined
          this.state = {
            ...this.state,
            messages: this.state.messages.map((message) => {
              if (message.id !== incoming.id || message.senderId !== ME) return message
              failedMessage = { ...message, delivered: false, receiptReceived: false }
              return failedMessage
            }),
          }
          if (failedMessage) {
            // A server rejection must be able to reverse the optimistic
            // "sent" state. The ordinary save path preserves true delivery
            // flags when merging history, so replace this record exactly.
            this.persistReplacement(failedMessage.id, failedMessage)
            const detail = incoming.stanzaError?.text || incoming.stanzaError?.condition?.replace(/-/g, ' ')
            emitToast(detail ? `XMPP server rejected the message: ${detail}` : 'XMPP server rejected the message. Tap Retry to try again.', 'error')
            this.emit()
          }
          return
        }
        if (bareJid(incoming.from) === bareJid(peerJid) || bareJid(incoming.to) === bareJid(peerJid)) {
          if (incoming.receipt?.type === 'received') {
            let deliveredMessage: ChatMessage | undefined
            this.state = {
              ...this.state,
              messages: this.state.messages.map((message) => {
                if (message.id !== incoming.receipt!.id) return message
                deliveredMessage = { ...message, delivered: true, receiptReceived: true }
                return deliveredMessage
              }),
            }
            if (deliveredMessage) this.persistMessage(deliveredMessage)
            this.emit()
            return
          }
          if (!incoming.body) return
          if (this.state.messages.some((m) => m.id === incoming.id)) return
          const fromSelf = incoming.fromSelf ?? Boolean(runtime.getLocalJid?.() && bareJid(incoming.from) === bareJid(runtime.getLocalJid?.()))
          const parsed = parseAttachmentReferences(incoming.body)
          const msg: ChatMessage = {
            id: incoming.id,
            senderId: fromSelf ? ME : bareJid(incoming.from),
            senderName: fromSelf ? 'You' : bareJid(incoming.from).split('@')[0],
            content: parsed.content,
            timestamp: incoming.delay?.stamp
              ? new Date(incoming.delay.stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            activityAt: incoming.delay?.stamp ?? new Date().toISOString(),
            kind: getMessageKind(parsed.attachments),
            thread: incoming.thread,
            delivered: true,
            encrypted: incoming.encrypted ?? false,
            replyTo: incoming.reply ? { messageId: incoming.reply.id, to: incoming.reply.to } : undefined,
            fileName: parsed.attachments.length > 0 ? parsed.attachments.map((attachment) => attachment.alt).join(', ') : undefined,
            attachments: parsed.attachments.length > 0 ? parsed.attachments : undefined,
          }
          if (incoming.replace) {
            const hasOriginal = this.state.messages.some((message) => message.id === incoming.replace)
            this.state = {
              ...this.state,
              messages: hasOriginal
                ? this.state.messages.map((message) => message.id === incoming.replace ? msg : message)
                : [...this.state.messages, msg],
            }
            this.persistReplacement(incoming.replace, msg)
            this.emit()
            return
          }
          this.state = {
            ...this.state,
            messages: [...this.state.messages, msg]
          }
          this.persistMessage(msg)
          this.emit()
        }
      }))
    }

    if (runtime?.onPresence) {
      this.runtimeUnsubscribers.push(runtime.onPresence((presence) => {
        const isAvailable = presence.type !== 'unavailable'
        const updatedParticipants = this.chat.participants.map((p) => {
          if (bareJid(p.handle) === bareJid(presence.from) || bareJid(p.id) === bareJid(presence.from)) {
            return { ...p, online: isAvailable }
          }
          return p
        })
        this.chat = { ...this.chat, participants: updatedParticipants }
        this.emit()
      }))
    }

    if (runtime?.onMucMessage && (chat.type === 'group' || chat.type === 'muc')) {
      this.runtimeUnsubscribers.push(runtime.onMucMessage((incoming: any) => {
        const roomName = this.chat.id.replace(/@muc\.p2p$/, '')
        if (incoming.room !== roomName && incoming.roomJid !== this.chat.handle) return
        const localJid = runtime.getLocalJid?.()
        if ((incoming.fromSelf && !incoming.mam) || (localJid && (incoming.peerJid === localJid || (!incoming.peerJid && incoming.from === localJid.split('@')[0])))) return
        if (!incoming.body || this.state.messages.some((message) => message.id === incoming.id)) return
        const parsed = parseAttachmentReferences(incoming.body)
        const messageTimestamp = incoming.timestamp || incoming.delay?.stamp
        const timestamp = messageTimestamp
          ? new Date(messageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const message: ChatMessage = {
          id: incoming.id,
          senderId: incoming.fromSelf ? ME : incoming.peerJid ?? incoming.fromPeerId ?? incoming.from,
          senderName: incoming.fromSelf ? 'You' : incoming.nick ?? incoming.fromPeerId ?? incoming.from ?? 'Participant',
          content: parsed.content,
          timestamp,
          kind: getMessageKind(parsed.attachments),
          delivered: true,
          read: isActiveGroupChat(roomName),
          thread: incoming.thread,
          replyTo: incoming.reply ? { messageId: incoming.reply.id, to: incoming.reply.to } : undefined,
          encrypted: incoming.encrypted ?? false,
          fileName: parsed.attachments.length > 0 ? parsed.attachments.map((attachment) => attachment.alt).join(', ') : undefined,
          attachments: parsed.attachments.length > 0 ? parsed.attachments : undefined,
        }
        if (incoming.replace) {
          const hasOriginal = this.state.messages.some((entry) => entry.id === incoming.replace)
          this.state = {
            ...this.state,
            messages: hasOriginal
              ? this.state.messages.map((entry) => entry.id === incoming.replace ? message : entry)
              : [...this.state.messages, message],
          }
          this.persistReplacement(incoming.replace, message)
        } else {
          this.state = {
            ...this.state,
            messages: [...this.state.messages, message],
          }
          this.persistMessage(message)
        }
        this.emit()
      }))
    }

    if (runtime && (chat.type === 'group' || chat.type === 'muc')) {
      const roomName = chat.id.replace(/@muc\.p2p$/, '')
      const currentOccupants = runtime.getMucParticipants?.(roomName) ?? []
      currentOccupants.forEach((occupant) => this.updateMucParticipant({
        room: roomName,
        nick: occupant.nick,
        peerId: occupant.peerId,
        peerJid: occupant.jid,
      }, true))

      if (runtime.onMucJoin) {
        this.runtimeUnsubscribers.push(runtime.onMucJoin((event: any) => {
          if (event.room === roomName) this.updateMucParticipant(event, true)
        }))
      }
      if (runtime.onMucLeave) {
        this.runtimeUnsubscribers.push(runtime.onMucLeave((event: any) => {
          if (event.room === roomName) this.updateMucParticipant(event, false)
        }))
      }
    }

    if (typeof window !== 'undefined') {
      const onOutboxDelivered = (event: Event) => {
        const detail = (event as CustomEvent<{ chatId: string; oldMessageId: string; deliveredId: string }>).detail
        if (!detail || canonicalDirectChatId(detail.chatId) !== canonicalDirectChatId(this.chat.handle || this.chat.id)) return
        let updated = false
        const messages = this.state.messages.map((message) => {
          if (message.id !== detail.oldMessageId) return message
          updated = true
          return { ...message, id: detail.deliveredId, delivered: true }
        })
        if (!updated) return
        this.state = { ...this.state, messages }
        this.emit()
      }
      window.addEventListener('xmpp-p2p:outbox-message-delivered', onOutboxDelivered)
      this.runtimeUnsubscribers.push(() => window.removeEventListener('xmpp-p2p:outbox-message-delivered', onOutboxDelivered))
    }
  }

  getState() {
    return this.state
  }

  updateChat(chat: ChatThread, initialMessages: ChatMessage[]) {
    this.chat = chat
    const existing = new Map(this.state.messages.map((message) => [message.id, message]))
    const synchronized = initialMessages.map((message) => ({ ...existing.get(message.id), ...message }))
    const persistedIds = new Set(synchronized.map((message) => message.id))
    const unsavedMessages = this.state.messages.filter((message) =>
      message.senderId === ME && message.delivered === false && !persistedIds.has(message.id)
    )
    this.state = { ...this.state, messages: [...synchronized, ...unsavedMessages] }
    this.emit()
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

    if (this.runtime?.sendChatState && this.chat.handle) {
      if (value && this.lastSentState !== 'composing') {
        this.lastSentState = 'composing'
        if (this.chat.type === 'group' || this.chat.type === 'muc') {
          void this.runtime.sendMucChatState(this.chat.id, 'composing').catch(() => {})
        } else void this.runtime.sendChatState(this.chat.handle, 'composing').catch(() => {})
      }
      if (this.chatStateTimeout) clearTimeout(this.chatStateTimeout)
      this.chatStateTimeout = setTimeout(() => {
        if (this.lastSentState === 'composing' && this.runtime?.sendChatState && this.chat.handle) {
          this.lastSentState = 'paused'
          if (this.chat.type === 'group' || this.chat.type === 'muc') {
            void this.runtime.sendMucChatState(this.chat.id, 'paused').catch(() => {})
          } else void this.runtime.sendChatState(this.chat.handle, 'paused').catch(() => {})
        }
      }, 2000)
    }
  }

  getTypingPeer(): string | undefined {
    return this.typingPeer
  }

  dispose() {
    if (this.chatStateTimeout) clearTimeout(this.chatStateTimeout)
    this.runtimeUnsubscribers.forEach((unsubscribe) => unsubscribe())
    this.runtimeUnsubscribers = []
  }

  private updateMucParticipant(event: any, online: boolean) {
    const peerJid = String(event.peerJid ?? event.jid ?? event.occupantJid ?? event.from ?? (event.peerId ? `${event.peerId}@p2p` : ''))
    if (!peerJid) return
    const localJid = this.runtime?.getLocalJid?.()
    const isSelf = event.fromSelf === true || peerJid === localJid
    const participantId = isSelf ? ME : peerJid
    const roomServer = event.room ? String(event.room).split('@')[1]?.split('/')[0] : undefined
    const existing = this.chat.participants.find((participant) => participant.id === participantId
      || participant.handle === peerJid
      || (Boolean(event.nick) && participant.name === event.nick && participant.server === (event.server || roomServer)))
    let participants: ChatParticipant[]
    if (!online) {
      participants = this.chat.participants.filter((participant) => participant.id !== participantId
        && participant.handle !== peerJid
        && !(Boolean(event.nick) && participant.name === event.nick && participant.server === (event.server || roomServer)))
    } else {
      const role = event.affiliation === 'owner' ? 'owner'
        : event.affiliation === 'admin' ? 'admin'
          : event.role === 'moderator' ? 'moderator'
            : event.role === 'visitor' ? 'visitor'
              : existing?.role ?? 'member'
      const participant: ChatParticipant = {
        ...existing,
        id: participantId,
        name: isSelf ? 'You' : String(event.nick ?? existing?.name ?? peerJid.split('@')[0]),
        handle: peerJid,
        server: event.server || roomServer || peerJid.split('@')[1]?.split('/')[0] || 'p2p',
        online: true,
        role,
      }
      participants = [...this.chat.participants.filter((entry) => entry.id !== participantId && entry.handle !== peerJid), participant]
    }

    const memberCount = participants.length
    const memberCountLabel = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
    const subject = `${this.chat.server === 'muc.p2p' ? 'P2P group room' : 'XMPP room'} · ${memberCountLabel}`
    this.chat = { ...this.chat, participants, memberCount, subject }
    updateGroupChatSession(this.chat.id, (session) => ({
      ...session,
      chat: { ...session.chat, participants, memberCount, subject },
    }))
    this.emit()
  }

  setReplyTo(replyTo?: ChatMessageReply) {
    this.state = { ...this.state, replyTo }
    this.emit()
  }

  startEdit(messageId: string) {
    const msg = this.state.messages.find((m) => m.id === messageId)
    if (!msg || msg.senderId !== 'me') return
    this.state = {
      ...this.state,
      editingMessageId: messageId,
      input: msg.content,
      selectedAttachments: msg.attachments?.map((attachment) => ({ ...attachment })) ?? [],
      replyTo: undefined,
      showImagePicker: false,
      showEmojiPicker: false,
      showMentionPicker: false,
    }
    this.emit()
  }

  cancelEdit() {
    this.state = {
      ...this.state,
      editingMessageId: undefined,
      input: '',
      selectedAttachments: [],
    }
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

  insertMention(participant: ChatParticipant, cursorPos = this.state.input.length): number | undefined {
    const textUpToCursor = this.state.input.slice(0, cursorPos)
    const atMatch = textUpToCursor.match(/@(\S*)$/)
    if (!atMatch) {
      return undefined
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
    return start + replacement.length
  }

  async sendMessage() {
    if (this.sendingMessage) return false
    this.sendingMessage = true
    this.state = { ...this.state, sending: true }
    this.emit()
    try {
      return await this.sendMessageOnce()
    } finally {
      this.sendingMessage = false
      this.state = { ...this.state, sending: false }
      this.emit()
    }
  }

  private async sendMessageOnce() {
    const body = this.state.input.trim()
    const attachments = this.state.selectedAttachments
    const replyTo = this.state.replyTo
    const thread = this.state.thread ?? replyTo?.messageId
    const editingMessageId = this.state.editingMessageId
    const quotedBody = replyTo ? buildQuotedBody(replyTo, body) : body

    if (!quotedBody && attachments.length === 0) {
      return false
    }

    const target = this.chat.handle || this.chat.id
    const externalXmppTarget = this.chat.type === 'direct'
      && target.includes('@')
      && !target.toLowerCase().split('/')[0].endsWith('@p2p')
    if (externalXmppTarget && attachments.some((attachment) => /^(?:upload|p2p-upload):\/\//i.test(attachment.url))) {
      emitToast('This file is stored on the P2P network and cannot be opened by a standard XMPP contact. Send a public HTTPS link instead.', 'error')
      return false
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (editingMessageId) {
      if (this.runtime?.sendChatMessage) {
        const originalMessage = this.state.messages.find((message) => message.id === editingMessageId)
        const encrypted = originalMessage?.encrypted ?? this.chat.encrypted
        try {
          const replacementId = await this.runtime.sendChatMessage({ ...this.chat, encrypted }, quotedBody, {
            attachments,
            thread,
            replace: editingMessageId,
          })
          const editedKind = getMessageKind(attachments)
          const editedMessage: ChatMessage = {
            ...(originalMessage ?? buildOutgoingMessage(quotedBody, attachments, timestamp, thread, replyTo, encrypted)),
            id: replacementId,
            content: quotedBody,
            timestamp,
            encrypted,
            delivered: true,
            kind: editedKind,
            fileName: attachments.length > 0 ? attachments.map((attachment) => attachment.alt).join(', ') : undefined,
            attachments: attachments.length > 0 ? attachments.map((attachment) => ({ ...attachment })) : undefined,
          }
          this.state = {
            ...this.state,
            messages: this.state.messages.map((m) => m.id === editingMessageId ? editedMessage : m),
            input: '',
            editingMessageId: undefined,
            selectedAttachments: [],
          }
          if (!this.persistReplacement(editingMessageId, editedMessage)) {
            emitToast('Message was edited, but the updated local chat history could not be saved.', 'error')
          }
          this.emit()
        } catch (error) {
          emitToast(error instanceof Error ? error.message : 'Failed to edit message', 'error')
          return false
        }
      } else {
        emitToast('Peer network is unavailable. Reconnect before editing messages.', 'error')
        return false
      }
      return true
    }

    const encryptionRequested = this.chat.encrypted
    const message = buildOutgoingMessage(quotedBody, attachments, timestamp, thread, replyTo, encryptionRequested)
    const nextMessages = [...this.state.messages, message]

    if (this.runtime?.sendChatMessage) {
      try {
        const bridgeId = await this.runtime.sendChatMessage(this.chat, quotedBody, {
          originId: message.id,
          attachments,
          reply: replyTo ? { id: replyTo.messageId, to: replyTo.to } : undefined,
          thread
        })
        nextMessages[nextMessages.length - 1] = { ...message, id: bridgeId, delivered: true }
      } catch (error) {
        nextMessages[nextMessages.length - 1] = { ...message, delivered: false }
        const target = this.chat.handle || this.chat.id
        const externalXmppTarget = this.chat.type === 'direct'
          && target.includes('@')
          && !target.toLowerCase().split('/')[0].endsWith('@p2p')
        if (externalXmppTarget && !encryptionRequested) {
          const queued = enqueueMessage({
            id: message.id,
            chatId: target,
            target,
            peerAddress: this.chat.peerAddress,
            name: this.chat.name,
            body: quotedBody,
            encrypted: false,
            attachments: attachments.length > 0 ? attachments.map((attachment) => ({ ...attachment })) : undefined,
            reply: replyTo ? { id: replyTo.messageId, to: replyTo.to } : undefined,
            thread,
          })
          const queueMessage = this.runtime.isServerConnected()
            ? 'Message queued. It will retry automatically.'
            : 'Message queued. It will send automatically when your XMPP server connection is available.'
          emitToast(queued
            ? queueMessage
            : 'Could not queue this message. It is still visible here; tap Retry after reconnecting.', queued ? 'info' : 'error')
        } else {
          const reason = error instanceof Error ? ` ${error.message}` : ''
          emitToast(encryptionRequested
            ? `Encrypted send failed.${reason} The message was not sent without encryption.`
            : `Failed to send message.${reason}`, 'error')
        }
      }
    } else {
      const target = this.chat.handle || this.chat.id
      const externalXmppTarget = target.includes('@') && !target.toLowerCase().split('/')[0].endsWith('@p2p')
      if (this.chat.type === 'direct' && externalXmppTarget && encryptionRequested) {
        emitToast('OMEMO direct messaging is supported only for P2P contacts. This message was not queued or sent without encryption.', 'error')
      } else if (this.chat.type === 'direct') {
        const waitingOn = externalXmppTarget ? 'XMPP server connection' : 'peer network connection'
        const queued = enqueueMessage({
          id: message.id,
          chatId: target,
          target,
          peerAddress: this.chat.peerAddress,
          name: this.chat.name,
          body: quotedBody,
          encrypted: encryptionRequested,
          attachments: attachments.length > 0 ? attachments.map((attachment) => ({ ...attachment })) : undefined,
          reply: replyTo ? { id: replyTo.messageId, to: replyTo.to } : undefined,
          thread,
        })
        emitToast(queued
          ? `Message queued. It will send automatically when your ${waitingOn} is available.`
          : 'Automatic retry could not be set up. This message is still visible here; tap Retry after reconnecting.', queued ? 'info' : 'error')
      } else {
          emitToast('Peer network is unavailable. This message is visible here; tap Retry after reconnecting.', 'error')
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
      thread: undefined,
      editingMessageId: undefined,
    }
    if (!this.persistMessage(nextMessages[nextMessages.length - 1])) {
      emitToast('Message is visible in this chat but could not be saved to local history. Check browser storage.', 'error')
    }
    this.emit()
    return true
  }

  async retryMessage(messageId: string) {
    const message = this.state.messages.find((entry) => entry.id === messageId)
    if (!message || message.senderId !== ME || message.delivered !== false) return false
    const target = this.chat.handle || this.chat.id
    const externalXmppTarget = this.chat.type === 'direct'
      && target.includes('@')
      && !target.toLowerCase().split('/')[0].endsWith('@p2p')
    const connectionName = externalXmppTarget ? 'XMPP server connection' : 'peer network connection'
    if (isMessageQueued(messageId)) {
      emitToast(`This message is queued and will send when your ${connectionName} is available.`, 'info')
      return false
    }
    if (!this.runtime?.sendChatMessage) {
      emitToast(`${externalXmppTarget ? 'XMPP server' : 'Peer network'} is unavailable. Reconnect before retrying.`, 'error')
      return false
    }

    try {
      const bridgeId = await this.runtime.sendChatMessage({ ...this.chat, encrypted: message.encrypted }, message.content, {
        originId: message.id,
        attachments: message.attachments,
        reply: message.replyTo ? { id: message.replyTo.messageId, to: message.replyTo.to } : undefined,
        thread: message.thread,
      })
      const deliveredMessage = {
        ...message,
        id: bridgeId,
        delivered: true,
        encrypted: message.encrypted,
      }
      this.state = {
        ...this.state,
        messages: this.state.messages.map((entry) => entry.id === messageId ? deliveredMessage : entry),
      }
      if (!this.persistReplacement(messageId, deliveredMessage)) {
        emitToast('Message was sent, but the updated local chat history could not be saved.', 'error')
      }
      this.emit()
      return true
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Failed to resend message', 'error')
      return false
    }
  }

  private persistReplacement(oldMessageId: string, message: ChatMessage): boolean {
    if (this.chat.type === 'group' || this.chat.type === 'muc') {
      try {
        return Boolean(updateGroupChatSession(this.chat.id.replace(/@muc\.p2p$/, ''), (session) => ({
          ...session,
          messages: [...session.messages.filter((entry) => entry.id !== oldMessageId && entry.id !== message.id), message] as any,
        })))
      } catch {
        return false
      }
    }
    return replaceDirectChatMessage(this.chat.handle || this.chat.id, oldMessageId, message)
  }

  private persistMessage(message: ChatMessage): boolean {
    if (this.chat.type === 'group' || this.chat.type === 'muc') {
      try {
        return Boolean(updateGroupChatSession(this.chat.id.replace(/@muc\.p2p$/, ''), (session) => ({
          ...session,
          messages: [...session.messages.filter((entry) => entry.id !== message.id), message] as any,
        })))
      } catch {
        return false
      }
    }
    return saveDirectChatMessage(this.chat.handle || this.chat.id, message)
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

function buildOutgoingMessage(body: string, attachments: ChatAttachment[], timestamp: string, thread?: string, replyTo?: ChatMessageReply, encrypted = false): ChatMessage {
  return {
    id: `new-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    senderId: ME,
    senderName: 'You',
    content: body || '',
    timestamp,
    activityAt: new Date().toISOString(),
    thread,
    replyTo,
    encrypted,
    delivered: false,
    kind: getMessageKind(attachments),
    fileName: attachments.length > 0 ? attachments.map((asset) => asset.alt).join(', ') : undefined,
    attachments: attachments.length > 0 ? attachments.map((asset) => ({ ...asset })) : undefined
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
