import { createP2PNode } from './p2p.js'
import { XmppNode } from './xmpp-node.js'
import readline from 'readline'

async function main() {
  const args = process.argv.slice(2)
  const portArg = args.find(arg => arg.startsWith('--port='))
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : undefined

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
  const xmppNode = new XmppNode(libp2p)

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
      console.log(`  Status: Online${pres.status ? ` (${pres.status})` : ''}`)
    }
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

  console.log('\n======================================')
  console.log('XMPP over libp2p CLI')
  console.log('Available commands:')
  console.log('  peers                      List discovered peers')
  console.log('  dial <peer-id/multiaddr>   Manually connect/dial a peer')
  console.log('  msg <peer-id> <message>    Send an XMPP chat message')
  console.log('  presence <status>          Broadcast custom status')
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
          let target = parts[1]
          const addrs = discoveredPeers.get(target)
          if (addrs && addrs.length > 0) {
            target = addrs[0]
          }
          const text = parts.slice(2).join(' ')
          console.log(`Sending message to ${target}...`)
          await xmppNode.sendMessage(target, text)
          console.log('Sent!')
          break
        }
        case 'presence': {
          const status = parts.slice(1).join(' ')
          console.log(`Updating presence status to: ${status || 'Online'}`)
          // Send presence to all connected peers
          const streams = (xmppNode as any).streams as Map<string, any>
          if (streams.size === 0) {
            console.log('No active peer streams to send presence to.')
          } else {
            for (const peerId of streams.keys()) {
              await xmppNode.sendPresence(peerId, undefined, status)
            }
            console.log(`Presence broadcasted to ${streams.size} peers.`)
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
          xmppNode.subscribe(topic)
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
