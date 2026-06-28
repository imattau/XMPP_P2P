import blessed from 'blessed'
import { XmppNode } from '../../core/xmpp-node.js'
import { TuiState } from '../bridge.js'

export const createNewChatPage = (
  parent: blessed.Widgets.BoxElement,
  state: TuiState,
  xmppNode: XmppNode,
  onStartChat: (jid: string) => void
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
    content: '{bold}New Chat{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  blessed.text({
    parent: box, top: 2, left: 1, height: 1,
    content: 'Enter JID or select from roster:',
    style: { fg: 'white' },
  })

  const jidInput = blessed.textbox({
    parent: box, top: 3, left: 1, width: 50, height: 1,
    inputOnFocus: true, mouse: true, style: { fg: 'white', bg: 'blue' },
  })

  const rosterList = blessed.list({
    parent: box,
    top: 5,
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

  jidInput.key('enter', () => {
    const jid = jidInput.getValue().trim()
    if (jid) onStartChat(jid)
  })

  rosterList.on('select', (_item: any, index: number) => {
    const chat = state.chats[index]
    if (chat) onStartChat(chat.jid)
  })

  const mount = () => { box.hidden = false; jidInput.focus() }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    const items = s.chats.length === 0
      ? ['{yellow-fg}No roster contacts.{/yellow-fg}']
      : s.chats.map(c => ` ${c.online ? '{green-fg}●{/green-fg}' : '{red-fg}○{/red-fg}'} ${c.name}`)
    rosterList.setItems(items)
  }

  const focus = () => jidInput.focus()

  return { box, mount, unmount, update, focus }
}
