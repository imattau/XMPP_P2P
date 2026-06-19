import type { FeedPost, TrendingTopic } from './types'

export const SEED_POSTS: FeedPost[] = [
  {
    id: '1', type: 'topic',
    author: { name: 'Maren Holdt', handle: 'maren', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&auto=format', verified: true, server: 'social.coop' },
    content: 'The decentralized web is finally catching up to the UX expectations users have from centralized platforms. XMPP has been quietly powering this transition for years - it just never got the credit.',
    timestamp: '2m', sourceTopic: 'xmpp-feed:seed-decentral-web', topic: 'DecentralWeb', topicColor: '#3b82f6',
    likes: 284, comments: 31, reposts: 47, liked: true, privacy: 'public'
  },
  {
    id: '2', type: 'community',
    author: { name: 'Theo Nakashima', handle: 'theo_n', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&auto=format', server: 'hachyderm.io' },
    content: 'Just shipped a new XMPP client library for Go with full MUC support. Zero dependencies, dead simple API. Benchmarks show 2x throughput over the previous implementation at 10k concurrent connections.',
    timestamp: '14m', sourceTopic: 'xmpp-collection:opensource-dev', community: 'OpenSourceDev', communityIcon: '⚙️',
    likes: 512, comments: 88, reposts: 134, privacy: 'public'
  },
  {
    id: '3', type: 'post',
    author: { name: 'Elif Şahin', handle: 'elif_dev', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&auto=format', server: 'mastodon.social' },
    content: "Hot take: the problem with federated social networks isn't tech, it's onboarding. Most people don't understand why they'd choose a server. We need to abstract that entirely.",
    timestamp: '38m', sourceTopic: 'xmpp-feed:seed-general',
    likes: 1420, comments: 203, reposts: 311, bookmarked: true, privacy: 'public'
  },
  {
    id: '4', type: 'topic',
    author: { name: 'Kaspar Vold', handle: 'kvold', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&auto=format', verified: true, server: 'fosstodon.org' },
    content: 'New RFC draft for XMPP push notifications on mobile - finally addressing the battery drain issue that has plagued mobile XMPP clients for a decade. This could be the breakthrough we needed.',
    timestamp: '1h', sourceTopic: 'xmpp-feed:seed-xmpp-protocol', topic: 'XMPPProtocol', topicColor: '#00d4aa',
    likes: 97, comments: 14, reposts: 22, privacy: 'public',
    media: { url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=280&fit=crop&auto=format', alt: 'Circuit board close-up' }
  },
  {
    id: '5', type: 'community',
    author: { name: 'Amara Diallo', handle: 'amara_d', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=64&h=64&fit=crop&auto=format', server: 'blacktwitter.io' },
    content: "Weekly thread: what are you all working on this week? I'm rebuilding my XMPP bridge to support message reactions and threading. The spec is... interesting. 🙃",
    timestamp: '2h', sourceTopic: 'xmpp-collection:weekly-dev-chat', community: 'WeeklyDevChat', communityIcon: '💬',
    likes: 63, comments: 41, reposts: 8, privacy: 'community', pinned: true
  },
  {
    id: '6', type: 'post',
    author: { name: 'Felix Bergström', handle: 'felixb', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=64&h=64&fit=crop&auto=format', server: 'chaos.social' },
    content: 'Moved all my personal infra to self-hosted XMPP + Matrix bridge last week. Messages from Signal, WhatsApp, and iMessage all land in one inbox. The setup took 4 hours. Worth every minute.',
    timestamp: '3h', sourceTopic: 'xmpp-feed:seed-general', replyTo: 'elif_dev',
    likes: 788, comments: 55, reposts: 162, privacy: 'followers'
  },
  {
    id: '7', type: 'topic',
    author: { name: 'Yuki Tanaka', handle: 'yukitan', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&h=64&fit=crop&auto=format', verified: true, server: 'infosec.exchange' },
    content: "End-to-end encryption in XMPP with OMEMO is underrated. Signal-level security, open protocol, no phone number required. Why aren't more people talking about this?",
    timestamp: '4h', sourceTopic: 'xmpp-feed:seed-privacy', topic: 'Privacy', topicColor: '#a855f7',
    likes: 2103, comments: 147, reposts: 489, liked: true, bookmarked: true, privacy: 'public'
  },
  {
    id: '8', type: 'community',
    author: { name: 'Ingrid Larsen', handle: 'ingridl', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=64&h=64&fit=crop&auto=format', server: 'sigmoid.social' },
    content: 'Friendly reminder that the #FediDev monthly call is tomorrow at 18:00 UTC. Agenda: Federated search improvements, ActivityPub C2S status update, and XMPP gateway proposals.',
    timestamp: '5h', sourceTopic: 'xmpp-collection:fedidev', community: 'FediDev', communityIcon: '🌐',
    likes: 44, comments: 12, reposts: 31, privacy: 'public'
  }
]

export const TRENDING_TOPICS: TrendingTopic[] = [
  { tag: 'DecentralWeb', count: '4.2k' },
  { tag: 'XMPPProtocol', count: '1.8k' },
  { tag: 'Privacy', count: '12.4k' },
  { tag: 'FediDev', count: '891' },
  { tag: 'OpenSource', count: '6.7k' }
]
