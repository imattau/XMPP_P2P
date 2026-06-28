import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import Root from './Root'

const FeedPage = lazy(() => import('../pages/FeedPage'))
const ChatsPage = lazy(() => import('../pages/ChatsPage'))
const TopicsPage = lazy(() => import('../pages/TopicsPage'))
const TopicFeedPage = lazy(() => import('../pages/TopicFeedPage'))
const ComposePage = lazy(() => import('../pages/ComposePage'))
const ProfilePage = lazy(() => import('../pages/ProfilePage'))
const SettingsPage = lazy(() => import('../pages/SettingsPage'))
const CreateCommunityPage = lazy(() => import('../pages/CreateCommunityPage'))
const PostPage = lazy(() => import('../pages/PostPage'))
const ArticleReaderPage = lazy(() => import('../pages/ArticleReaderPage'))
const DraftsPage = lazy(() => import('../pages/DraftsPage'))
const ChatThreadPage = lazy(() => import('../pages/ChatThreadPage'))
const NewChatPage = lazy(() => import('../pages/NewChatPage'))
const ContactsPage = lazy(() => import('../pages/ContactsPage'))
const SearchPage = lazy(() => import('../pages/SearchPage'))
const WelcomePage = lazy(() => import('../pages/onboarding/WelcomePage'))
const CreateIdentityPage = lazy(() => import('../pages/onboarding/CreateIdentityPage'))
const ImportIdentityPage = lazy(() => import('../pages/onboarding/ImportIdentityPage'))
const RecoveryPage = lazy(() => import('../pages/onboarding/RecoveryPage'))
const PermissionsPage = lazy(() => import('../pages/onboarding/PermissionsPage'))
const FindNetworkPage = lazy(() => import('../pages/onboarding/FindNetworkPage'))
const PreferencesPage = lazy(() => import('../pages/onboarding/PreferencesPage'))
const ReadyPage = lazy(() => import('../pages/onboarding/ReadyPage'))

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
      { path: 'article/:id', Component: ArticleReaderPage },
      { path: 'compose', Component: ComposePage },
      { path: 'compose/:id', Component: ComposePage },
      { path: 'drafts', Component: DraftsPage },
      { path: 'communities/new', Component: CreateCommunityPage },
      { path: 'search', Component: SearchPage },
      { path: 'contacts', Component: ContactsPage },
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
