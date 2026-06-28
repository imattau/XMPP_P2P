/**
 * @packageDocumentation Command dispatcher for the interactive CLI.
 * Parses user input, resolves peer references, and forwards each action to
 * the XmppNode runtime or local helper routines.
 */

import { basename, extname } from 'path'
import { readFile } from 'fs/promises'
import { CliContext } from './types.js'
import { printCliHelp } from './output.js'
import { xml, Element } from '@xmpp/xml'

/**
 * Tokenizes a command line string while preserving quoted segments.
 *
 * @param input - Raw terminal input from the user.
 * @returns A token list ready for subcommand parsing.
 */
const tokenizeInput = (input: string) =>
  Array.from(input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g), match => match[1] ?? match[2] ?? match[3] ?? '')

/**
 * Splits tokens into positional arguments and repeated `--option` values.
 *
 * @param tokens - Tokenized input after the command name.
 * @returns Parsed positional arguments and named option groups.
 */
const parseOptionTokens = (tokens: string[]) => {
  const positional: string[] = []
  const options = new Map<string, string[]>()
  let currentOption: string | undefined

  for (const token of tokens) {
    if (token.startsWith('--')) {
      const [key, inlineValue] = token.slice(2).split('=')
      currentOption = key
      if (!options.has(key)) {
        options.set(key, [])
      }
      if (inlineValue !== undefined) {
        options.get(key)?.push(inlineValue)
        currentOption = undefined
      }
      continue
    }

    if (currentOption) {
      options.get(currentOption)?.push(token)
      continue
    }

    positional.push(token)
  }

  return { positional, options }
}

const optionValue = (options: Map<string, string[]>, name: string) => options.get(name)?.join(' ').trim() || undefined

const optionValues = (options: Map<string, string[]>, name: string) =>
  (options.get(name) ?? []).map(value => value.trim()).filter(Boolean)

/**
 * Returns a content type based on the file extension.
 *
 * @param filename - The file path or name to inspect.
 * @returns A best-effort MIME type.
 */
