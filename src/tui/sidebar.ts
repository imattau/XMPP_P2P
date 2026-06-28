import blessed from 'blessed'
import { TuiState } from './bridge.js'
import { NAV_ITEMS, TuiView } from './types.js'

export type Sidebar = {
  box: blessed.Widgets.BoxElement
  select: (view: TuiView) => void
  update: (state: TuiState) => void
  focus: () => void
  getSelected: () => TuiView
}

export const createSidebar = (
  screen: blessed.Widgets.Screen,
  onNavigate: (view: TuiView) => void
): Sidebar => {
  let selectedIndex = 0

  const box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: 22,
    bottom: 1,
    style: { fg: 'white', bg: 'black' },
    border: { type: 'line', fg: 6 } as any,
    tags: true,
  })

  blessed.text({
    parent: box,
    top: 0,
    left: 2,
    width: 18,
    height: 3,
    content: '{bold}Nexus{/bold}\nXMPP P2P',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const list = blessed.list({
    parent: box,
    top: 4,
    left: 1,
    width: 18,
    height: NAV_ITEMS.length + 2,
    items: NAV_ITEMS.map(item => ` ${item.label}`),
    style: {
      selected: { fg: 'white', bg: 'blue' },
      item: { fg: 'white', bg: 'black' },
    },
    tags: true,
    vi: true,
    keys: true,
    mouse: true,
  })

  const indicator = blessed.text({
    parent: box,
    top: 4,
    left: 0,
    width: 1,
    height: NAV_ITEMS.length + 2,
    content: '\n'.repeat(NAV_ITEMS.length + 1),
    style: { fg: 'cyan', bg: 'black' },
  })

  const statusBox = blessed.box({
    parent: box,
    bottom: 1,
    left: 1,
    width: 18,
    height: 4,
    style: { fg: 'white', bg: 'black' },
    tags: true,
  })

  list.on('select', (_item: any, index: number) => {
    selectedIndex = index
    const lines = '\n'.repeat(index) + '▸' + '\n'.repeat(NAV_ITEMS.length - 1 - index)
    indicator.setContent(lines)
    onNavigate(NAV_ITEMS[index].id)
    screen.render()
  })

  list.select(0)
  indicator.setContent('▸' + '\n'.repeat(NAV_ITEMS.length - 1))

  const update = (state: TuiState) => {
    const peerStatus = state.connected
      ? '{green-fg}●{/green-fg} Online'
      : '{red-fg}●{/red-fg} Offline'
    statusBox.setContent(
      `${peerStatus}\n {bold}${state.connectedPeers}{/bold} peers\n {cyan-fg}${state.jid.slice(0, 16)}{/cyan-fg}`
    )
  }

  const select = (view: TuiView) => {
    const idx = NAV_ITEMS.findIndex(item => item.id === view)
    if (idx >= 0) {
      selectedIndex = idx
      list.select(idx)
      const lines = '\n'.repeat(idx) + '▸' + '\n'.repeat(NAV_ITEMS.length - 1 - idx)
      indicator.setContent(lines)
    }
  }

  const getSelected = () => NAV_ITEMS[selectedIndex]?.id || TuiView.Feed
  const focus = () => list.focus()

  return { box, select, update, focus, getSelected }
}
