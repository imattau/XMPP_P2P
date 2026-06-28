import blessed from 'blessed'
import { XmppNode } from '../../core/xmpp-node.js'
import { TuiState } from '../bridge.js'

export const createFeedPage = (
  parent: blessed.Widgets.BoxElement,
  state: TuiState,
  xmppNode: XmppNode,
  onOpenPost: (id: string) => void
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
    content: '{bold}Feed{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const postList = blessed.list({
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

  postList.on('select', (_item: any, index: number) => {
    const post = state.posts[index]
    if (post) onOpenPost(post.id)
  })

  const mount = () => { box.hidden = false }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    const items = s.posts.length === 0
      ? ['{yellow-fg}No posts yet. Create one from Compose!{/yellow-fg}']
      : s.posts.map(p => {
          const title = p.title ? `{bold}${p.title}{/bold} ` : ''
          const body = p.body.slice(0, 60)
          const tags = p.categories?.length ? ` {cyan-fg}[${p.categories.join(', ')}]{/cyan-fg}` : ''
          return `${title}${body}${tags}`
        })
    postList.setItems(items)
  }

  const focus = () => postList.focus()

  return { box, mount, unmount, update, focus }
}
