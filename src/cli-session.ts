import readline from 'readline'
import { XmppNode } from './xmpp-node.js'
import { createCliContext, printCliHelp } from './cli-output.js'
import { attachCliEventListeners } from './cli-events.js'
import { handleCliCommand } from './cli-commands.js'
import type { Libp2pNode } from './cli-types.js'

export const startCli = async (libp2p: Libp2pNode, xmppNode: XmppNode) => {
  const discoveredPeers = new Map<string, string[]>()

  libp2p.addEventListener('peer:discovery', (evt: any) => {
    const peerId = evt.detail.id.toString()
    if (peerId !== libp2p.peerId.toString()) {
      const addrs = evt.detail.multiaddrs.map((ma: any) => {
        const addrStr = ma.toString()
        if (!addrStr.includes('/p2p/') && !addrStr.includes('/ipfs/')) {
          return `${addrStr}/p2p/${peerId}`
        }
        return addrStr
      })
      const isNew = !discoveredPeers.has(peerId)
      discoveredPeers.set(peerId, addrs)
      if (isNew) {
        console.log(`\n[Discovery] Discovered new peer: ${peerId}`)
        console.log(`Type 'dial ${peerId}' to connect or list multiaddrs using 'peers'`)
      }
    }
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const ctx = createCliContext(libp2p, xmppNode, discoveredPeers, rl)

  attachCliEventListeners(ctx)

  console.log('\n======================================')
  console.log('XMPP over libp2p CLI')
  printCliHelp()
  console.log('======================================\n')

  ctx.showPrompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) {
      ctx.showPrompt()
      return
    }

    try {
      const shouldExit = await handleCliCommand(input, ctx)
      if (shouldExit) {
        return
      }
    } catch (err: any) {
      console.error(`Error executing command: ${err.message}`)
    }

    ctx.showPrompt()
  })

  rl.on('close', async () => {
    await xmppNode.close()
    await libp2p.stop()
    console.log('Goodbye!')
    process.exit(0)
  })
}

