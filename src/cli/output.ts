/**
 * @packageDocumentation CLI help and formatting helpers for command discovery and
 * presence text rendering.
 */

import readline from 'readline'
import { CliContext } from './types.js'

/**
 * Formats a presence record into the compact CLI display string.
 *
 * @param presence - Presence state and optional metadata.
 * @returns A human-readable summary or an empty string when absent.
 */
export const formatPresence = (presence?: { type: string; show?: string; status?: string; nickname?: string }) => {
  if (!presence) {
    return ''
  }
  return `${presence.type}${presence.show ? ` [${presence.show}]` : ''}${presence.status ? ` (${presence.status})` : ''}${presence.nickname ? ` <${presence.nickname}>` : ''}`
}

/**
 * Help topic definition used by the `help <topic>` command.
 */
type HelpTopic = {
  title: string
  lines: string[]
}

const helpSections: Record<string, string[]> = {
  system: [
    '  peers                      List discovered peers',
    '  dial <peer-id/multiaddr>   Manually connect/dial a peer',
    '  ping <peer-id/multiaddr>   Measure round-trip latency to a peer',
    '  id                         Print local Peer ID & JID',
    '  help [topic]               Show help for a topic or command group',
    '  exit                       Quit the application'
  ],
  messaging: [
    '  msg <peer-id> <message>    Send an XMPP chat message',
    '  msg secure <peer> <msg>    Send an OMEMO encrypted chat message',
    '  msg correct [secure] <peer> <id> <msg> Replace a message',
    '  msg state <peer> <state>   Send a chat state notification'
  ],
  presence: [
    '  presence <status>          Broadcast custom status',
    '  presence subscribe <peer>  Request presence subscription',
    '  presence unsubscribe <peer> Cancel presence subscription',
    '  presence send <peer> [type] [--show <show>] [--status <msg>] Send a direct presence stanza',
    '  csi <active|inactive>      Set local client state indication'
  ],
  profile: [
    '  profile [show]             Show local profile details',
    '  profile set [--fn <name>] [--nick <nickname>] [--photo <path>] [--photo-type <mime>] Update local profile',
    '  profile clear-photo        Remove the local profile photo',
    '  nick <name>                Set and broadcast your nickname'
  ],
  roster: [
    '  roster list                List local roster entries',
    '  roster add <jid> [name]    Add a roster contact',
    '  roster remove <jid>        Remove a roster contact',
    '  roster fetch <peer>        Fetch a peer roster over IQ'
  ],
  disco: [
    '  disco info <peer> [node]   Query disco#info for a peer',
    '  disco items <peer> [node]  Query disco#items for a peer',
    '  disco caps <peer> [node]   Show entity capabilities for a peer'
  ],
  feed: [
    '  feed post <message> [--title <title>] [--tag <tag>] [--cover <path>] Publish a post to your feed',
    '  feed article <message> [--title <title>] [--tag <tag>] [--cover <path>] [--cover-target <peer>] Publish an article with a cover image',
    '  feed subscribe <peer> [public|private] Subscribe to a peer feed',
    '  feed public               List public feed subscriptions',
    '  feed visibility <peer> <public|private> Change follow visibility',
    '  feed unfollow <peer>       Stop following a peer feed',
    '  feed list                  List recent local feed posts',
    '  feed peers                 List active feed subscriptions',
    '  feed followers <peer>      List public followers for a feed',
    '  feed watch-followers <peer> Watch follower updates for a feed'
  ],
  collection: [
    '  collection create <id> [name] Create a community channel',
    '  collection add <id> <peer> Add a user feed to a collection',
    '  collection join <id>       Subscribe to a collection channel',
    '  collection leave <id>      Unsubscribe from a collection channel',
    '  collection post <id> <message> Publish a post into a collection',
    '  collection list            List collections',
    '  collection subscriptions   List collection subscriptions',
    '  collection posts [id]      List aggregated collection posts'
  ],
  pubsub: [
    '  pubsub-notice <topic> <id> [text] Publish a noticed attachment',
    '  pubsub-react <topic> <id> <emoji> Publish an emoji reaction',
    '  pubsub-attachments [topic] [id] List local attachments',
    '  pubsub-summary [topic] [id]  Show attachment counts',
    '  pubsub-secure <topic> <key> <secret> <msg> Publish an encrypted pubsub item',
    '  pubsub-sub <topic>         Subscribe to a PubSub topic',
    '  pubsub-pub <topic> <msg>   Publish a message to a topic'
  ],
  muc: [
    '  muc-join <room> <nick>     Join a decentralized MUC room',
    '  muc-send <room> <msg>      Send a message to a MUC room',
    '  muc-send-secure <room> <msg> Send an encrypted message to a MUC room',
    '  muc-leave <room>           Leave a MUC room',
    '  muc-roster <room>          List current room occupants',
    '  muc-history <room> <peer>  Request MAM message history from a peer'
  ],
  crypto: [
    '  omemo key                  Print local OMEMO key material',
    '  omemo fetch <peer>         Fetch and cache a peer OMEMO bundle',
    '  openpgp key                Print local OpenPGP material',
    '  openpgp fetch <peer>       Fetch and cache a peer OpenPGP key'
  ]
}

