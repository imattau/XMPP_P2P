import { afterEach, describe, expect, it } from 'vitest'
import { createGroupChatSession, getGroupChatSession, removeGroupChatSession } from '../pages/chat-session'

describe('XMPP room sessions', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('persists the full server room JID and identifies a join accurately', () => {
    const roomJid = 'lobby@conference.example.org'
    const session = createGroupChatSession('lobby', [], roomJid, {
      encrypted: false,
      localJid: 'user@example.org',
      type: 'muc',
      roomJid,
      systemMessage: 'Joined XMPP room',
    })

    expect(session.chat.id).toBe(roomJid)
    expect(session.chat.handle).toBe(roomJid)
    expect(session.chat.server).toBe('conference.example.org')
    expect(session.chat.type).toBe('muc')
    expect(session.chat.encrypted).toBe(false)
    expect(session.messages[0].content).toBe('Joined XMPP room')
    expect(getGroupChatSession(roomJid)).toEqual(session)

    removeGroupChatSession(roomJid)
    expect(getGroupChatSession(roomJid)).toBeUndefined()
  })
})
