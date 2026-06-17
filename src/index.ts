import { createP2PNode } from './p2p.js'
import { XmppNode } from './xmpp-node.js'
import readline from 'readline'

async function main() {
  const args = process.argv.slice(2)
  const portArg = args.find(arg => arg.startsWith('--port='))
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : undefined
  const rosterPathArg = args.find(arg => arg.startsWith('--roster-file='))?.split('=')[1]

  console.log('Initializing libp2p Node...')
  const libp2p = await createP2PNode(port)
  
  // Register lifecycle listeners
  await libp2p.start()
  console.log('libp2p Node started!')
  console.log(`Peer ID: ${libp2p.peerId.toString()}`)
  console.log('Listening Addresses:')
  libp2p.getMultiaddrs().forEach((ma: any) => {
    console.log(`  ${ma.toString()}`)
  })

  // Create XmppNode wrapper
  const xmppNode = new XmppNode(libp2p, rosterPathArg ? { rosterPath: rosterPathArg } : {})
  await xmppNode.ready

  // Keep track of discovered peers via mDNS
  const discoveredPeers = new Map<string, string[]>()
  libp2p.addEventListener('peer:discovery', (evt: any) => {
    const peerId = evt.detail.id.toString()
    if (peerId !== libp2p.peerId.toString()) {
      const addrs = evt.detail.multiaddrs.map((ma: any) => ma.toString())
      const isNew = !discoveredPeers.has(peerId)
      discoveredPeers.set(peerId, addrs)
      if (isNew) {
        console.log(`\n[Discovery] Discovered new peer: ${peerId}`)
        console.log(`Type 'dial ${peerId}' to connect or list multiaddrs using 'peers'`)
      }
    }
  })

  // Set up XMPP event listeners
  xmppNode.on('message', (msg) => {
    console.log(`\n[XMPP Message] From: ${msg.from}`)
    console.log(`  Body: ${msg.body}`)
    showPrompt()
  })

  xmppNode.on('presence', (pres) => {
    console.log(`\n[XMPP Presence] From: ${pres.from}`)
    if (pres.type === 'unavailable') {
      console.log(`  Status: Offline`)
    } else {
      console.log(`  Status: Online${pres.show ? ` [${pres.show}]` : ''}${pres.status ? ` (${pres.status})` : ''}`)
    }
    showPrompt()
  })

  xmppNode.on('roster:change', (entry) => {
    console.log(`\n[Roster] Updated: ${entry.jid}`)
    console.log(`  Subscription: ${entry.subscription}${entry.ask ? ` (ask=${entry.ask})` : ''}`)
    if (entry.presence) {
      console.log(`  Presence: ${entry.presence.type}${entry.presence.show ? ` [${entry.presence.show}]` : ''}${entry.presence.status ? ` (${entry.presence.status})` : ''}`)
    }
    showPrompt()
  })

  xmppNode.on('roster:remove', (jid) => {
    console.log(`\n[Roster] Removed: ${jid}`)
    showPrompt()
  })

  xmppNode.on('stream', ({ peerId, direction }) => {
    console.log(`\n[XMPP Connection] ${direction === 'inbound' ? 'Inbound' : 'Outbound'} session established with ${peerId}`)
    showPrompt()
  })

  xmppNode.on('stream-closed', (peerId) => {
    console.log(`\n[XMPP Connection] Session closed with ${peerId}`)
    showPrompt()
  })

  xmppNode.on('pubsub:message', (msg) => {
    console.log(`\n[XMPP PubSub Event] Topic: ${msg.topic}`)
    console.log(`  From: ${msg.from}`)
    console.log(`  Item ID: ${msg.itemId}`)
    console.log(`  Body: ${msg.body}`)
    showPrompt()
  })

  xmppNode.on('feed:post', (post) => {
    console.log(`\n[Feed Post] Topic: ${post.topic}`)
    console.log(`  From: ${post.from}`)
    console.log(`  Item ID: ${post.id}`)
    if (post.title) {
      console.log(`  Title: ${post.title}`)
    }
    console.log(`  Body: ${post.body}`)
    console.log(`  Published: ${post.publishedAt}`)
    showPrompt()
  })

  xmppNode.on('feed:subscribe', (subscription) => {
    console.log(`\n[Feed] Subscribed to ${subscription.jid}`)
    console.log(`  Topic: ${subscription.topic}`)
    console.log(`  Visibility: ${subscription.visibility}`)
    showPrompt()
  })

  xmppNode.on('feed:visibility', (subscription) => {
    console.log(`\n[Feed] Visibility updated for ${subscription.jid}`)
    console.log(`  Topic: ${subscription.topic}`)
    console.log(`  Visibility: ${subscription.visibility}`)
    showPrompt()
  })

  xmppNode.on('feed:follower', (follower) => {
    console.log(`\n[Followers] ${follower.feedPeerId} has a public follower`)
    console.log(`  Follower: ${follower.followerJid}`)
    console.log(`  Visibility: ${follower.visibility}`)
    showPrompt()
  })

  xmppNode.on('disco:info', ({ peerId, info }) => {
    console.log(`\n[Disco#Info] Peer: ${peerId}`)
    if (info.node) {
      console.log(`  Node: ${info.node}`)
    }
    for (const identity of info.identities) {
      console.log(`  Identity: ${identity.category}${identity.type ? `/${identity.type}` : ''}${identity.name ? ` (${identity.name})` : ''}`)
    }
    for (const feature of info.features) {
      console.log(`  Feature: ${feature}`)
    }
    console.log(`  Ver: ${info.ver}`)
    showPrompt()
  })

  xmppNode.on('disco:items', ({ peerId, items }) => {
    console.log(`\n[Disco#Items] Peer: ${peerId}`)
    for (const item of items) {
      console.log(`  - ${item.jid}`)
      if (item.node) {
        console.log(`      Node: ${item.node}`)
      }
      if (item.name) {
        console.log(`      Name: ${item.name}`)
      }
    }
    showPrompt()
  })

  xmppNode.on('caps:discovered', (caps) => {
    if (!caps) {
      return
    }
    console.log(`\n[Caps] Discovered capabilities for ${caps.peerId}`)
    console.log(`  Node: ${caps.node}`)
    console.log(`  Ver: ${caps.ver}`)
    showPrompt()
  })

  xmppNode.on('collection:change', (collection) => {
    console.log(`\n[Collection] Updated: ${collection.id}`)
    console.log(`  Topic: ${collection.topic}`)
    console.log(`  Members: ${collection.members.length}`)
    showPrompt()
  })

  xmppNode.on('collection:subscribe', (subscription) => {
    console.log(`\n[Collection] Subscribed: ${subscription.id}`)
    console.log(`  Topic: ${subscription.topic}`)
    showPrompt()
  })

  xmppNode.on('collection:post', (post) => {
    console.log(`\n[Collection Post] Collection: ${post.collectionId}`)
    console.log(`  Source: ${post.sourceTopic}`)
    console.log(`  From: ${post.from}`)
    console.log(`  Item ID: ${post.id}`)
    console.log(`  Body: ${post.body}`)
    showPrompt()
  })

  xmppNode.on('attachment:post', (attachment) => {
    console.log(`\n[Attachment] Topic: ${attachment.topic}`)
    console.log(`  Target: ${attachment.targetId}`)
    console.log(`  From: ${attachment.from}`)
    console.log(`  Item ID: ${attachment.id}`)
    console.log(`  Kind: ${attachment.kind}`)
    if (attachment.value) {
      console.log(`  Value: ${attachment.value}`)
    }
    showPrompt()
  })

  xmppNode.on('attachment:summary', (summary) => {
    console.log(`\n[Attachment Summary] Topic: ${summary.topic}`)
    console.log(`  Target: ${summary.targetId}`)
    console.log(`  Total: ${summary.total}`)
    console.log(`  Noticed: ${summary.noticed}`)
    console.log(`  Reactions: ${summary.reactions}`)
    const reactionEntries = Object.entries(summary.reactionCounts)
    if (reactionEntries.length > 0) {
      for (const [reaction, count] of reactionEntries) {
        console.log(`    ${reaction}: ${count}`)
      }
    }
    showPrompt()
  })

  xmppNode.on('error', (err) => {
    console.error(`\n[XMPP Error] ${err.message}`)
    showPrompt()
  })

  // Start CLI Readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const showPrompt = () => {
    rl.setPrompt('xmpp-p2p> ')
    rl.prompt()
  }

  const resolvePeerTarget = (target: string) => discoveredPeers.get(target)?.[0] ?? target

  console.log('\n======================================')
  console.log('XMPP over libp2p CLI')
  console.log('Available commands:')
  console.log('  peers                      List discovered peers')
  console.log('  dial <peer-id/multiaddr>   Manually connect/dial a peer')
  console.log('  msg <peer-id> <message>    Send an XMPP chat message')
  console.log('  presence <status>          Broadcast custom status')
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
  console.log('  pubsub-sub <topic>         Subscribe to a PubSub topic')
  console.log('  pubsub-pub <topic> <msg>   Publish a message to a topic')
  console.log('  id                         Print local Peer ID & JID')
  console.log('  help                       Show this help menu')
  console.log('  exit                       Quit the application')
  console.log('======================================\n')

  showPrompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) {
      showPrompt()
      return
    }

    const parts = input.split(' ')
    const command = parts[0].toLowerCase()

    try {
      switch (command) {
        case 'peers': {
          console.log(`Discovered Peers (${discoveredPeers.size}):`)
          for (const [peerId, addrs] of discoveredPeers.entries()) {
            console.log(`  - ${peerId}`)
            addrs.forEach(addr => console.log(`      Address: ${addr}`))
          }
          break
        }
        case 'dial': {
          if (parts.length < 2) {
            console.log('Usage: dial <peer-id/multiaddr>')
            break
          }
          let target = parts[1]
          const addrs = discoveredPeers.get(target)
          if (addrs && addrs.length > 0) {
            target = addrs[0]
          }
          console.log(`Dialing ${target}...`)
          await xmppNode.getOrCreateStream(target)
          console.log('Dial successful!')
          break
        }
        case 'msg': {
          if (parts.length < 3) {
            console.log('Usage: msg <peer-id> <message>')
            break
          }
          const target = resolvePeerTarget(parts[1])
          const text = parts.slice(2).join(' ')
          console.log(`Sending message to ${target}...`)
          await xmppNode.sendMessage(target, text)
          console.log('Sent!')
          break
        }
        case 'presence': {
          const presenceCommand = parts[1]?.toLowerCase()
          if (!presenceCommand) {
            const status = parts.slice(1).join(' ')
            console.log(`Updating presence status to: ${status || 'Online'}`)
            await xmppNode.broadcastPresence('available', status)
            break
          }

          if (presenceCommand === 'subscribe' || presenceCommand === 'unsubscribe') {
            const target = parts[2]
            if (!target) {
              console.log(`Usage: presence ${presenceCommand} <peer-id|jid|multiaddr>`)
              break
            }
            console.log(`${presenceCommand === 'subscribe' ? 'Requesting' : 'Cancelling'} presence subscription for ${target}...`)
            if (presenceCommand === 'subscribe') {
              await xmppNode.subscribePresence(target)
            } else {
              await xmppNode.unsubscribePresence(target)
            }
            console.log('Done!')
            break
          }

          if (presenceCommand === 'available' || presenceCommand === 'show') {
            const show = presenceCommand === 'show' ? parts[2] : parts[2]
            const status = parts.slice(presenceCommand === 'show' ? 3 : 2).join(' ')
            console.log(`Updating presence to available${show ? ` [${show}]` : ''}${status ? ` (${status})` : ''}`)
            await xmppNode.broadcastPresence('available', status, show)
            break
          }

          if (presenceCommand === 'unavailable') {
            const status = parts.slice(2).join(' ')
            console.log(`Updating presence to unavailable${status ? ` (${status})` : ''}`)
            await xmppNode.broadcastPresence('unavailable', status)
            break
          }

          const status = parts.slice(1).join(' ')
          console.log(`Updating presence status to: ${status || 'Online'}`)
          await xmppNode.broadcastPresence('available', status)
          break
        }
        case 'feed': {
          const feedCommand = parts[1]?.toLowerCase()
          switch (feedCommand) {
            case 'post': {
              if (parts.length < 3) {
                console.log('Usage: feed post <message>')
                break
              }
              const body = parts.slice(2).join(' ')
              console.log('Publishing feed post...')
              const itemId = await xmppNode.publishFeed(body)
              console.log(`Published feed item: ${itemId}`)
              break
            }
            case 'subscribe': {
              if (parts.length < 3) {
                console.log('Usage: feed subscribe <peer-id|jid|multiaddr> [public|private]')
                break
              }
              const target = resolvePeerTarget(parts[2])
              const visibility = parts[3] === 'public' ? 'public' : 'private'
              console.log(`Subscribing to feed at ${target}...`)
              await xmppNode.subscribeFeed(target, { visibility })
              console.log('Subscribed!')
              break
            }
            case 'visibility': {
              if (parts.length < 4) {
                console.log('Usage: feed visibility <peer-id|jid|multiaddr> <public|private>')
                break
              }
              const target = resolvePeerTarget(parts[2])
              const visibility = parts[3] === 'public' ? 'public' : 'private'
              console.log(`Updating visibility for ${target} to ${visibility}...`)
              await xmppNode.setFeedSubscriptionVisibility(target, visibility)
              console.log('Updated!')
              break
            }
            case 'unfollow': {
              if (parts.length < 3) {
                console.log('Usage: feed unfollow <peer-id|jid|multiaddr>')
                break
              }
              const target = resolvePeerTarget(parts[2])
              console.log(`Stopping follow of ${target}...`)
              await xmppNode.unsubscribeFeed(target)
              console.log('Unfollowed!')
              break
            }
            case 'list': {
              const posts = await xmppNode.getFeedPosts()
              console.log(`Recent feed posts (${posts.length}):`)
              for (const post of posts) {
                console.log(`  - ${post.topic}`)
                console.log(`      Item ID: ${post.id}`)
                console.log(`      From: ${post.from}`)
                if (post.title) {
                  console.log(`      Title: ${post.title}`)
                }
                console.log(`      Body: ${post.body}`)
                console.log(`      Published: ${post.publishedAt}`)
              }
              break
            }
            case 'peers': {
              const subscriptions = await xmppNode.getFeedSubscriptions()
              console.log(`Feed subscriptions (${subscriptions.length}):`)
              for (const subscription of subscriptions) {
                console.log(`  - ${subscription.jid}`)
                console.log(`      Topic: ${subscription.topic}`)
                console.log(`      Visibility: ${subscription.visibility}`)
                console.log(`      Subscribed At: ${subscription.subscribedAt}`)
              }
              break
            }
            case 'followers': {
              if (parts.length < 3) {
                console.log('Usage: feed followers <peer-id|jid|multiaddr>')
                break
              }
              const target = resolvePeerTarget(parts[2])
              const followers = await xmppNode.getFeedFollowers(target)
              console.log(`Public followers for ${target} (${followers.length}):`)
              for (const follower of followers) {
                console.log(`  - ${follower.followerJid}`)
                console.log(`      Visibility: ${follower.visibility}`)
                console.log(`      Subscribed At: ${follower.subscribedAt}`)
              }
              break
            }
            default:
              console.log('Usage: feed post <message> | feed subscribe <peer> [public|private] | feed visibility <peer> <public|private> | feed unfollow <peer> | feed list | feed peers | feed followers <peer>')
          }
          break
        }
        case 'disco': {
          const discoCommand = parts[1]?.toLowerCase()
          switch (discoCommand) {
            case 'info': {
              if (parts.length < 3) {
                console.log('Usage: disco info <peer-id|jid|multiaddr> [node]')
                break
              }
              const target = resolvePeerTarget(parts[2])
              const node = parts[3]
              console.log(`Querying disco#info for ${target}...`)
              const info = await xmppNode.getDiscoInfo(target, node)
              console.log(`Disco info ver: ${info.ver}`)
              break
            }
            case 'items': {
              if (parts.length < 3) {
                console.log('Usage: disco items <peer-id|jid|multiaddr> [node]')
                break
              }
              const target = resolvePeerTarget(parts[2])
              const node = parts[3]
              console.log(`Querying disco#items for ${target}...`)
              const items = await xmppNode.getDiscoItems(target, node)
              console.log(`Disco items (${items.length}):`)
              for (const item of items) {
                console.log(`  - ${item.jid}`)
                if (item.node) {
                  console.log(`      Node: ${item.node}`)
                }
                if (item.name) {
                  console.log(`      Name: ${item.name}`)
                }
              }
              break
            }
            default:
              console.log('Usage: disco info <peer> [node] | disco items <peer> [node]')
          }
          break
        }
        case 'collection': {
          const collectionCommand = parts[1]?.toLowerCase()
          switch (collectionCommand) {
            case 'create': {
              if (parts.length < 3) {
                console.log('Usage: collection create <id> [name]')
                break
              }
              const id = parts[2]
              const name = parts.slice(3).join(' ') || undefined
              console.log(`Creating collection ${id}...`)
              await xmppNode.createCollection(id, name)
              console.log('Created!')
              break
            }
            case 'add': {
              if (parts.length < 4) {
                console.log('Usage: collection add <id> <peer-id|jid|multiaddr>')
                break
              }
              const id = parts[2]
              const target = resolvePeerTarget(parts[3])
              console.log(`Adding feed ${target} to collection ${id}...`)
              await xmppNode.addFeedToCollection(id, target)
              console.log('Added!')
              break
            }
            case 'join': {
              if (parts.length < 3) {
                console.log('Usage: collection join <id>')
                break
              }
              const id = parts[2]
              console.log(`Joining collection ${id}...`)
              await xmppNode.subscribeCollection(id)
              console.log('Joined!')
              break
            }
            case 'list': {
              const collections = await xmppNode.getCollections()
              console.log(`Collections (${collections.length}):`)
              for (const collection of collections) {
                console.log(`  - ${collection.id}`)
                console.log(`      Topic: ${collection.topic}`)
                if (collection.name) {
                  console.log(`      Name: ${collection.name}`)
                }
                console.log(`      Members: ${collection.members.length}`)
              }
              break
            }
            case 'posts': {
              const id = parts[2]
              const posts = await xmppNode.getCollectionPosts(id)
              console.log(`Collection posts (${posts.length}):`)
              for (const post of posts) {
                console.log(`  - ${post.collectionId}`)
                console.log(`      Source: ${post.sourceTopic}`)
                console.log(`      Item ID: ${post.id}`)
                console.log(`      From: ${post.from}`)
                console.log(`      Body: ${post.body}`)
              }
              break
            }
            default:
              console.log('Usage: collection create <id> [name] | collection add <id> <peer> | collection join <id> | collection list | collection posts [id]')
          }
          break
        }
        case 'roster': {
          const subcommand = parts[1]?.toLowerCase()
          switch (subcommand) {
            case 'list': {
              const entries = await xmppNode.getRosterEntries()
              console.log(`Roster entries (${entries.length}):`)
              for (const entry of entries) {
                console.log(`  - ${entry.jid}`)
                console.log(`      Subscription: ${entry.subscription}${entry.ask ? ` (ask=${entry.ask})` : ''}`)
                if (entry.name) {
                  console.log(`      Name: ${entry.name}`)
                }
                if (entry.presence) {
                  console.log(`      Presence: ${entry.presence.type}${entry.presence.show ? ` [${entry.presence.show}]` : ''}${entry.presence.status ? ` (${entry.presence.status})` : ''}`)
                }
              }
              break
            }
            case 'add': {
              if (parts.length < 3) {
                console.log('Usage: roster add <jid> [name]')
                break
              }
              const jid = parts[2]
              const name = parts.slice(3).join(' ') || undefined
              await xmppNode.addRosterEntry(jid, name)
              console.log(`Added roster contact: ${jid}`)
              break
            }
            case 'remove': {
              if (parts.length < 3) {
                console.log('Usage: roster remove <jid>')
                break
              }
              const jid = parts[2]
              await xmppNode.removeRosterEntry(jid)
              console.log(`Removed roster contact: ${jid}`)
              break
            }
            case 'fetch': {
              if (parts.length < 3) {
                console.log('Usage: roster fetch <peer-id|jid|multiaddr>')
                break
              }
              const target = parts[2]
              const entries = await xmppNode.fetchRoster(target)
              console.log(`Remote roster entries (${entries.length}):`)
              for (const entry of entries) {
                console.log(`  - ${entry.jid}`)
                console.log(`      Subscription: ${entry.subscription}${entry.ask ? ` (ask=${entry.ask})` : ''}`)
                if (entry.name) {
                  console.log(`      Name: ${entry.name}`)
                }
                if (entry.presence) {
                  console.log(`      Presence: ${entry.presence.type}${entry.presence.show ? ` [${entry.presence.show}]` : ''}${entry.presence.status ? ` (${entry.presence.status})` : ''}`)
                }
              }
              break
            }
            default:
              console.log('Usage: roster list | roster add <jid> [name] | roster remove <jid> | roster fetch <peer>')
          }
          break
        }
        case 'pubsub-sub': {
          if (parts.length < 2) {
            console.log('Usage: pubsub-sub <topic>')
            break
          }
          const topic = parts[1]
          console.log(`Subscribing to topic: ${topic}...`)
          await xmppNode.subscribe(topic)
          console.log(`Subscribed!`)
          break
        }
        case 'pubsub-pub': {
          if (parts.length < 3) {
            console.log('Usage: pubsub-pub <topic> <message>')
            break
          }
          const topic = parts[1]
          const msgText = parts.slice(2).join(' ')
          console.log(`Publishing to topic ${topic}...`)
          const itemId = await xmppNode.publish(topic, msgText)
          console.log(`Published! Item ID: ${itemId}`)
          break
        }
        case 'pubsub-notice': {
          if (parts.length < 3) {
            console.log('Usage: pubsub-notice <topic> <target-item-id> [text]')
            break
          }
          const topic = parts[1]
          const targetId = parts[2]
          const text = parts.slice(3).join(' ') || undefined
          console.log(`Publishing noticed attachment to ${topic} for ${targetId}...`)
          const itemId = await xmppNode.notice(topic, targetId, text)
          console.log(`Published! Item ID: ${itemId}`)
          break
        }
        case 'pubsub-react': {
          if (parts.length < 4) {
            console.log('Usage: pubsub-react <topic> <target-item-id> <emoji>')
            break
          }
          const topic = parts[1]
          const targetId = parts[2]
          const emoji = parts[3]
          console.log(`Publishing reaction to ${topic} for ${targetId}...`)
          const itemId = await xmppNode.react(topic, targetId, emoji)
          console.log(`Published! Item ID: ${itemId}`)
          break
        }
        case 'pubsub-attachments': {
          const topic = parts[1]
          const targetId = parts[2]
          const attachments = await xmppNode.getAttachments(topic, targetId)
          console.log(`Attachments (${attachments.length}):`)
          for (const attachment of attachments) {
            console.log(`  - ${attachment.topic}`)
            console.log(`      Target: ${attachment.targetId}`)
            console.log(`      From: ${attachment.from}`)
            console.log(`      Item ID: ${attachment.id}`)
            console.log(`      Kind: ${attachment.kind}`)
            if (attachment.value) {
              console.log(`      Value: ${attachment.value}`)
            }
            console.log(`      Published: ${attachment.publishedAt}`)
          }
          break
        }
        case 'pubsub-summary': {
          const topic = parts[1]
          const targetId = parts[2]
          if (topic && targetId) {
            const attachments = await xmppNode.getAttachments(topic, targetId)
            const summaries = await xmppNode.getAttachmentSummaries(topic)
            const summary = summaries.find(entry => entry.targetId === targetId)
            console.log(`Attachment summary for ${topic} / ${targetId}:`)
            console.log(`  Total: ${summary?.total ?? attachments.length}`)
            console.log(`  Noticed: ${summary?.noticed ?? attachments.filter(entry => entry.kind === 'noticed').length}`)
            console.log(`  Reactions: ${summary?.reactions ?? attachments.filter(entry => entry.kind === 'reaction').length}`)
            const reactionCounts = summary?.reactionCounts ?? attachments.reduce<Record<string, number>>((acc, attachment) => {
              if (attachment.kind === 'reaction' && attachment.value) {
                acc[attachment.value] = (acc[attachment.value] ?? 0) + 1
              }
              return acc
            }, {})
            const reactionEntries = Object.entries(reactionCounts)
            if (reactionEntries.length > 0) {
              for (const [reaction, count] of reactionEntries) {
                console.log(`    ${reaction}: ${count}`)
              }
            }
          } else if (topic) {
            const summaries = await xmppNode.getAttachmentSummaries(topic)
            console.log(`Attachment summaries for ${topic} (${summaries.length}):`)
            for (const summary of summaries) {
              console.log(`  - ${summary.targetId}`)
              console.log(`      Total: ${summary.total}`)
              console.log(`      Noticed: ${summary.noticed}`)
              console.log(`      Reactions: ${summary.reactions}`)
              for (const [reaction, count] of Object.entries(summary.reactionCounts)) {
                console.log(`      ${reaction}: ${count}`)
              }
            }
          } else {
            const summaries = await xmppNode.getAttachmentSummaries()
            console.log(`Attachment summaries (${summaries.length}):`)
            for (const summary of summaries) {
              console.log(`  - ${summary.topic}`)
              console.log(`      Target: ${summary.targetId}`)
              console.log(`      Total: ${summary.total}`)
              console.log(`      Noticed: ${summary.noticed}`)
              console.log(`      Reactions: ${summary.reactions}`)
              for (const [reaction, count] of Object.entries(summary.reactionCounts)) {
                console.log(`      ${reaction}: ${count}`)
              }
            }
          }
          break
        }
        case 'id': {
          console.log(`Local Peer ID: ${libp2p.peerId.toString()}`)
          console.log(`Local JID:     ${xmppNode.jid}`)
          console.log('Listening Addresses:')
          libp2p.getMultiaddrs().forEach((ma: any) => console.log(`  ${ma.toString()}`))
          break
        }
        case 'help': {
          console.log('Commands:')
          console.log('  peers                      List discovered peers')
          console.log('  dial <peer-id/multiaddr>   Manually connect/dial a peer')
          console.log('  msg <peer-id> <message>    Send an XMPP chat message')
          console.log('  presence <status>          Broadcast custom status')
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
          console.log('  pubsub-sub <topic>         Subscribe to a PubSub topic')
          console.log('  pubsub-pub <topic> <msg>   Publish a message to a topic')
          console.log('  id                         Print local Peer ID & JID')
          console.log('  help                       Show this help menu')
          console.log('  exit                       Quit the application')
          break
        }
        case 'exit': {
          console.log('Shutting down...')
          rl.close()
          return
        }
        default:
          console.log(`Unknown command: "${command}". Type "help" for a list of commands.`)
      }
    } catch (err: any) {
      console.error(`Error executing command: ${err.message}`)
    }

    showPrompt()
  })

  rl.on('close', async () => {
    await xmppNode.close()
    await libp2p.stop()
    console.log('Goodbye!')
    process.exit(0)
  })
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