const helpCommands: Record<string, HelpTopic> = {
  'system:peers': {
    title: 'help peers',
    lines: [
      '  peers                      List discovered peers'
    ]
  },
  'system:dial': {
    title: 'help dial',
    lines: [
      '  dial <peer-id/multiaddr>   Manually connect/dial a peer'
    ]
  },
  'system:ping': {
    title: 'help ping',
    lines: [
      '  ping <peer-id/multiaddr>   Measure round-trip latency to a peer'
    ]
  },
  'system:id': {
    title: 'help id',
    lines: [
      '  id                         Print local Peer ID & JID'
    ]
  },
  'system:help': {
    title: 'help help',
    lines: [
      '  help [topic]               Show help for a topic or command group'
    ]
  },
  'system:exit': {
    title: 'help exit',
    lines: [
      '  exit                       Quit the application'
    ]
  },
  'messaging:msg': {
    title: 'help msg',
    lines: [
      '  msg <peer-id> <message>    Send an XMPP chat message',
      '  msg secure <peer> <msg>    Send an OMEMO encrypted chat message',
      '  msg correct [secure] <peer> <id> <msg> Replace a message',
      '  msg state <peer> <state>   Send a chat state notification'
    ]
  },
  'presence:presence': {
    title: 'help presence',
    lines: [
      '  presence <status>          Broadcast custom status',
      '  presence subscribe <peer>  Request presence subscription',
      '  presence unsubscribe <peer> Cancel presence subscription'
    ]
  },
  'presence:subscribe': {
    title: 'help presence subscribe',
    lines: [
      '  presence subscribe <peer>  Request presence subscription'
    ]
  },
  'presence:unsubscribe': {
    title: 'help presence unsubscribe',
    lines: [
      '  presence unsubscribe <peer> Cancel presence subscription'
    ]
  },
  'presence:send': {
    title: 'help presence send',
    lines: [
      '  presence send <peer> [type] [--show <show>] [--status <msg>] Send a direct presence stanza'
    ]
  },
  'presence:available': {
    title: 'help presence available',
    lines: [
      '  presence available [show] [status] Broadcast an available presence'
    ]
  },
  'presence:show': {
    title: 'help presence show',
    lines: [
      '  presence show <show> [status] Broadcast an available presence with a show value'
    ]
  },
  'presence:unavailable': {
    title: 'help presence unavailable',
    lines: [
      '  presence unavailable [status] Broadcast an unavailable presence'
    ]
  },
  'presence:csi': {
    title: 'help csi',
    lines: [
      '  csi <active|inactive>      Set local client state indication'
    ]
  },
  'profile:profile': {
    title: 'help profile',
    lines: [
      '  profile [show]             Show local profile details',
      '  profile set [--fn <name>] [--nick <nickname>] [--photo <path>] [--photo-type <mime>] Update local profile',
      '  profile clear-photo        Remove the local profile photo'
    ]
  },
  'profile:nick': {
    title: 'help nick',
    lines: [
      '  nick <name>                Set and broadcast your nickname'
    ]
  },
  'profile:set': {
    title: 'help profile set',
    lines: [
      '  profile set [--fn <name>] [--nick <nickname>] [--photo <path>] [--photo-type <mime>] Update local profile'
    ]
  },
  'profile:clear-photo': {
    title: 'help profile clear-photo',
    lines: [
      '  profile clear-photo        Remove the local profile photo'
    ]
  },
  'roster:roster': {
    title: 'help roster',
    lines: [
      '  roster list                List local roster entries',
      '  roster add <jid> [name]    Add a roster contact',
      '  roster remove <jid>        Remove a roster contact',
      '  roster fetch <peer>        Fetch a peer roster over IQ'
    ]
  },
  'roster:list': {
    title: 'help roster list',
    lines: [
      '  roster list                List local roster entries'
    ]
  },
  'roster:add': {
    title: 'help roster add',
    lines: [
      '  roster add <jid> [name]    Add a roster contact'
    ]
  },
  'roster:remove': {
    title: 'help roster remove',
    lines: [
      '  roster remove <jid>        Remove a roster contact'
    ]
  },
  'roster:fetch': {
    title: 'help roster fetch',
    lines: [
      '  roster fetch <peer>        Fetch a peer roster over IQ'
    ]
  },
  'disco:disco': {
    title: 'help disco',
    lines: [
      '  disco info <peer> [node]   Query disco#info for a peer',
      '  disco items <peer> [node]  Query disco#items for a peer'
    ]
  },
  'disco:info': {
    title: 'help disco info',
    lines: [
      '  disco info <peer> [node]   Query disco#info for a peer'
    ]
  },
  'disco:items': {
    title: 'help disco items',
    lines: [
      '  disco items <peer> [node]  Query disco#items for a peer'
    ]
  },
  'disco:caps': {
    title: 'help disco caps',
    lines: [
      '  disco caps <peer> [node]   Show entity capabilities for a peer'
    ]
  },
  'feed:feed': {
    title: 'help feed',
    lines: [
      '  feed post <message> [--title <title>] [--tag <tag>] [--cover <path>] Publish a post to your feed',
      '  feed article <message> [--title <title>] [--tag <tag>] [--cover <path>] [--cover-target <peer>] Publish an article with a cover image',
      '  feed subscribe <peer> [public|private] Subscribe to a peer feed',
      '  feed visibility <peer> <public|private> Change follow visibility',
      '  feed unfollow <peer>       Stop following a peer feed',
      '  feed list                  List recent local feed posts',
      '  feed peers                 List active feed subscriptions',
      '  feed followers <peer>      List public followers for a feed'
    ]
  },
  'feed:post': {
    title: 'help feed post',
    lines: [
      '  feed post <message> [--title <title>] [--tag <tag>] [--cover <path>] Publish a post to your feed'
    ]
  },
  'feed:article': {
    title: 'help feed article',
    lines: [
      '  feed article <message> [--title <title>] [--tag <tag>] [--cover <path>] [--cover-target <peer>] Publish an article with a cover image'
    ]
  },
  'feed:subscribe': {
    title: 'help feed subscribe',
    lines: [
      '  feed subscribe <peer> [public|private] Subscribe to a peer feed'
    ]
  },
  'feed:public': {
    title: 'help feed public',
    lines: [
      '  feed public               List public feed subscriptions'
    ]
  },
  'feed:visibility': {
    title: 'help feed visibility',
    lines: [
      '  feed visibility <peer> <public|private> Change follow visibility'
    ]
  },
  'feed:unfollow': {
    title: 'help feed unfollow',
    lines: [
      '  feed unfollow <peer>       Stop following a peer feed'
    ]
  },
  'feed:list': {
    title: 'help feed list',
    lines: [
      '  feed list                  List recent local feed posts'
    ]
  },
  'feed:peers': {
    title: 'help feed peers',
    lines: [
      '  feed peers                 List active feed subscriptions'
    ]
  },
  'feed:followers': {
    title: 'help feed followers',
    lines: [
      '  feed followers <peer>      List public followers for a feed'
    ]
  },
  'feed:watch-followers': {
    title: 'help feed watch-followers',
    lines: [
      '  feed watch-followers <peer> Watch follower updates for a feed'
    ]
  },
  'collection:collection': {
    title: 'help collection',
    lines: [
      '  collection create <id> [name] Create a community channel',
      '  collection add <id> <peer> Add a user feed to a collection',
      '  collection join <id>       Subscribe to a collection channel',
      '  collection list            List collections',
      '  collection posts [id]      List aggregated collection posts'
    ]
  },
  'collection:create': {
    title: 'help collection create',
    lines: [
      '  collection create <id> [name] Create a community channel'
    ]
  },
  'collection:add': {
    title: 'help collection add',
    lines: [
      '  collection add <id> <peer> Add a user feed to a collection'
    ]
  },
  'collection:join': {
    title: 'help collection join',
    lines: [
      '  collection join <id>       Subscribe to a collection channel'
    ]
  },
  'collection:leave': {
    title: 'help collection leave',
    lines: [
      '  collection leave <id>      Unsubscribe from a collection channel'
    ]
  },
  'collection:post': {
    title: 'help collection post',
    lines: [
      '  collection post <id> <message> Publish a post into a collection'
    ]
  },
  'collection:list': {
    title: 'help collection list',
    lines: [
      '  collection list            List collections'
    ]
  },
  'collection:subscriptions': {
    title: 'help collection subscriptions',
    lines: [
      '  collection subscriptions   List collection subscriptions'
    ]
  },
  'collection:posts': {
    title: 'help collection posts',
    lines: [
      '  collection posts [id]      List aggregated collection posts'
    ]
  },
  'pubsub:pubsub': {
    title: 'help pubsub',
    lines: [
      '  pubsub-notice <topic> <id> [text] Publish a noticed attachment',
      '  pubsub-react <topic> <id> <emoji> Publish an emoji reaction',
      '  pubsub-attachments [topic] [id] List local attachments',
      '  pubsub-summary [topic] [id]  Show attachment counts',
      '  pubsub-secure <topic> <key> <secret> <msg> Publish an encrypted pubsub item',
      '  pubsub-sub <topic>         Subscribe to a PubSub topic',
      '  pubsub-pub <topic> <msg>   Publish a message to a topic'
    ]
  },
  'muc:muc': {
    title: 'help muc',
    lines: [
      '  muc-join <room> <nick>     Join a decentralized MUC room',
      '  muc-send <room> <msg>      Send a message to a MUC room',
      '  muc-send-secure <room> <msg> Send an encrypted message to a MUC room',
      '  muc-leave <room>           Leave a MUC room',
      '  muc-roster <room>          List current room occupants'
    ]
  },
  'omemo:omemo': {
    title: 'help omemo',
    lines: [
      '  omemo key                  Print local OMEMO key material',
      '  omemo fetch <peer>         Fetch and cache a peer OMEMO bundle'
    ]
  },
  'omemo:key': {
    title: 'help omemo key',
    lines: [
      '  omemo key                  Print local OMEMO key material'
    ]
  },
  'omemo:fetch': {
    title: 'help omemo fetch',
    lines: [
      '  omemo fetch <peer>         Fetch and cache a peer OMEMO bundle'
    ]
  },
  'openpgp:openpgp': {
    title: 'help openpgp',
    lines: [
      '  openpgp key                Print local OpenPGP material',
      '  openpgp fetch <peer>       Fetch and cache a peer OpenPGP key'
    ]
  },
  'openpgp:key': {
    title: 'help openpgp key',
    lines: [
      '  openpgp key                Print local OpenPGP material'
    ]
  },
  'openpgp:fetch': {
    title: 'help openpgp fetch',
    lines: [
      '  openpgp fetch <peer>       Fetch and cache a peer OpenPGP key'
    ]
  }
}

