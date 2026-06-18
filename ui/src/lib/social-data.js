export const sectionMeta = {
  profile: 'Identity, availability, and protocol state'
}

export const initialState = {
  section: 'feed',
  feedFilter: 'all',
  secure: true,
  composerTargetId: 'feed',
  presence: 'available',
  presenceMessage: 'Online and reachable',
  activeChatId: 'aurora',
  activeCommunityId: 'lattice',
  activeFeedId: 'p-001',
  activeFeedCommunityId: 'lattice',
  identity: {
    nickname: 'atlas',
    jid: 'atlas@mesh.local',
    peerId: '12D3KooWQx8vNn9b3k9hA1pZ9rXc9Vf9M7kP8cY2zK4jJ6pD1fQ',
    transport: 'tcp + ws',
    connection: 'connected'
  },
  peers: [
    { id: 'self', label: 'atlas', kind: 'local', x: 140, y: 86, status: 'available' },
    { id: 'maya', label: 'maya', kind: 'contact', x: 54, y: 40, status: 'available' },
    { id: 'jun', label: 'jun', kind: 'contact', x: 222, y: 46, status: 'away' },
    { id: 'lattice', label: 'lattice', kind: 'community', x: 54, y: 130, status: 'live' },
    { id: 'feed', label: 'feed', kind: 'channel', x: 224, y: 128, status: 'live' }
  ],
  contacts: [
    { id: 'maya', name: 'Maya', jid: 'maya@chat.mesh', peerId: '12D3KooWaya', presence: 'available', subscription: 'both', trust: 'verified', capability: 'OMEMO + OpenPGP' },
    { id: 'jun', name: 'Jun', jid: 'jun@chat.mesh', peerId: '12D3KooWjun', presence: 'away', subscription: 'to', trust: 'known', capability: 'OMEMO' },
    { id: 'leo', name: 'Leo', jid: 'leo@chat.mesh', peerId: '12D3KooWleo', presence: 'busy', subscription: 'from', trust: 'pending', capability: 'PubSub only' }
  ],
  communities: [
    {
      id: 'lattice',
      name: 'Lattice',
      tag: '#lattice',
      description: 'Decentralized social sync',
      members: 5,
      visibility: 'public',
      color: 'community',
      joined: true
    },
    {
      id: 'signal',
      name: 'Signal Lab',
      tag: '#signal-lab',
      description: 'Protocol experiments and testing',
      members: 3,
      visibility: 'private',
      color: 'community-alt',
      joined: false
    }
  ],
  chats: [
    {
      id: 'aurora',
      kind: 'direct',
      name: 'Maya',
      secure: true,
      unread: 2,
      preview: 'Can you join the room after the feed post?',
      lastActivityMinutesAgo: 4,
      messages: [
        { from: 'Maya', text: 'Can you join the room after the feed post?', time: '09:14', self: false },
        { from: 'You', text: 'Yes. I will bring the secure thread summary.', time: '09:16', self: true },
        { from: 'Maya', text: 'Good. We should keep the roster visible.', time: '09:18', self: false }
      ]
    },
    {
      id: 'lattice-room',
      kind: 'muc',
      name: '#lattice-room',
      secure: false,
      topic: 'Decentralized social sync — room mirrors the Lattice community',
      localNick: 'atlas',
      occupants: [
        { nick: 'Maya', presence: 'available' },
        { nick: 'Jun', presence: 'away' },
        { nick: 'Priya', presence: 'available' },
        { nick: 'Sam', presence: 'busy' },
        { nick: 'Wren', presence: 'available' }
      ],
      preview: 'Jun, Maya +3 · Keeping the roster visible in sync with room state.',
      lastActivityMinutesAgo: 7,
      messages: [
        { from: 'Maya', text: 'Keeping the roster visible in sync with room state.', time: '09:05', self: false },
        { from: 'Jun', text: 'Confirmed on my side too.', time: '09:07', self: false }
      ]
    },
    {
      id: 'juniper',
      kind: 'direct',
      name: 'Jun',
      secure: false,
      unread: 0,
      preview: 'Checking DHT reachability and mdns peers.',
      lastActivityMinutesAgo: 33,
      messages: [
        { from: 'Jun', text: 'Checking DHT reachability and mdns peers.', time: '08:43', self: false },
        { from: 'You', text: 'Topologies look stable on loopback.', time: '08:44', self: true }
      ]
    },
    {
      id: 'core-team',
      kind: 'group',
      name: 'Core team',
      secure: true,
      unread: 1,
      participants: ['Maya', 'Jun', 'Priya'],
      preview: 'Priya: Pushed the attachment indexing fix.',
      lastActivityMinutesAgo: 50,
      messages: [
        { from: 'Priya', text: 'Pushed the attachment indexing fix.', time: '08:00', self: false },
        { from: 'Jun', text: 'Nice, testing it against the loopback peers now.', time: '08:05', self: false }
      ]
    }
  ],
  feedItems: [
    {
      id: 'p-001',
      sourceType: 'person',
      sourceId: 'maya',
      sourceLabel: 'Maya',
      avatar: 'M',
      title: 'Room sync complete',
      body: 'We kept the roster visible and the secure thread summary stayed in sync with the room state.',
      time: '2m',
      reactions: ['↩︎ 2', '♥ 8'],
      secure: true
    },
    {
      id: 'c-002',
      sourceType: 'community',
      sourceId: 'lattice',
      sourceLabel: '#lattice',
      avatar: 'L',
      title: 'Latest community digest',
      body: 'Published the latest room digest to the community collection so everyone sees the same social context.',
      time: '7m',
      reactions: ['↩︎ 1', '◌ 4'],
      secure: false
    },
    {
      id: 'p-003',
      sourceType: 'person',
      sourceId: 'jun',
      sourceLabel: 'Jun',
      avatar: 'J',
      title: 'DHT and discovery update',
      body: 'Reachability looks stable on loopback. I am checking pubsub and mdns peers next.',
      time: '13m',
      reactions: ['↩︎ 1', '★ 3'],
      secure: false
    },
    {
      id: 'c-004',
      sourceType: 'community',
      sourceId: 'signal',
      sourceLabel: '#signal-lab',
      avatar: 'S',
      title: 'Protocol experiment notes',
      body: 'A new attachment summary was indexed and grouped under the protocol testing collection.',
      time: '21m',
      reactions: ['↩︎ 3', '⟲ 5'],
      secure: true
    }
  ],
  protocol: [
    { label: 'Peer discovery', value: '5 live peers' },
    { label: 'Roster sync', value: '3 contacts' },
    { label: 'Secure sessions', value: '2 active' },
    { label: 'PubSub topics', value: '4 subscribed' },
    { label: 'DHT', value: 'reachable' }
  ]
}

export const badgeClass = (value) => {
  if (value === true || value === 'secure' || value === 'verified' || value === 'available' || value === 'public') {
    return 'badge badge--secure'
  }

  if (value === 'pending' || value === 'busy' || value === 'private' || value === 'away') {
    return 'badge badge--warn'
  }

  return 'badge badge--muted'
}

export const initials = (label) => label.slice(0, 1).toUpperCase()

export const filterLabels = {
  all: 'All',
  people: 'People',
  communities: 'Communities'
}

export const sortedChats = (chats) => [...chats].sort((a, b) => a.lastActivityMinutesAgo - b.lastActivityMinutesAgo)

export const chatAvatarGlyph = (chat) => {
  if (chat.kind === 'group') {
    return `${chat.participants[0].slice(0, 1).toUpperCase()}+${chat.participants.length - 1}`
  }

  return chat.name.replace('#', '').slice(0, 1).toUpperCase()
}
