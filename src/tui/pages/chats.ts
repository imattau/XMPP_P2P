import blessed from 'blessed'
import { TuiState } from '../bridge.js'

export const createChatsPage = (
  parent: blessed.Widgets.BoxElement,
  state: TuiState,
  onOpenChat: (jid: string) => void
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
    content: '{bold}Chats{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const chatList = blessed.list({
    parent: box,
    top: 2,
    left: 1,
    right: 1,
    bottom: 1,
    items: [],
    style: {
      selected: { fg: 'white', bg: 'blue' },
      item: { fg: 'white', bg: 'black' },
    },
    tags: true,
    vi: true,
    keys: true,
    mouse: true,
  })

  chatList.on('select', (_item: any, index: number) => {
    const chat = state.chats[index]
    if (chat) onOpenChat(chat.jid)
  })

  const mount = () => { box.hidden = false }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    const items = s.chats.length === 0
      ? ['{yellow-fg}No conversations yet.{/yellow-fg}']
      : s.chats.map(c => {
          const status = c.online ? '{green-fg}●{/green-fg}' : '{red-fg}○{/red-fg}'
          const unread = c.unread > 0 ? ` {yellow-fg}(${c.unread}){/yellow-fg}` : ''
          const last = c.lastMessage ? c.lastMessage.slice(0, 40) : ''
          return ` ${status} {bold}${c.name}{/bold}${unread}\n   ${last}`
        })
    chatList.setItems(items)
  }

  const focus = () => chatList.focus()

  return { box, mount, unmount, update, focus }
}
