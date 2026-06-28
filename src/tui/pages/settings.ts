import blessed from 'blessed'
import { TuiState } from '../bridge.js'

export const createSettingsPage = (
  parent: blessed.Widgets.BoxElement,
  state: TuiState
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
    content: '{bold}Settings{/bold}',
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
    const peerStatus = s.connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}'
    content.setContent(
      `Status:   ${peerStatus}\n` +
      `Peers:    ${s.connectedPeers}\n` +
      `Peer ID:  ${s.peerId.slice(0, 32)}…\n` +
      `JID:      {cyan-fg}${s.jid}{/cyan-fg}\n\n` +
      `{bold}Keybindings:{/bold}\n` +
      `  Tab          Focus sidebar\n` +
      `  ↑/↓          Navigate lists\n` +
      `  Enter        Select / Send\n` +
      `  Esc          Go back\n` +
      `  q / Ctrl+C   Quit`
    )
  }

  const focus = () => content.focus()

  return { box, mount, unmount, update, focus }
}
