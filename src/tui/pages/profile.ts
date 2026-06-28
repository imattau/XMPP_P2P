import blessed from 'blessed'
import { XmppNode } from '../../core/xmpp-node.js'
import { TuiState } from '../bridge.js'

export const createProfilePage = (
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
    content: '{bold}Profile{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const content = blessed.text({
    parent: box,
    top: 2,
    left: 1,
    right: 1,
    bottom: 1,
    style: { fg: 'white', bg: 'black' },
    tags: true,
    scrollable: true,
    vi: true,
  })

  const mount = () => { box.hidden = false }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    content.setContent(
      `JID:      {cyan-fg}${s.jid}{/cyan-fg}\n` +
      `Name:     {bold}${s.profileFn || '(not set)'}{/bold}\n` +
      `Nick:     ${s.profileNick || '(not set)'}\n` +
      `Peer ID:  ${s.peerId.slice(0, 32)}…`
    )
  }

  const focus = () => content.focus()

  return { box, mount, unmount, update, focus }
}
