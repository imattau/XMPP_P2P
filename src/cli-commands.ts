import { CliContext } from './cli-types.js'
import { printCliHelp } from './cli-output.js'

export const handleCliCommand = async (input: string, ctx: CliContext) => {
  const { libp2p, xmppNode, discoveredPeers, resolvePeerTarget } = ctx
  const parts = input.split(' ')
  const command = parts[0].toLowerCase()

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
      const msgMode = parts[1]?.toLowerCase()
      if (msgMode === 'secure') {
        if (parts.length < 4) {
          console.log('Usage: msg secure <peer-id|jid|multiaddr> <message>')
          break
        }
        const target = resolvePeerTarget(parts[2])
        const text = parts.slice(3).join(' ')
        console.log(`Sending encrypted OMEMO message to ${target}...`)
        await xmppNode.sendEncryptedMessage(target, text)
        console.log('Sent!')
        break
      }

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
    case 'omemo': {
      const omemoCommand = parts[1]?.toLowerCase()
      switch (omemoCommand) {
        case 'key': {
          const deviceId = await xmppNode.getOmemoDeviceId()
          const registrationId = await xmppNode.getOmemoRegistrationId()
          const summary = await xmppNode.getOmemoBundleSummary()
          const identityKey = await xmppNode.getOmemoIdentityKey()
          console.log(`Local OMEMO device id: ${deviceId}`)
          console.log(`Local OMEMO registration id: ${registrationId}`)
          console.log(`Local OMEMO signed pre-key id: ${summary.signedPreKeyId}`)
          console.log(`Local OMEMO pre-key count: ${summary.preKeyCount}`)
          console.log('Local OMEMO identity key:')
          console.log(identityKey)
          break
        }
        case 'fetch': {
          if (parts.length < 3) {
            console.log('Usage: omemo fetch <peer-id|jid|multiaddr>')
            break
          }
          const target = resolvePeerTarget(parts[2])
          console.log(`Fetching OMEMO device list from ${target}...`)
          const devices = await xmppNode.fetchOmemoDeviceList(target)
          console.log(`Found OMEMO devices: ${devices.join(', ') || '(none)'}`)
          for (const deviceId of devices) {
            const bundle = await xmppNode.fetchOmemoBundle(target, deviceId)
            console.log(`  Device ${deviceId}: registration ${bundle.registrationId}, ${bundle.preKeys.length} pre-keys`)
          }
          break
        }
        default:
          console.log('Usage: omemo key | omemo fetch <peer>')
      }
      break
    }
    case 'openpgp': {
      const openPgpCommand = parts[1]?.toLowerCase()
      switch (openPgpCommand) {
        case 'key': {
          const fingerprint = await xmppNode.getOpenPgpFingerprint()
          const publicKey = await xmppNode.getOpenPgpPublicKey()
          console.log(`Local OpenPGP fingerprint: ${fingerprint}`)
          console.log('Local OpenPGP public key:')
          console.log(publicKey)
          break
        }
        case 'fetch': {
          if (parts.length < 3) {
            console.log('Usage: openpgp fetch <peer-id|jid|multiaddr>')
            break
          }
          const target = resolvePeerTarget(parts[2])
          console.log(`Fetching OpenPGP public key from ${target}...`)
          const response = await xmppNode.fetchOpenPgpPublicKey(target)
          await xmppNode.registerPeerOpenPgpPublicKey(target, response.publicKey)
          console.log(`Fetched fingerprint: ${response.fingerprint}`)
          break
        }
        default:
          console.log('Usage: openpgp key | openpgp fetch <peer>')
      }
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
      console.log('Subscribed!')
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
    case 'pubsub-secure': {
      if (parts.length < 5) {
        console.log('Usage: pubsub-secure <topic> <key-id> <secret> <message>')
        break
      }
      const topic = parts[1]
      const keyId = parts[2]
      const secret = parts[3]
      const msgText = parts.slice(4).join(' ')
      console.log(`Publishing encrypted item to topic ${topic}...`)
      await xmppNode.setEncryptedPubSubSecret(topic, keyId, secret)
      const itemId = await xmppNode.publishEncrypted(topic, msgText, { keyId, secret })
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
      printCliHelp()
      break
    }
    case 'exit': {
      console.log('Shutting down...')
      ctx.rl.close()
      return true
    }
    default:
      console.log(`Unknown command: "${command}". Type "help" for a list of commands.`)
  }

  return false
}
