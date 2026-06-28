import blessed from 'blessed'
import { TuiState } from './bridge.js'

export type StatusBar = {
  bar: blessed.Widgets.BoxElement
  update: (state: TuiState) => void
}

export const createStatusBar = (screen: blessed.Widgets.Screen): StatusBar => {
  const bar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    style: { fg: 'white', bg: 'blue' },
    tags: true,
  })

  const update = (state: TuiState) => {
    const peerStatus = state.connected
      ? '{green-fg}●{/green-fg} Online · {bold}' + state.connectedPeers + '{/bold} peers'
      : '{red-fg}●{/red-fg} Disconnected'
    bar.setContent(
      ` ${peerStatus}  |  Tab/Arrows: Navigate  |  Enter: Select  |  Esc: Back  |  q: Quit`
    )
  }

  return { bar, update }
}
