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
import WelcomePage from '../pages/onboarding/WelcomePage'
import CreateIdentityPage from '../pages/onboarding/CreateIdentityPage'
import ImportIdentityPage from '../pages/onboarding/ImportIdentityPage'
import RecoveryPage from '../pages/onboarding/RecoveryPage'
import PermissionsPage from '../pages/onboarding/PermissionsPage'
import FindNetworkPage from '../pages/onboarding/FindNetworkPage'
import PreferencesPage from '../pages/onboarding/PreferencesPage'
import ReadyPage from '../pages/onboarding/ReadyPage'

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
      { path: 'settings', Component: SettingsPage },
      { path: 'onboarding', Component: WelcomePage },
      { path: 'onboarding/create', Component: CreateIdentityPage },
      { path: 'onboarding/import', Component: ImportIdentityPage },
      { path: 'onboarding/recovery', Component: RecoveryPage },
      { path: 'onboarding/permissions', Component: PermissionsPage },
      { path: 'onboarding/network', Component: FindNetworkPage },
      { path: 'onboarding/preferences', Component: PreferencesPage },
      { path: 'onboarding/ready', Component: ReadyPage }
    ]
  }
])
