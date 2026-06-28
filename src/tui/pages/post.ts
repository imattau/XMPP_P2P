import blessed from 'blessed'
import { TuiState } from '../bridge.js'

export const createPostPage = (
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
    scrollable: true,
    vi: true,
  })

  const content = blessed.text({
    parent: box,
    top: 0,
    left: 1,
    right: 1,
    height: 'shrink',
    style: { fg: 'white', bg: 'black' },
    tags: true,
  })

  const mount = () => { box.hidden = false }
  const unmount = () => { box.hidden = true }

  const update = (s: TuiState) => {
    const post = s.posts[0]
    if (post) {
      content.setContent(
        `{bold}${post.title || 'Post'}{/bold}\n\n` +
        `From: {cyan-fg}${post.authorName}{/cyan-fg} (@${post.authorHandle})\n` +
        `Time: ${post.timestamp}\n\n` +
        `${post.body}\n\n` +
        `${post.categories?.length ? `Tags: {cyan-fg}${post.categories.join(', ')}{/cyan-fg}\n` : ''}` +
        `${post.summary ? `\n{italic}${post.summary}{/italic}` : ''}`
      )
    } else {
      content.setContent('{yellow-fg}No post selected.{/yellow-fg}')
    }
  }

  const focus = () => box.focus()

  return { box, mount, unmount, update, focus }
}
