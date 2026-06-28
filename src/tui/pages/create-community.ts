import blessed from 'blessed'
import { XmppNode } from '../../core/xmpp-node.js'

export const createCreateCommunityPage = (
  parent: blessed.Widgets.BoxElement,
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
    content: '{bold}Create Community{/bold}',
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

  blessed.text({ parent: form, top: 0, left: 0, content: 'ID:', style: { fg: 'white' } })
  const idInput = blessed.textbox({
    parent: form, top: 0, left: 6, width: 40, height: 1,
    inputOnFocus: true, style: { fg: 'white', bg: 'blue' },
  })

  blessed.text({ parent: form, top: 2, left: 0, content: 'Name:', style: { fg: 'white' } })
  const nameInput = blessed.textbox({
    parent: form, top: 2, left: 6, width: 40, height: 1,
    inputOnFocus: true, style: { fg: 'white', bg: 'blue' },
  })

  const statusText = blessed.text({
    parent: form, top: 4, left: 0, height: 1,
    style: { fg: 'yellow' }, tags: true,
  })

  const submitBtn = blessed.button({
    parent: form, top: 6, left: 1, width: 14, height: 1,
    content: ' [Create] ',
    style: { fg: 'white', bg: 'green', focus: { fg: 'white', bg: 'blue' } },
    keys: true,
    mouse: true,
  })

  form.on('submit', async () => {
    const id = idInput.getValue().trim()
    if (!id) { statusText.setContent('{red-fg}ID is required{/red-fg}'); return }
    const name = nameInput.getValue().trim() || undefined
    try {
      await xmppNode.createCollection(id, name)
      statusText.setContent('{green-fg}Community created!{/green-fg}')
      idInput.clearValue()
      nameInput.clearValue()
    } catch (err: any) {
      statusText.setContent(`{red-fg}Error: ${err.message}{/red-fg}`)
    }
  })

  submitBtn.on('press', () => form.submit())

  const mount = () => { box.hidden = false; idInput.focus() }
  const unmount = () => { box.hidden = true }
  const update = () => {}
  const focus = () => idInput.focus()

  return { box, mount, unmount, update, focus }
}
