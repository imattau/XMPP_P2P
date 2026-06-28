import blessed from 'blessed'
import { TuiState } from '../bridge.js'

export const createTopicsPage = (
  parent: blessed.Widgets.BoxElement,
  state: TuiState,
  onSelectTag: (tag: string) => void
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
    content: '{bold}Topics{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const topicList = blessed.list({
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

  topicList.on('select', (_item: any, index: number) => {
    const tags = Array.from(new Set(state.posts.flatMap(p => p.categories || [])))
    const tag = tags[index]
    if (tag) onSelectTag(tag)
  })

  const mount = () => { box.hidden = false }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    const tags = Array.from(new Set(s.posts.flatMap(p => p.categories || [])))
    const items = tags.length === 0
      ? ['{yellow-fg}No topics found.{/yellow-fg}']
      : tags.map(t => `  {cyan-fg}#${t}{/cyan-fg}`)
    topicList.setItems(items)
  }

  const focus = () => topicList.focus()

  return { box, mount, unmount, update, focus }
}
