import blessed from 'blessed'
import { XmppNode } from '../core/xmpp-node.js'
import { Libp2pNode, TuiView } from './types.js'
import { createTuiState, loadInitialData, TuiState } from './bridge.js'
import { attachTuiEventListeners } from './events.js'
import { createSidebar } from './sidebar.js'
import { createStatusBar } from './status-bar.js'
import { createFeedPage } from './pages/feed.js'
import { createChatsPage } from './pages/chats.js'
import { createChatThreadPage } from './pages/chat-thread.js'
import { createComposePage } from './pages/compose.js'
import { createProfilePage } from './pages/profile.js'
import { createTopicsPage } from './pages/topics.js'
import { createSettingsPage } from './pages/settings.js'
import { createPostPage } from './pages/post.js'
import { createTopicFeedPage } from './pages/topic-feed.js'
import { createCreateCommunityPage } from './pages/create-community.js'
import { createNewChatPage } from './pages/new-chat.js'

export const startTui = async (libp2p: Libp2pNode, xmppNode: XmppNode) => {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'XMPP P2P TUI',
    dockBorders: true,
    fullUnicode: true,
    mouse: true,
  })

  const state = createTuiState(xmppNode)
  state.peerId = libp2p.peerId.toString()
  state.jid = xmppNode.jid || ''

  await loadInitialData(xmppNode, state)

  let currentView: TuiView = TuiView.Feed

  const pageBox = blessed.box({
    parent: screen,
    top: 0,
    left: 22,
    right: 0,
    bottom: 1,
    style: { fg: 'white', bg: 'black' },
  })

  const sidebar = createSidebar(screen, (view: TuiView) => navigateTo(view))
  const statusBar = createStatusBar(screen)

  const pages: Record<string, { box: blessed.Widgets.BoxElement; mount: () => void; unmount: () => void; focus: () => void; update: (state: TuiState) => void }> = {
    [TuiView.Feed]: createFeedPage(pageBox, state, xmppNode, () => navigateTo(TuiView.Post)),
    [TuiView.Post]: createPostPage(pageBox, state),
    [TuiView.Topics]: createTopicsPage(pageBox, state, (tag: string) => {
      state.posts = state.posts.filter(p => p.categories?.includes(tag))
      navigateTo(TuiView.TopicFeed)
    }),
    [TuiView.TopicFeed]: createTopicFeedPage(pageBox, state),
    [TuiView.Compose]: createComposePage(pageBox, state, xmppNode),
    [TuiView.CreateCommunity]: createCreateCommunityPage(pageBox, xmppNode),
    [TuiView.Chats]: createChatsPage(pageBox, state, (jid: string) => {
      state.currentChatJid = jid
      navigateTo(TuiView.ChatThread)
    }),
    [TuiView.NewChat]: createNewChatPage(pageBox, state, xmppNode, (jid: string) => {
      state.currentChatJid = jid
      navigateTo(TuiView.ChatThread)
    }),
    [TuiView.ChatThread]: createChatThreadPage(pageBox, state, xmppNode),
    [TuiView.Profile]: createProfilePage(pageBox, state, xmppNode),
    [TuiView.Settings]: createSettingsPage(pageBox, state),
  }

  const navigateTo = (view: TuiView) => {
    const prev = pages[currentView]
    if (prev) prev.unmount()
    currentView = view
    sidebar.select(view)
    const next = pages[view]
    if (next) {
      next.update(state)
      next.mount()
      next.focus()
    }
    screen.render()
  }

  const renderAll = () => {
    const p = pages[currentView]
    if (p) p.update(state)
    sidebar.update(state)
    statusBar.update(state)
    screen.render()
  }

  attachTuiEventListeners(xmppNode, state, () => {
    renderAll()
  })

  screen.key(['q', 'C-c'], () => {
    screen.destroy()
    xmppNode.close()
    libp2p.stop()
    process.exit(0)
  })

  screen.key(['tab'], () => {
    sidebar.focus()
  })

  screen.key(['escape'], () => {
    if (currentView === TuiView.ChatThread || currentView === TuiView.Post || currentView === TuiView.TopicFeed) {
      navigateTo(TuiView.Feed)
    } else if (currentView === TuiView.Compose) {
      navigateTo(TuiView.Feed)
    } else if (currentView === TuiView.NewChat) {
      navigateTo(TuiView.Chats)
    } else if (currentView === TuiView.CreateCommunity) {
      navigateTo(TuiView.Settings)
    }
  })

  sidebar.update(state)
  statusBar.update(state)

  navigateTo(TuiView.Feed)
  sidebar.focus()

  screen.render()
}
