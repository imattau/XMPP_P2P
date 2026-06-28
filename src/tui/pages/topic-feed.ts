import blessed from 'blessed'
import { TuiState } from '../bridge.js'

export const createTopicFeedPage = (
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

  const content = blessed.box({
    parent: box,
    top: 0,
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
    if (s.posts.length === 0) {
      content.setContent('{yellow-fg}No posts for this topic.{/yellow-fg}')
    } else {
      const lines = s.posts.map(p => {
        const body = p.body.slice(0, 80)
        return `  {bold}${p.authorName}{/bold}: ${body}`
      })
      content.setContent(lines.join('\n\n'))
    }
  }

  const focus = () => content.focus()

  return { box, mount, unmount, update, focus }
}
