import { createBrowserRouter } from 'react-router'
import Root from './Root'
import FeedPage from '../pages/FeedPage'
import ChatsPage from '../pages/ChatsPage'
import TopicsPage from '../pages/TopicsPage'
import TopicFeedPage from '../pages/TopicFeedPage'
import ComposePage from '../pages/ComposePage'
import ProfilePage from '../pages/ProfilePage'
import SettingsPage from '../pages/SettingsPage'
import CreateCommunityPage from '../pages/CreateCommunityPage'
import PostPage from '../pages/PostPage'
import ChatThreadPage from '../pages/ChatThreadPage'
import NewChatPage from '../pages/NewChatPage'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: FeedPage },
      { path: 'post/:id', Component: PostPage },
      { path: 'post', Component: PostPage },
      { path: 'topics', Component: TopicsPage },
      { path: 'topics/:tag', Component: TopicFeedPage },
      { path: 'compose', Component: ComposePage },
      { path: 'communities/new', Component: CreateCommunityPage },
      { path: 'chats', Component: ChatsPage },
      { path: 'chats/new', Component: NewChatPage },
      { path: 'chat/:id', Component: ChatThreadPage },
      { path: 'chat', Component: ChatThreadPage },
      { path: 'profile', Component: ProfilePage },
      { path: 'settings', Component: SettingsPage }
    ]
  }
])
