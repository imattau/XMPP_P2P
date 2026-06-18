import { CliContext } from './cli-types.js'
import { formatPresence } from './cli-output.js'

export const attachCliEventListeners = (ctx: CliContext) => {
  const { xmppNode, showPrompt, discoveredPeers, libp2p } = ctx

  xmppNode.on('message', (msg) => {
    console.log(`\n[XMPP Message] From: ${msg.from}`)
    if (msg.encrypted) {
      console.log(`  Encryption: ${msg.encryption}`)
    }
    console.log(`  Body: ${msg.body}`)
    showPrompt()
  })

  xmppNode.on('presence', (pres) => {
    console.log(`\n[XMPP Presence] From: ${pres.from}`)
    if (pres.type === 'unavailable') {
      console.log('  Status: Offline')
    } else {
      console.log(`  Status: Online${pres.show ? ` [${pres.show}]` : ''}${pres.status ? ` (${pres.status})` : ''}`)
    }
    showPrompt()
  })

  xmppNode.on('roster:change', (entry) => {
    console.log(`\n[Roster] Updated: ${entry.jid}`)
    console.log(`  Subscription: ${entry.subscription}${entry.ask ? ` (ask=${entry.ask})` : ''}`)
    if (entry.presence) {
      console.log(`  Presence: ${formatPresence(entry.presence)}`)
    }
    showPrompt()
  })

  xmppNode.on('roster:remove', (jid) => {
    console.log(`\n[Roster] Removed: ${jid}`)
    showPrompt()
  })

  xmppNode.on('stream', ({ peerId, direction }) => {
    console.log(`\n[XMPP Connection] ${direction === 'inbound' ? 'Inbound' : 'Outbound'} session established with ${peerId}`)
    
    if (!discoveredPeers.has(peerId)) {
      try {
        const connections = libp2p.getConnections(peerId)
        const addrs = connections.map((c: any) => {
          const addrStr = c.remoteAddr.toString()
          if (!addrStr.includes('/p2p/') && !addrStr.includes('/ipfs/')) {
            return `${addrStr}/p2p/${peerId}`
          }
          return addrStr
        })
        if (addrs.length > 0) {
          discoveredPeers.set(peerId, addrs)
        } else {
          discoveredPeers.set(peerId, [])
        }
      } catch (err) {
        discoveredPeers.set(peerId, [])
      }
    }
    
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
    if (msg.encrypted) {
      console.log(`  Encryption: ${msg.encryption}${msg.keyId ? ` [${msg.keyId}]` : ''}`)
    }
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
}

