import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { XmppRuntimeBridge } from '../bridge/runtime'
import { ChatBridgeController } from '../bridge/chat/controller'
import { getPendingMessages } from '../lib/message-queue'
import { loadDirectChatHistory } from '../bridge/direct-chat-history'
import { createGroupChatSession, getGroupChatSession } from '../pages/chat-session'
import type { ChatThread } from '../bridge/chat/types'

describe('ChatBridgeController', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('xmpp-p2p:identity', JSON.stringify({ jid: 'test@example.org' }))
  })

  it('queues a standard XMPP message after a transient send failure even while the server reports connected', async () => {
    const sendChatMessage = vi.fn().mockRejectedValue(new Error('Temporary socket write failure'))
    const runtime = {
      sendChatMessage,
      isServerConnected: () => true,
    } as unknown as XmppRuntimeBridge
    const controller = new ChatBridgeController({
      id: 'alice@example.org',
      type: 'direct',
      name: 'Alice',
      handle: 'alice@example.org',
      participants: [],
      encrypted: false,
    }, [], runtime)

    controller.setInput('Please retry this message')
    expect(await controller.sendMessage()).toBe(true)
    expect(controller.getState().messages[0]).toMatchObject({
      content: 'Please retry this message',
      delivered: false,
    })
    expect(getPendingMessages()).toHaveLength(1)
    expect(getPendingMessages()[0]).toMatchObject({
      target: 'alice@example.org',
      body: 'Please retry this message',
      encrypted: false,
    })

    controller.dispose()
  })

  it('marks an outgoing message failed when the XMPP server returns a stanza error', async () => {
    let onMessage: ((message: any) => void) | undefined
    const runtime = {
      sendChatMessage: vi.fn().mockResolvedValue('client-message-1'),
      onMessage: (listener: (message: any) => void) => {
        onMessage = listener
        return () => { onMessage = undefined }
      },
      getLocalJid: () => 'test@example.org',
    } as unknown as XmppRuntimeBridge
    const controller = new ChatBridgeController({
      id: 'alice@example.org',
      type: 'direct',
      name: 'Alice',
      handle: 'alice@example.org',
      participants: [],
      encrypted: false,
    }, [], runtime)

    controller.setInput('Please deliver this')
    await controller.sendMessage()
    expect(controller.getState().messages[0]).toMatchObject({
      id: 'client-message-1',
      delivered: true,
    })

    onMessage?.({
      id: 'client-message-1',
      from: 'example.org',
      to: 'test@example.org',
      body: '',
      type: 'error',
      stanzaError: { condition: 'service-unavailable' },
    })

    expect(controller.getState().messages[0]).toMatchObject({
      id: 'client-message-1',
      delivered: false,
    })
    expect(loadDirectChatHistory('alice@example.org')[0]).toMatchObject({
      id: 'client-message-1',
      delivered: false,
    })
    controller.dispose()
  })

  it('adds and removes XMPP room occupants from the visible group session', () => {
    const roomJid = 'lobby@conference.example.org'
    const session = createGroupChatSession('Lobby', [], roomJid, {
      type: 'muc',
      roomJid,
      localJid: 'test@example.org',
      encrypted: false,
    })
    let onJoin: ((event: any) => void) | undefined
    let onLeave: ((event: any) => void) | undefined
    const runtime = {
      getLocalJid: () => 'test@example.org@p2p',
      getMucParticipants: () => [],
      onMucJoin: (listener: (event: any) => void) => { onJoin = listener; return () => { onJoin = undefined } },
      onMucLeave: (listener: (event: any) => void) => { onLeave = listener; return () => { onLeave = undefined } },
    } as unknown as XmppRuntimeBridge
    const controller = new ChatBridgeController(session.chat as unknown as ChatThread, [], runtime)

    onJoin?.({
      room: roomJid,
      from: `${roomJid}/alice`,
      nick: 'alice',
      occupantJid: 'alice@example.org/resource',
      peerJid: 'alice@example.org/resource',
      server: 'conference.example.org',
      role: 'participant',
    })
    expect(getGroupChatSession(roomJid)?.chat).toMatchObject({
      memberCount: 2,
      participants: expect.arrayContaining([expect.objectContaining({ name: 'alice', online: true })]),
    })

    onLeave?.({ room: roomJid, from: `${roomJid}/alice`, nick: 'alice', server: 'conference.example.org' })
    expect(getGroupChatSession(roomJid)?.chat).toMatchObject({ memberCount: 1 })
    expect(getGroupChatSession(roomJid)?.chat.participants.some((participant) => participant.name === 'alice')).toBe(false)
    controller.dispose()
  })
})