const guessContentType = (filename: string) => {
  switch (extname(filename).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Uploads a local file and returns the resulting HTTP URL for embedding.
 *
 * @param xmppNode - Runtime used to request an upload slot.
 * @param filePath - Local file path to upload.
 * @param target - Peer JID or multiaddr that provides the slot.
 * @returns The public content URL for the uploaded file.
 */
const uploadFileAsCover = async (xmppNode: CliContext['xmppNode'], filePath: string, target: string) => {
  const fileBytes = await readFile(filePath)
  const contentType = guessContentType(filePath)
  const slot = await xmppNode.requestUploadSlot(target, {
    filename: basename(filePath),
    size: fileBytes.byteLength,
    contentType
  })

  const response = await fetch(slot.putUrl, {
    method: 'PUT',
    headers: {
      'content-type': contentType
    },
    body: fileBytes
  })

  if (!response.ok) {
    throw new Error(`Cover upload failed with ${response.status}`)
  }

  return slot.getUrl
}

/**
 * Publishes a feed article using CLI-style `feed article` input.
 *
 * @param input - Raw command string.
 * @param ctx - CLI runtime context.
 * @param allowCover - Whether a cover upload is allowed for this invocation.
 * @returns The published item id when a post is created.
 */
const publishFeedArticle = async (input: string, ctx: CliContext, allowCover = true) => {
  const { xmppNode } = ctx
  const tokens = tokenizeInput(input)
  const commandIndex = tokens.findIndex(token => token.toLowerCase() === 'feed')
  const args = commandIndex >= 0 ? tokens.slice(commandIndex + 2) : tokens.slice(2)
  const { positional, options } = parseOptionTokens(args)

  const body = optionValue(options, 'body') || positional.join(' ').trim()
  if (!body) {
    return undefined
  }

  const title = optionValue(options, 'title')
  const tags = [
    ...optionValues(options, 'tag'),
    ...optionValues(options, 'category')
  ]
  const coverPath = allowCover ? optionValue(options, 'cover') : undefined
  const coverTarget = optionValue(options, 'cover-target') || xmppNode.jid

  let finalBody = body
  if (coverPath) {
    console.log(`Uploading cover image ${coverPath} via ${coverTarget}...`)
    const coverUrl = await uploadFileAsCover(xmppNode, coverPath, coverTarget)
    finalBody = `![cover](${coverUrl})\n\n${finalBody}`
    console.log(`Cover uploaded: ${coverUrl}`)
  }

  console.log('Publishing feed article...')
  const itemId = await xmppNode.publishFeed(finalBody, {
    title,
    categories: tags
  })
  console.log(`Published feed item: ${itemId}`)
  return itemId
}

/**
 * Publishes a collection post using CLI-style `collection post` input.
 *
 * @param input - Raw command string.
 * @param ctx - CLI runtime context.
 * @returns The published item id when a post is created.
 */
const publishCollectionPost = async (input: string, ctx: CliContext) => {
  const { xmppNode } = ctx
  const tokens = tokenizeInput(input)
  const commandIndex = tokens.findIndex(token => token.toLowerCase() === 'collection')
  const args = commandIndex >= 0 ? tokens.slice(commandIndex + 2) : tokens.slice(2)
  const collectionId = args[0]
  if (!collectionId) {
    return undefined
  }

  const { positional, options } = parseOptionTokens(args.slice(1))
  const body = optionValue(options, 'body') || positional.join(' ').trim()
  if (!body) {
    return undefined
  }

  const title = optionValue(options, 'title')
  const summary = optionValue(options, 'summary')
  const categories = [
    ...optionValues(options, 'tag'),
    ...optionValues(options, 'category')
  ]

  console.log(`Publishing collection post to ${collectionId}...`)
  const itemId = await xmppNode.publishCollection(collectionId, body, {
    title,
    summary,
    categories
  })
  console.log(`Published collection item: ${itemId}`)
  return itemId
}

/**
 * Executes a single CLI command.
 *
 * @param input - Raw command line entered by the user.
 * @param ctx - Shared runtime context for network and storage actions.
 * @returns `true` when the caller should exit the REPL.
 */
export const handleCliCommand = async (input: string, ctx: CliContext) => {
  const { libp2p, xmppNode, discoveredPeers, resolvePeerTarget } = ctx
  const parts = tokenizeInput(input)
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
        const id = await xmppNode.sendEncryptedMessage(target, text, { requestReceipt: true })
        console.log(`Sent! (ID: ${id})`)
        break
      }

      if (msgMode === 'correct') {
        let targetIndex = 2
        let isSecure = false
        if (parts[2]?.toLowerCase() === 'secure') {
          isSecure = true
          targetIndex = 3
        }
        if (parts.length < targetIndex + 3) {
          console.log('Usage: msg correct [secure] <peer-id|jid|multiaddr> <message-id> <corrected-message>')
          break
        }
        const target = resolvePeerTarget(parts[targetIndex])
        const replaceId = parts[targetIndex + 1]
        const text = parts.slice(targetIndex + 2).join(' ')
        console.log(`Correcting message ${replaceId} to ${target} (${isSecure ? 'OMEMO' : 'plaintext'})...`)
        let id: string
        if (isSecure) {
          id = await xmppNode.sendEncryptedMessage(target, text, { replace: replaceId, requestReceipt: true })
        } else {
          id = await xmppNode.sendMessage(target, text, { replace: replaceId, requestReceipt: true })
        }
        console.log(`Correction sent! (ID: ${id})`)
        break
      }

      if (msgMode === 'state') {
        if (parts.length < 4) {
          console.log('Usage: msg state <peer-id|jid|multiaddr> <active|composing|paused|inactive|gone>')
          break
        }
        const target = resolvePeerTarget(parts[2])
        const chatState = parts[3].toLowerCase() as any
        if (!['active', 'composing', 'paused', 'inactive', 'gone'].includes(chatState)) {
          console.log('Invalid state. Choose from: active, composing, paused, inactive, gone')
          break
        }
        console.log(`Sending chat state ${chatState} to ${target}...`)
        await xmppNode.sendMessage(target, '', { chatState })
        console.log('Chat state sent!')
        break
      }

      if (parts.length < 3) {
        console.log('Usage: msg <peer-id> <message>')
        break
      }
      const target = resolvePeerTarget(parts[1])
      const text = parts.slice(2).join(' ')
      console.log(`Sending message to ${target}...`)
      const id = await xmppNode.sendMessage(target, text, { requestReceipt: true })
      console.log(`Sent! (ID: ${id})`)
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

      if (presenceCommand === 'send') {
        if (parts.length < 3) {
          console.log('Usage: presence send <peer-id|jid|multiaddr> [type] [--show <show>] [--status <message>]')
          break
        }
        const target = resolvePeerTarget(parts[2])
        const { positional, options } = parseOptionTokens(parts.slice(3))
        const type = (positional[0] || 'available').toLowerCase()
        const show = optionValue(options, 'show') || positional[1]
        const status = optionValue(options, 'status') || positional.slice(2).join(' ')
        console.log(`Sending presence ${type} to ${target}${show ? ` [${show}]` : ''}${status ? ` (${status})` : ''}...`)
        await xmppNode.sendPresence(target, type, status, show)
        console.log('Presence sent!')
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
    case 'profile': {
      const profileCommand = parts[1]?.toLowerCase()

      if (!profileCommand || profileCommand === 'show') {
        const profile = await xmppNode.getVCard()
        const displayName = profile.fn ?? profile.nickname ?? xmppNode.jid.replace('@p2p', '')
        const nickname = profile.nickname ?? profile.fn ?? '(unset)'
        const avatarStatus = profile.photo?.type ? `set (${profile.photo.type})` : 'none'
        console.log('Local profile:')
        console.log(`  Display name: ${displayName}`)
        console.log(`  Nickname: ${nickname}`)
        console.log(`  Avatar: ${avatarStatus}`)
        console.log(`  JID: ${xmppNode.jid}`)
        break
      }

      if (profileCommand === 'set' || profileCommand === 'update') {
        const { positional, options } = parseOptionTokens(parts.slice(2))
        const fn = optionValue(options, 'fn') || optionValue(options, 'name') || positional[0]
        const nickname = optionValue(options, 'nick') || optionValue(options, 'nickname') || positional[1]
        const photoPath = optionValue(options, 'photo')
        const photoContentType = photoPath ? optionValue(options, 'photo-type') || guessContentType(photoPath) : undefined
        const photoBytes = photoPath ? await readFile(photoPath) : undefined
        const photo = photoBytes && photoContentType
          ? {
              type: photoContentType,
              binval: Buffer.from(photoBytes).toString('base64')
            }
          : undefined

        if (!fn && !nickname && !photo) {
          console.log('Usage: profile set [--fn <name>] [--nick <nickname>] [--photo <path>] [--photo-type <mime>]')
          break
        }

        console.log('Updating profile...')
        await xmppNode.setVCard({
          ...(fn ? { fn } : {}),
          ...(nickname ? { nickname } : {}),
          ...(photo ? { photo } : {})
        })
        console.log('Profile updated!')
        break
      }

      if (profileCommand === 'clear-photo' || profileCommand === 'remove-photo') {
        console.log('Clearing profile photo...')
        await xmppNode.setVCard({ photo: null })
        console.log('Profile photo cleared!')
        break
      }

      console.log('Usage: profile [show] | profile set [--fn <name>] [--nick <nickname>] [--photo <path>] [--photo-type <mime>] | profile clear-photo')
      break
    }
    case 'nick': {
      const nickname = parts.slice(1).join(' ').trim()
      if (!nickname) {
        console.log('Usage: nick <name>')
        break
      }
      console.log(`Updating nickname to: ${nickname}`)
      await xmppNode.setNickname(nickname)
      console.log('Nickname updated!')
      break
    }
    case 'csi': {
      const state = parts[1]?.toLowerCase()
      if (state !== 'active' && state !== 'inactive') {
        console.log('Usage: csi <active|inactive>')
        break
      }
      console.log(`Setting client state to: ${state}...`)
      await xmppNode.setClientState(state as 'active' | 'inactive')
      console.log(`Client state updated to ${state}!`)
      break
    }
    case 'feed': {
      const feedCommand = parts[1]?.toLowerCase()
      switch (feedCommand) {
        case 'post': {
          if (parts.length < 3) {
            console.log('Usage: feed post <message> [--title <title>] [--tag <tag>] [--cover <path>]')
            break
          }
          const itemId = await publishFeedArticle(input, ctx, true)
          if (!itemId) {
            console.log('Usage: feed post <message> [--title <title>] [--tag <tag>] [--cover <path>]')
          }
          break
        }
        case 'article': {
          if (parts.length < 3) {
            console.log('Usage: feed article <message> [--title <title>] [--tag <tag>] [--cover <path>] [--cover-target <peer>]')
            break
          }
          const itemId = await publishFeedArticle(input, ctx, true)
          if (!itemId) {
            console.log('Usage: feed article <message> [--title <title>] [--tag <tag>] [--cover <path>] [--cover-target <peer>]')
          }
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
        case 'public': {
          const subscriptions = await xmppNode.getPublicFeedSubscriptions()
          console.log(`Public feed subscriptions (${subscriptions.length}):`)
          for (const subscription of subscriptions) {
            console.log(`  - ${subscription.jid}`)
            console.log(`      Topic: ${subscription.topic}`)
            console.log(`      Visibility: ${subscription.visibility}`)
            console.log(`      Subscribed At: ${subscription.subscribedAt}`)
          }
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
            if (post.summary) {
              console.log(`      Summary: ${post.summary}`)
            }
            if (post.categories?.length) {
              console.log(`      Categories: ${post.categories.join(', ')}`)
            }
            if (post.geoloc) {
              console.log(`      Geoloc: ${[post.geoloc.lat, post.geoloc.lon].filter(Boolean).join(', ') || 'present'}`)
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
        case 'watch-followers': {
          if (parts.length < 3) {
            console.log('Usage: feed watch-followers <peer-id|jid|multiaddr>')
            break
          }
          const target = resolvePeerTarget(parts[2])
          console.log(`Watching follower updates for ${target}...`)
          const watch = await xmppNode.watchFeedFollowers(target)
          console.log(`Watching ${watch.topic} for peer ${watch.peerId} since ${watch.watchedAt}`)
          break
        }
        default:
          console.log('Usage: feed post <message> [--title <title>] [--tag <tag>] [--cover <path>] | feed article <message> [--title <title>] [--tag <tag>] [--cover <path>] | feed subscribe <peer> [public|private] | feed public | feed visibility <peer> <public|private> | feed unfollow <peer> | feed list | feed peers | feed followers <peer> | feed watch-followers <peer>')
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
        case 'caps': {
          if (parts.length < 3) {
            console.log('Usage: disco caps <peer-id|jid|multiaddr> [node]')
            break
          }
          const target = resolvePeerTarget(parts[2])
          console.log(`Querying capabilities for ${target}...`)
          const caps = await xmppNode.getEntityCapabilities(target)
          if (!caps) {
            console.log('No capabilities found.')
            break
          }
          console.log(`Peer ID: ${caps.peerId}`)
          console.log(`JID: ${caps.jid}`)
          console.log(`Node: ${caps.node}`)
          console.log(`Ver: ${caps.ver}`)
          console.log(`Hash: ${caps.hash}`)
          console.log(`Discovered At: ${caps.discoveredAt}`)
          break
        }
        default:
          console.log('Usage: disco info <peer> [node] | disco items <peer> [node] | disco caps <peer> [node]')
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
        case 'leave': {
          if (parts.length < 3) {
            console.log('Usage: collection leave <id>')
            break
          }
          const id = parts[2]
          console.log(`Leaving collection ${id}...`)
          await xmppNode.unsubscribeCollection(id)
          console.log('Left!')
          break
        }
        case 'post': {
          if (parts.length < 4) {
            console.log('Usage: collection post <id> <message> [--title <title>] [--tag <tag>] [--summary <summary>]')
            break
          }
          const itemId = await publishCollectionPost(input, ctx)
          if (!itemId) {
            console.log('Usage: collection post <id> <message> [--title <title>] [--tag <tag>] [--summary <summary>]')
          }
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
        case 'subscriptions': {
          const subscriptions = await xmppNode.getCollectionSubscriptions()
          console.log(`Collection subscriptions (${subscriptions.length}):`)
          for (const subscription of subscriptions) {
            console.log(`  - ${subscription.id}`)
            console.log(`      Topic: ${subscription.topic}`)
            console.log(`      Subscribed At: ${subscription.subscribedAt}`)
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
          console.log('Usage: collection create <id> [name] | collection add <id> <peer> | collection join <id> | collection leave <id> | collection post <id> <message> | collection list | collection subscriptions | collection posts [id]')
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
            if (entry.nickname) {
              console.log(`      Nickname: ${entry.nickname}`)
            }
            if (entry.presence) {
              console.log(`      Presence: ${entry.presence.type}${entry.presence.show ? ` [${entry.presence.show}]` : ''}${entry.presence.status ? ` (${entry.presence.status})` : ''}${entry.presence.nickname ? ` <${entry.presence.nickname}>` : ''}`)
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
            if (entry.nickname) {
              console.log(`      Nickname: ${entry.nickname}`)
            }
            if (entry.presence) {
              console.log(`      Presence: ${entry.presence.type}${entry.presence.show ? ` [${entry.presence.show}]` : ''}${entry.presence.status ? ` (${entry.presence.status})` : ''}${entry.presence.nickname ? ` <${entry.presence.nickname}>` : ''}`)
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
    case 'muc-join': {
      if (parts.length < 3) {
        console.log('Usage: muc-join <room> <nickname>')
        break
      }
      const room = parts[1]
      const nick = parts[2]
      console.log(`Joining room "${room}" as "${nick}"...`)
      try {
        await xmppNode.joinMucRoom(room, nick)
        console.log(`Joined MUC room ${room}`)
      } catch (err: any) {
        console.log(`Failed to join MUC room: ${err.message}`)
      }
      break
    }
    case 'muc-send': {
      if (parts.length < 3) {
        console.log('Usage: muc-send <room> <message>')
        break
      }
      const room = parts[1]
      const message = parts.slice(2).join(' ')
      try {
        await xmppNode.muc.sendGroupMessage(room, message)
      } catch (err: any) {
        console.log(`Failed to send MUC message: ${err.message}`)
      }
      break
    }
    case 'muc-send-secure': {
      if (parts.length < 3) {
        console.log('Usage: muc-send-secure <room> <message>')
        break
      }
      const room = parts[1]
      const message = parts.slice(2).join(' ')
      try {
        await xmppNode.muc.sendGroupMessageSecure(room, message)
      } catch (err: any) {
        console.log(`Failed to send secure MUC message: ${err.message}`)
      }
      break
    }
    case 'muc-leave': {
      if (parts.length < 2) {
        console.log('Usage: muc-leave <room>')
        break
      }
      const room = parts[1]
      console.log(`Leaving room "${room}"...`)
      try {
        await xmppNode.muc.leaveRoom(room)
        console.log(`Left MUC room ${room}`)
      } catch (err: any) {
        console.log(`Failed to leave MUC room: ${err.message}`)
      }
      break
    }
    case 'muc-roster': {
      if (parts.length < 2) {
        console.log('Usage: muc-roster <room>')
        break
      }
      const room = parts[1]
      const state = xmppNode.muc.getRoomState(room)
      if (!state) {
        console.log(`Not joined in room: ${room}`)
        break
      }
      console.log(`Roster for MUC room: ${room}`)
      console.log(`Local nickname: ${state.localNick}`)
      console.log(`Occupants (${state.occupants.size}):`)
      state.occupants.forEach((occ) => {
        console.log(`  - Nick: ${occ.nick} (Peer: ${occ.peerId}, JID: ${occ.jid})`)
      })
      break
    }
    case 'muc-history': {
      if (parts.length < 3) {
        console.log('Usage: muc-history <room> <peer-id>')
        break
      }
      const mucRoom = parts[1]
      const mucTarget = parts[2]
      console.log(`Requesting MUC history for room "${mucRoom}" from peer ${mucTarget}...`)
      try {
        await xmppNode.queryMucChatHistory(mucRoom, mucTarget)
        console.log('MUC history request sent.')
      } catch (err: any) {
        console.error('MUC history request failed:', err.message)
      }
      break
    }
    case 'ping': {
      if (parts.length < 2) {
        console.log('Usage: ping <peer-id/multiaddr>')
        break
      }
      const target = resolvePeerTarget(parts[1])
      console.log(`Pinging ${target}...`)
      try {
        const rtt = await xmppNode.ping(target)
        console.log(`Ping successful! RTT: ${rtt}ms`)
      } catch (err: any) {
        console.log(`Ping failed: ${err.message}`)
      }
      break
    }
    case 'server': {
      const serverCmd = parts[1]?.toLowerCase()
      switch (serverCmd) {
        case 'component': {
          const sub = parts[2]?.toLowerCase()
          if (sub === 'connect') {
            if (parts.length < 6) {
              console.log('Usage: server component connect <host> <port> <secret> <domain> [--save]')
              break
            }
            const host = parts[3]
            const port = parseInt(parts[4], 10)
            const secret = parts[5]
            const domain = parts[6]
            const { options: parsedOptions } = parseOptionTokens(parts.slice(7))
            console.log(`Connecting XMPP component at ${host}:${port} as ${domain}...`)
            try {
              await xmppNode.connectComponent(host, port, secret, domain)
              console.log(`Component connected as ${domain}!`)
              if (parsedOptions.has('save')) {
                await xmppNode.serverBridge.configStore.save(domain, secret, host, port)
                console.log('Component config saved.')
              }
            } catch (err: any) {
              console.log(`Component connection failed: ${err.message}`)
            }
          } else if (sub === 'disconnect') {
            try {
              await xmppNode.disconnectComponent()
              console.log('Component disconnected.')
            } catch (err: any) {
              console.log(`Error: ${err.message}`)
            }
          } else {
            console.log('Usage: server component connect <host> <port> <secret> <domain> [--save]')
            console.log('       server component disconnect')
          }
          break
        }
        case 's2s': {
          if (parts.length < 3) {
            console.log('Usage: server s2s domain <domain>')
            break
          }
          if (parts[2] === 'domain') {
            const domain = parts[3]
            if (!domain) {
              console.log('Usage: server s2s domain <domain>')
              break
            }
            xmppNode.setS2SDomain(domain)
            console.log(`S2S domain set to ${domain}`)
          } else {
            console.log('Usage: server s2s domain <domain>')
          }
          break
        }
        case 'list': {
          const connections = xmppNode.getServerConnections()
          if (connections.length === 0) {
            console.log('No federation connections.')
            break
          }
          console.log(`Federation connections (${connections.length}):`)
          for (const conn of connections) {
            const via = conn.type === 'component' ? 'Component' : 'S2S'
            console.log(`  - ${via}: ${conn.domain}`)
            console.log(`      Status: ${conn.status}${conn.error ? ` - ${conn.error}` : ''}`)
          }
          break
        }
        case 'join': {
          if (parts.length < 3) {
            console.log('Usage: server join <room-jid> [--nick <nickname>]')
            break
          }
          const roomJid = parts[2]
          const joinOptions = parseOptionTokens(parts.slice(3))
          const nick = optionValue(joinOptions.options, 'nick') || 'p2p-user'
          console.log(`Joining MUC room ${roomJid} as ${nick}...`)
          try {
            await xmppNode.joinServerMuc(roomJid, nick)
            console.log(`Joined ${roomJid}`)
          } catch (err: any) {
            console.log(`Failed to join room: ${err.message}`)
          }
          break
        }
        case 'leave': {
          if (parts.length < 3) {
            console.log('Usage: server leave <room-jid>')
            break
          }
          await xmppNode.leaveServerMuc(parts[2])
          console.log(`Left ${parts[2]}`)
          break
        }
        case 'save': {
          if (parts.length < 5) {
            console.log('Usage: server save <domain> <secret> <host> <port>')
            break
          }
          const domain = parts[2]
          const secret = parts[3]
          const host = parts[4]
          const port = parseInt(parts[5], 10)
          await xmppNode.serverBridge.configStore.save(domain, secret, host, port)
          console.log(`Component config saved for ${domain}`)
          break
        }
        case 'forget': {
          if (parts.length < 3) {
            console.log('Usage: server forget <domain>')
            break
          }
          await xmppNode.serverBridge.configStore.remove(parts[2])
          console.log(`Component config removed for ${parts[2]}`)
          break
        }
        case 'saved': {
          const saved = await xmppNode.serverBridge.configStore.list()
          if (saved.length === 0) {
            console.log('No saved component configs.')
            break
          }
          console.log('Saved component configs:')
          for (const conf of saved) {
            console.log(`  - ${conf.domain}`)
            console.log(`      Host: ${conf.host}:${conf.port}`)
          }
          break
        }
        // Phase 2: PubSub operations
        case 'pubsub': {
          const pubsubCmd = parts[2]?.toLowerCase()
          switch (pubsubCmd) {
            case 'subscribe': {
              if (parts.length < 5) {
                console.log('Usage: server pubsub subscribe <node-jid> <node>')
                break
              }
              const nodeJid = parts[3]
              const node = parts[4]
              console.log(`Subscribing to pubsub node ${node} on ${nodeJid}...`)
              try {
                await xmppNode.pubsubSubscribe(nodeJid, node)
                console.log('Subscribed!')
              } catch (err: any) {
                console.log(`Failed: ${err.message}`)
              }
              break
            }
            case 'publish': {
              if (parts.length < 5) {
                console.log('Usage: server pubsub publish <node-jid> <node> <body> [--item-id <id>]')
                break
              }
              const pubNodeJid = parts[3]
              const pubNode = parts[4]
              const pubBody = parts.slice(5).join(' ')
              const pubOptions = parseOptionTokens(parts.slice(5))
              const bodyText = pubOptions.positional.join(' ') || pubBody
              const itemId = optionValue(pubOptions.options, 'item-id') || Math.random().toString(36).substring(2, 15)
              const payload = xml('body', {}, bodyText)
              console.log(`Publishing to pubsub node ${pubNode} on ${pubNodeJid}...`)
              try {
                await xmppNode.pubsubPublish(pubNodeJid, pubNode, itemId, payload)
                console.log(`Published item ${itemId}`)
              } catch (err: any) {
                console.log(`Failed: ${err.message}`)
              }
              break
            }
            case 'items': {
              if (parts.length < 5) {
                console.log('Usage: server pubsub items <node-jid> <node> [--max <n>]')
                break
              }
              const itemsJid = parts[3]
              const itemsNode = parts[4]
              const itemsOptions = parseOptionTokens(parts.slice(5))
              const max = optionValue(itemsOptions.options, 'max')
              console.log(`Fetching items from ${itemsNode} on ${itemsJid}...`)
              try {
                const items = await xmppNode.pubsubGetItems(itemsJid, itemsNode, max ? parseInt(max, 10) : undefined)
                console.log(`Items (${items.length}):`)
                for (const item of items) {
                  const body = item.getChild('body')?.text() || '(no body)'
                  console.log(`  - ${item.attrs.id}: ${body}`)
                }
              } catch (err: any) {
                console.log(`Failed: ${err.message}`)
              }
              break
            }
            case 'unsubscribe': {
              if (parts.length < 5) {
                console.log('Usage: server pubsub unsubscribe <node-jid> <node>')
                break
              }
              const unsubJid = parts[3]
              const unsubNode = parts[4]
              console.log(`Unsubscribing from ${unsubNode} on ${unsubJid}...`)
              try {
                await xmppNode.pubsubUnsubscribe(unsubJid, unsubNode)
                console.log('Unsubscribed!')
              } catch (err: any) {
                console.log(`Failed: ${err.message}`)
              }
              break
            }
            default:
              console.log('Usage: server pubsub subscribe <node-jid> <node>')
              console.log('       server pubsub publish <node-jid> <node> <body> [--item-id <id>]')
              console.log('       server pubsub items <node-jid> <node> [--max <n>]')
              console.log('       server pubsub unsubscribe <node-jid> <node>')
          }
          break
        }

        // Phase 4: Service Discovery
        case 'disco': {
          const discoCmd = parts[2]?.toLowerCase()
          if (!discoCmd || discoCmd === 'info') {
            if (parts.length < 4) {
              console.log('Usage: server disco info <jid>')
              break
            }
            const discoJid = parts[3]
            console.log(`Querying disco#info for ${discoJid}...`)
            try {
              const info = await xmppNode.serverDiscoInfo(discoJid)
              console.log(`Identities (${info.identities.length}):`)
              for (const id of info.identities) {
                console.log(`  - ${id.category}/${id.type}${id.name ? ` (${id.name})` : ''}`)
              }
              console.log(`Features (${info.features.length}):`)
              for (const f of info.features) {
                console.log(`  - ${f}`)
              }
            } catch (err: any) {
              console.log(`Failed: ${err.message}`)
            }
          } else if (discoCmd === 'items') {
            if (parts.length < 4) {
              console.log('Usage: server disco items <jid>')
              break
            }
            const itemsJid = parts[3]
            console.log(`Querying disco#items for ${itemsJid}...`)
            try {
              const result = await xmppNode.serverDiscoItems(itemsJid)
              console.log(`Items (${result.items.length}):`)
              for (const item of result.items) {
                console.log(`  - ${item.jid}${item.node ? ` [${item.node}]` : ''}${item.name ? ` (${item.name})` : ''}`)
              }
            } catch (err: any) {
              console.log(`Failed: ${err.message}`)
            }
          } else {
            console.log('Usage: server disco info <jid>')
            console.log('       server disco items <jid>')
          }
          break
        }

        // Phase 3: Feed bridge
        case 'bridge': {
          const bridgeCmd = parts[2]?.toLowerCase()
          switch (bridgeCmd) {
            case 'feed': {
              if (parts.length < 5) {
                console.log('Usage: server bridge feed <feed-topic> <pubsub-node>')
                break
              }
              const feedTopic = parts[3]
              const psNode = parts[4]
              await xmppNode.setFeedBridge(feedTopic, psNode)
              console.log(`Feed bridge set: ${feedTopic} <-> ${psNode}`)
              break
            }
            case 'muc': {
              if (parts.length < 5) {
                console.log('Usage: server bridge muc <server-room> <p2p-room>')
                break
              }
              const serverRoom = parts[3]
              const p2pRoom = parts[4]
              await xmppNode.setMucBridge(serverRoom, p2pRoom)
              console.log(`MUC bridge set: ${serverRoom} <-> ${p2pRoom}`)
              break
            }
            case 'list': {
              const feedBridges = xmppNode.getAllFeedBridges()
              const mucBridges = xmppNode.getAllMucBridges()
              console.log('Feed bridges:')
              for (const fb of feedBridges) {
                console.log(`  ${fb.feedTopic} <-> ${fb.pubsubNode}`)
              }
              if (feedBridges.length === 0) console.log('  (none)')
              console.log('MUC bridges:')
              for (const mb of mucBridges) {
                console.log(`  ${mb.serverRoom} <-> ${mb.p2pRoom}`)
              }
              if (mucBridges.length === 0) console.log('  (none)')
              break
            }
            case 'remove': {
              const removeType = parts[3]?.toLowerCase()
              if (removeType === 'feed' && parts[4]) {
                await xmppNode.removeFeedBridge(parts[4])
                console.log(`Feed bridge removed for ${parts[4]}`)
              } else if (removeType === 'muc' && parts[4]) {
                await xmppNode.removeMucBridge(parts[4])
                console.log(`MUC bridge removed for ${parts[4]}`)
              } else {
                console.log('Usage: server bridge remove feed <feed-topic>')
                console.log('       server bridge remove muc <server-room>')
              }
              break
            }
            default:
              console.log('Usage: server bridge feed <feed-topic> <pubsub-node>')
              console.log('       server bridge muc <server-room> <p2p-room>')
              console.log('       server bridge list')
              console.log('       server bridge remove feed|muc <id>')
          }
          break
        }

        default:
          console.log('Usage: server component connect <host> <port> <secret> <domain> [--save]')
          console.log('       server component disconnect')
          console.log('       server s2s domain <domain>')
          console.log('       server list')
          console.log('       server join <room-jid> [--nick <nickname>]')
          console.log('       server leave <room-jid>')
          console.log('       server save <domain> <secret> <host> <port>')
          console.log('       server forget <domain>')
          console.log('       server saved')
          console.log('       server pubsub subscribe|publish|items|unsubscribe')
          console.log('       server disco info|items <jid>')
          console.log('       server bridge feed|muc|list|remove')
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
      printCliHelp(...parts.slice(1))
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
