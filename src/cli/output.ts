import readline from 'readline'
import { CliContext } from './types.js'

export const formatPresence = (presence?: { type: string; show?: string; status?: string; nickname?: string }) => {
  if (!presence) {
    return ''
  }
  return `${presence.type}${presence.show ? ` [${presence.show}]` : ''}${presence.status ? ` (${presence.status})` : ''}${presence.nickname ? ` <${presence.nickname}>` : ''}`
}

export const printCliHelp = () => {
  console.log('Commands:')
  console.log('  peers                      List discovered peers')
  console.log('  dial <peer-id/multiaddr>   Manually connect/dial a peer')
  console.log('  msg <peer-id> <message>    Send an XMPP chat message')
  console.log('  msg secure <peer> <msg>    Send an OMEMO encrypted chat message')
  console.log('  omemo key                  Print local OMEMO key material')
  console.log('  omemo fetch <peer>         Fetch and cache a peer OMEMO bundle')
  console.log('  presence <status>          Broadcast custom status')
  console.log('  nick <name>                Set and broadcast your nickname')
  console.log('  csi <active|inactive>      Set local client state indication')
  console.log('  presence subscribe <peer>  Request presence subscription')
  console.log('  presence unsubscribe <peer> Cancel presence subscription')
  console.log('  roster list                List local roster entries')
  console.log('  roster add <jid> [name]    Add a roster contact')
  console.log('  roster remove <jid>        Remove a roster contact')
  console.log('  roster fetch <peer>        Fetch a peer roster over IQ')
  console.log('  disco info <peer> [node]   Query disco#info for a peer')
  console.log('  disco items <peer> [node]  Query disco#items for a peer')
  console.log('  feed post <message>        Publish a post to your feed')
  console.log('  feed subscribe <peer> [public|private] Subscribe to a peer feed')
  console.log('  feed visibility <peer> <public|private> Change follow visibility')
  console.log('  feed unfollow <peer>       Stop following a peer feed')
  console.log('  feed list                  List recent local feed posts')
  console.log('  feed peers                 List active feed subscriptions')
  console.log('  feed followers <peer>      List public followers for a feed')
  console.log('  collection create <id> [name] Create a community channel')
  console.log('  collection add <id> <peer> Add a user feed to a collection')
  console.log('  collection join <id>       Subscribe to a collection channel')
  console.log('  collection list            List collections')
  console.log('  collection posts [id]      List aggregated collection posts')
  console.log('  pubsub-notice <topic> <id> [text] Publish a noticed attachment')
  console.log('  pubsub-react <topic> <id> <emoji> Publish an emoji reaction')
  console.log('  pubsub-attachments [topic] [id] List local attachments')
  console.log('  pubsub-summary [topic] [id]  Show attachment counts')
  console.log('  pubsub-secure <topic> <key> <secret> <msg> Publish an encrypted pubsub item')
  console.log('  pubsub-sub <topic>         Subscribe to a PubSub topic')
  console.log('  pubsub-pub <topic> <msg>   Publish a message to a topic')
  console.log('  muc-join <room> <nick>     Join a decentralized MUC room')
  console.log('  muc-send <room> <msg>      Send a message to a MUC room')
  console.log('  muc-send-secure <room> <msg> Send an encrypted message to a MUC room')
  console.log('  muc-leave <room>           Leave a MUC room')
  console.log('  muc-roster <room>          List current room occupants')
  console.log('  id                         Print local Peer ID & JID')
  console.log('  help                       Show this help menu')
  console.log('  exit                       Quit the application')
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
    rl.setPrompt('xmpp-p2p> ')
    rl.prompt()
  },
  resolvePeerTarget: (target: string) => discoveredPeers.get(target)?.[0] ?? target
})
