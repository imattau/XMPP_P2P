import blessed from 'blessed'
import { XmppNode } from '../../core/xmpp-node.js'
import { TuiState } from '../bridge.js'

export const createChatThreadPage = (
  parent: blessed.Widgets.BoxElement,
  state: TuiState,
  xmppNode: XmppNode
) => {
  const box = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: { fg: 'white', bg: 'black' },
    tags: true,
    hidden: true,
  })

  const header = blessed.text({
    parent: box,
    top: 0,
    left: 1,
    width: '100%',
    height: 1,
    content: '{bold}Chat{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const messagesBox = blessed.box({
    parent: box,
    top: 2,
    left: 1,
    right: 1,
    bottom: 4,
    style: { fg: 'white', bg: 'black' },
    tags: true,
    scrollable: true,
    vi: true,
  })

  const input = blessed.textarea({
    parent: box,
    bottom: 1,
    left: 1,
    right: 12,
    height: 3,
    inputOnFocus: true,
    mouse: true,
    style: { fg: 'white', bg: 'blue' },
  })

  const sendBtn = blessed.button({
    parent: box,
    bottom: 1,
    right: 1,
    width: 10,
    height: 3,
    content: ' [Send] ',
    style: { fg: 'white', bg: 'green', focus: { fg: 'white', bg: 'blue' } },
    keys: true,
    mouse: true,
  })

  const statusText = blessed.text({
    parent: box,
    bottom: 0,
    left: 1,
    width: '100%',
    height: 1,
    style: { fg: 'yellow' },
    tags: true,
  })

  const sendMessage = async () => {
    const jid = state.currentChatJid
    if (!jid) { statusText.setContent('{red-fg}No chat selected{/red-fg}'); return }
    const body = input.getValue().trim()
    if (!body) { statusText.setContent('{yellow-fg}Type a message{/yellow-fg}'); return }
    try {
      await xmppNode.sendMessage(jid, body)
      if (!state.messages.has(jid)) state.messages.set(jid, [])
      state.messages.get(jid)!.push({
        id: `local-${Date.now()}`,
        from: 'me',
        body,
        timestamp: new Date().toISOString(),
      })
      input.clearValue()
      statusText.setContent('{green-fg}Sent{/green-fg}')
      update(state)
    } catch (err: any) {
      statusText.setContent(`{red-fg}Error: ${err.message}{/red-fg}`)
    }
  }

  sendBtn.on('press', sendMessage)
  input.on('submit', sendMessage)

  const mount = () => { box.hidden = false; input.focus() }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    const chat = s.chats.find(c => c.jid === s.currentChatJid)
    header.setContent(`{bold}${chat?.name || s.currentChatJid || 'Chat'}{/bold}`)

    const msgs = s.currentChatJid ? s.messages.get(s.currentChatJid) || [] : []
    if (msgs.length === 0) {
      messagesBox.setContent('{yellow-fg}No messages yet.{/yellow-fg}')
    } else {
      const lines = msgs.map(m => {
        const sender = m.from === 'me' ? 'You' : m.nickname || m.from.split('@')[0]
        const time = new Date(m.timestamp).toLocaleTimeString()
        return ` {bold}${sender}{/bold} [${time}]\n ${m.body}`
      })
      messagesBox.setContent(lines.join('\n\n'))
    }

    if (s.currentChatJid) {
      const chatMsgs = s.messages.get(s.currentChatJid) || []
      if (chatMsgs.length > 0) chatMsgs[0].id // force re-render
    }
  }

  const focus = () => input.focus()

  return { box, mount, unmount, update, focus }
}
