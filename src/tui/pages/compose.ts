import blessed from 'blessed'
import { XmppNode } from '../../core/xmpp-node.js'
import { TuiState } from '../bridge.js'

export const createComposePage = (
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
    content: '{bold}Compose Post{/bold}',
    style: { fg: 'cyan', bg: 'black' },
    tags: true,
  })

  const form = blessed.form({
    parent: box,
    top: 2,
    left: 1,
    right: 1,
    bottom: 1,
    keys: true,
    vi: true,
  })

  blessed.text({ parent: form, top: 0, left: 0, content: 'Title:', style: { fg: 'white' } })
  const titleInput = blessed.textbox({
    parent: form, top: 0, left: 8, width: 40, height: 1,
    inputOnFocus: true, mouse: true, style: { fg: 'white', bg: 'blue' },
  })

  blessed.text({ parent: form, top: 2, left: 0, content: 'Tags:', style: { fg: 'white' } })
  const tagsInput = blessed.textbox({
    parent: form, top: 2, left: 8, width: 40, height: 1,
    inputOnFocus: true, mouse: true, style: { fg: 'white', bg: 'blue' },
  })

  blessed.text({ parent: form, top: 4, left: 0, content: 'Body:', style: { fg: 'white' } })
  const bodyInput = blessed.textarea({
    parent: form, top: 4, left: 8, width: 60, height: 8,
    inputOnFocus: true, mouse: true, style: { fg: 'white', bg: 'blue' },
  })

  const statusText = blessed.text({
    parent: form, top: 13, left: 0, height: 1,
    style: { fg: 'yellow' }, tags: true,
  })

  const submitBtn = blessed.button({
    parent: form, top: 15, left: 1, width: 14, height: 1,
    content: ' [Submit] ',
    style: { fg: 'white', bg: 'green', focus: { fg: 'white', bg: 'blue' } },
    keys: true,
    mouse: true,
  })

  form.on('submit', async () => {
    const body = bodyInput.getValue()
    if (!body) {
      statusText.setContent('{red-fg}Body is required{/red-fg}')
      return
    }
    const title = titleInput.getValue()
    const tagsStr = tagsInput.getValue()
    try {
      await xmppNode.publishFeed(body, {
        title: title || undefined,
        categories: tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
      })
      statusText.setContent('{green-fg}Post published!{/green-fg}')
      titleInput.clearValue()
      tagsInput.clearValue()
      bodyInput.clearValue()
    } catch (err: any) {
      statusText.setContent(`{red-fg}Error: ${err.message}{/red-fg}`)
    }
  })

  submitBtn.on('press', () => form.submit())

  const mount = () => { box.hidden = false; titleInput.focus() }
  const unmount = () => { box.hidden = true }

  const update = (_s: TuiState) => {}

  const focus = () => titleInput.focus()

  return { box, mount, unmount, update, focus }
}