const helpTopicAliases: Record<string, string> = {
  msg: 'messaging',
  messaging: 'messaging',
  presence: 'presence',
  profile: 'profile',
  roster: 'roster',
  disco: 'disco',
  feed: 'feed',
  collection: 'collection',
  pubsub: 'pubsub',
  muc: 'muc',
  omemo: 'crypto',
  openpgp: 'crypto',
  crypto: 'crypto',
  system: 'system',
  core: 'system'
}

const printSection = (heading: string, lines: string[]) => {
  console.log(heading)
  for (const line of lines) {
    console.log(line)
  }
}

export const printCliHelp = (...topicParts: string[]) => {
  const normalizedParts = topicParts.map(part => part.toLowerCase().trim()).filter(Boolean)
  const primaryTopic = normalizedParts[0]
  const secondaryTopic = normalizedParts[1]
  const sectionKey = primaryTopic ? helpTopicAliases[primaryTopic] : undefined
  const commandKey = primaryTopic && secondaryTopic
    ? helpCommands[`${primaryTopic}:${secondaryTopic}`]
      ? `${primaryTopic}:${secondaryTopic}`
      : sectionKey && helpCommands[`${sectionKey}:${secondaryTopic}`]
        ? `${sectionKey}:${secondaryTopic}`
        : undefined
    : undefined

  if (primaryTopic && !sectionKey) {
    console.log(`Unknown help topic: ${topicParts.join(' ')}`)
    console.log('')
  }

  if (commandKey && helpCommands[commandKey]) {
    const helpEntry = helpCommands[commandKey]
    printSection(`Commands for "${helpEntry.title.replace(/^help /, '')}":`, helpEntry.lines)
    console.log('')
    console.log('Type `help` to show all commands.')
    return
  }

  if (sectionKey) {
    if (secondaryTopic) {
      console.log(`Unknown ${primaryTopic} help topic: ${secondaryTopic}`)
      console.log('')
    }
    printSection(`Commands for "${primaryTopic}":`, helpSections[sectionKey])
    console.log('')
    console.log('Tip: try `help <command>` for a focused command synopsis.')
    return
  }

  console.log('Commands:')
  printSection('  System', helpSections.system)
  printSection('  Messaging', helpSections.messaging)
  printSection('  Presence & Profile', [...helpSections.presence, ...helpSections.profile])
  printSection('  Roster & Discovery', [...helpSections.roster, ...helpSections.disco])
  printSection('  Feeds & Collections', [...helpSections.feed, ...helpSections.collection])
  printSection('  PubSub', helpSections.pubsub)
  printSection('  MUC', helpSections.muc)
  printSection('  Crypto', helpSections.crypto)
}

export const createCliContext = (
  libp2p: CliContext['libp2p'],
  xmppNode: CliContext['xmppNode'],
  discoveredPeers: Map<string, string[]>,
  rl: readline.Interface
): CliContext => ({
  libp2p,
  xmppNode,
  discoveredPeers,
  rl,
  showPrompt: () => {
    if ((rl as any).closed) {
      return
    }
    rl.setPrompt('xmpp-p2p> ')
    rl.prompt()
  },
  resolvePeerTarget: (target: string) => discoveredPeers.get(target)?.[0] ?? target
})
