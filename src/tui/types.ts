import type { XmppNode } from '../core/xmpp-node.js'

export type Libp2pNode = {
  peerId: { toString(): string }
  getMultiaddrs(): Array<{ toString(): string }>
  addEventListener(event: string, listener: (evt: any) => void): void
  getConnections(peerId?: any): any[]
  start(): Promise<void>
  stop(): Promise<void>
}

export enum TuiView {
  Feed = 'feed',
  Post = 'post',
  Topics = 'topics',
  TopicFeed = 'topic-feed',
  Compose = 'compose',
  CreateCommunity = 'create-community',
  Chats = 'chats',
  NewChat = 'new-chat',
  ChatThread = 'chat-thread',
  Profile = 'profile',
  Settings = 'settings',
}

export type NavItem = {
  id: TuiView
  label: string
  icon: string
}

export type TuiContext = {
  libp2p: Libp2pNode
  xmppNode: XmppNode
  screen: any
}

export interface TuiPage {
  box: any
  mount(): void
  unmount(): void
  focus(): void
}

export type StoredPost = {
  id: string
  from: string
  authorName: string
  authorHandle: string
  body: string
  title?: string
  summary?: string
  categories?: string[]
  topic?: string
  topicColor?: string
  type?: string
  timestamp: string
  publishedAt?: string
}

export type StoredMessage = {
  id: string
  from: string
  body: string
  nickname?: string
  encrypted?: boolean
  encryption?: string
  timestamp: string
  chatState?: string
  replace?: string
  reply?: { id: string; to?: string }
  thread?: string
}

export type StoredChat = {
  jid: string
  name: string
  lastMessage?: string
  lastTimestamp?: string
  unread: number
  online?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { id: TuiView.Feed, label: 'Feed', icon: '📡' },
  { id: TuiView.Topics, label: 'Topics', icon: '🏷' },
  { id: TuiView.Compose, label: 'Compose', icon: '✏' },
  { id: TuiView.Chats, label: 'Chats', icon: '💬' },
  { id: TuiView.Profile, label: 'Profile', icon: '👤' },
  { id: TuiView.Settings, label: 'Settings', icon: '⚙' },
]
