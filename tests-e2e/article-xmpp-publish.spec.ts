import { test, expect } from '@playwright/test'
import { WebSocketServer } from 'ws'

test('connected XMPP account publishes articles and posts, receives feed items, and chats in a room', async ({ page }) => {
  const xmppServer = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    handleProtocols: (protocols) => protocols.has('xmpp') ? 'xmpp' : false,
  })
  await new Promise<void>((resolve) => xmppServer.once('listening', resolve))
  const address = xmppServer.address()
  if (!address || typeof address === 'string') throw new Error('Local XMPP WebSocket server did not bind')
  const service = `ws://127.0.0.1:${address.port}/xmpp-websocket`
  const frames: string[] = []
  let serverSocket: import('ws').WebSocket | undefined

  xmppServer.on('connection', (socket) => {
    serverSocket = socket
    let authenticated = false
    socket.on('message', (data) => {
      const frame = data.toString()
      frames.push(frame)
      if (frame.includes('<auth ')) {
        authenticated = true
        socket.send(`<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>`)
      } else if (frame.includes('<open ') && !authenticated) {
        socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='local' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>PLAIN</mechanism></mechanisms></stream:features>`)
      } else if (frame.includes('<open ') && authenticated) {
        socket.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' from='example.test' id='local' version='1.0'/><stream:features xmlns:stream='http://etherx.jabber.org/streams'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><required/></bind></stream:features>`)
      } else if (frame.includes('<iq ') && frame.includes('http://jabber.org/protocol/disco#info')) {
        const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
        if (id) socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'><query xmlns='http://jabber.org/protocol/disco#info'><feature var='urn:xmpp:microblog:0'/></query></iq>`)
      } else if (frame.includes('<iq ') && frame.includes('urn:ietf:params:xml:ns:xmpp-bind')) {
        const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
        if (id) socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><jid>author@example.test/local</jid></bind></iq>`)
      } else if (frame.includes('<iq ') && /\btype=['"](?:get|set)['"]/.test(frame)) {
        const id = frame.match(/\bid=['"]([^'"]+)['"]/)?.[1]
        if (id) socket.send(`<iq xmlns='jabber:client' type='result' id='${id}'/>`)
      } else if (frame.includes('<presence ') && frame.includes('http://jabber.org/protocol/muc')) {
        const roomOccupant = frame.match(/\bto=['"]([^'"]+)['"]/)?.[1]
        if (roomOccupant) socket.send(`<presence xmlns='jabber:client' from='${roomOccupant}' to='author@example.test/local'><x xmlns='http://jabber.org/protocol/muc#user'><item affiliation='member' role='participant' jid='author@example.test/local'/><status code='110'/></x></presence>`)
      }
    })
  })

  try {
    await page.addInitScript(() => {
      localStorage.setItem('xmpp-p2p:identity', JSON.stringify({
        displayName: 'Local XMPP Author',
        handle: 'local-xmpp-author',
        jid: 'local-xmpp-author@p2p',
        recoveryPhrase: [],
        recoveryPhraseSaved: true,
        createdAt: new Date().toISOString(),
      }))
      localStorage.setItem('xmpp-p2p:onboarding', JSON.stringify({ completed: true, completedAt: new Date().toISOString() }))
    })
    await page.goto('http://localhost:4173/settings')
    await page.getByRole('button', { name: 'Connect to XMPP server' }).click()
    await page.getByLabel('XMPP account JID').fill('author@example.test')
    await page.getByLabel('XMPP account password').fill('local-test-password')
    await page.getByLabel('XMPP server WebSocket URL (optional)').fill(service)
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 15000 })

    const title = `Local XMPP article ${Date.now()}`
    const paragraph = 'A readable summary and structured article payload over PEP.'
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Write' }).click()
    await page.getByLabel('Article title').fill(title)
    await page.getByLabel('Paragraph text').fill(paragraph)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Article publishing destination' }).getByRole('button', { name: /XMPP microblog/ })).toBeEnabled()
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByRole('button', { name: '#XMPP', exact: true }).click()
    await page.getByRole('group', { name: 'Article publishing destination' }).getByRole('button', { name: /XMPP microblog/ }).click()
    await page.getByRole('button', { name: 'Publish to XMPP', exact: true }).click()

    await expect(page).toHaveURL(/\/article\//)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText(paragraph)).toBeVisible()
    await expect.poll(() => frames.some((frame) => frame.includes('urn:xmpp:microblog:0')
      && frame.includes('urn:nexus:article:1')
      && frame.includes(title)
      && frame.includes(paragraph))).toBe(true)

    const microblogText = `Standalone XMPP post ${Date.now()}`
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Feed' }).click()
    const destinations = page.getByRole('group', { name: 'Post destination' })
    await destinations.getByRole('button', { name: 'XMPP', exact: true }).click()
    await page.getByLabel('Post to XMPP microblog').fill(microblogText)
    await page.getByRole('button', { name: 'Post', exact: true }).last().click()
    await expect(page.getByRole('status').filter({ hasText: 'Published to your XMPP microblog' })).toBeVisible()
    await expect(page.getByText(microblogText, { exact: true })).toBeVisible()
    await expect.poll(() => frames.some((frame) => frame.includes('urn:xmpp:microblog:0') && frame.includes(microblogText))).toBe(true)
    const incomingMicroblog = `Incoming XMPP post ${Date.now()}`
    serverSocket?.send(`<message xmlns='jabber:client' from='friend@example.test' to='author@example.test/local'><event xmlns='http://jabber.org/protocol/pubsub#event'><items node='urn:xmpp:microblog:0'><item id='incoming-feed-item'><entry xmlns='http://www.w3.org/2005/Atom'><title>${incomingMicroblog}</title><content type='text'>${incomingMicroblog}</content><author><name>Local XMPP Friend</name></author><published>${new Date().toISOString()}</published></entry></item></items></event></message>`)
    await expect(page.getByText(incomingMicroblog, { exact: true })).toBeVisible()

    const incomingArticleTitle = `Incoming XMPP topic article ${Date.now()}`
    const incomingArticlePayload = `nexus-article:v1\n${JSON.stringify({
      version: 1,
      id: `incoming-xmpp-article-${Date.now()}`,
      title: incomingArticleTitle,
      topic: 'XMPP',
      blocks: [{ id: 'incoming-xmpp-paragraph', type: 'paragraph', content: 'Received from the XMPP microblog.' }],
      readTime: '1 min read',
      settings: { showReadingTime: true },
    })}`
    serverSocket?.send(`<message xmlns='jabber:client' from='friend@example.test' to='author@example.test/local'><event xmlns='http://jabber.org/protocol/pubsub#event'><items node='urn:xmpp:microblog:0'><item id='incoming-xmpp-article'><entry xmlns='http://www.w3.org/2005/Atom'><title>${incomingArticleTitle}</title><content type='text'>Article received over XMPP.</content><article xmlns='urn:nexus:article:1'>${incomingArticlePayload}</article><category term='XMPP'/><author><name>Local XMPP Friend</name></author><published>${new Date().toISOString()}</published></entry></item></items></event></message>`)
    await expect(page.locator('article').filter({ hasText: incomingArticleTitle })).toBeVisible()
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Topics' }).click()
    await expect(page.getByRole('button', { name: incomingArticleTitle })).toBeVisible()

    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Chats' }).click()
    await page.getByRole('button', { name: 'Channels' }).click()
    await page.getByRole('button', { name: 'Browse or join a channel' }).click()
    await page.getByRole('tab', { name: 'Channel' }).click()
    await page.getByLabel('P2P room ID or XMPP room JID').fill('lobby@conference.example.test')
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page).toHaveURL(/\/chat\/lobby%40conference\.example\.test$/)
    await expect.poll(() => frames.some((frame) => /\bto=['"]lobby@conference\.example\.test\/author['"]/.test(frame)
      && frame.includes('http://jabber.org/protocol/muc'))).toBe(true)
    const roomMessage = `XMPP room message ${Date.now()}`
    await page.getByLabel('Message lobby').fill(roomMessage)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.poll(() => frames.some((frame) => /\bto=['"]lobby@conference\.example\.test['"]/.test(frame)
      && /\btype=['"]groupchat['"]/.test(frame)
      && frame.includes(roomMessage))).toBe(true)
    const incomingRoomMessage = `Welcome to the test room ${Date.now()}`
    serverSocket?.send(`<message xmlns='jabber:client' from='lobby@conference.example.test/moderator' to='author@example.test/local' type='groupchat' id='room-message-1'><body>${incomingRoomMessage}</body></message>`)
    await expect(page.getByText(incomingRoomMessage, { exact: true })).toBeVisible()

    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Contacts' }).click()
    await page.getByRole('button', { name: 'Start a new conversation' }).click()
    await page.getByLabel('Search contacts, enter a JID, or paste a peer address').fill('friend@example.test')
    await page.getByRole('button', { name: /Start conversation with this JID/ }).click()
    await expect(page).toHaveURL(/\/chat\/friend%40example\.test$/)
    const directMessage = `Direct XMPP message ${Date.now()}`
    await page.getByLabel('Message friend').fill(directMessage)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.poll(() => frames.some((frame) => /\bto=['"]friend@example\.test['"]/.test(frame)
      && /\btype=['"]chat['"]/.test(frame)
      && frame.includes(directMessage))).toBe(true)
    const incomingDirectMessage = `Reply from XMPP friend ${Date.now()}`
    serverSocket?.send(`<message xmlns='jabber:client' from='friend@example.test/mobile' to='author@example.test/local' type='chat' id='direct-message-1'><body>${incomingDirectMessage}</body></message>`)
    await expect(page.getByText(incomingDirectMessage, { exact: true })).toBeVisible()
  } finally {
    for (const socket of xmppServer.clients) socket.close()
    await new Promise<void>((resolve) => xmppServer.close(() => resolve()))
  }
})
