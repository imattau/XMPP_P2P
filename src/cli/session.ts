/**
 * @fileoverview Launches and manages the interactive CLI terminal session.
 * Subscribes to peer discovery events, handles stdin line-reading loops,
 * and routes user commands to the command runner.
 */

import readline from 'readline'
import { XmppNode } from '../core/xmpp-node.js'
import { createCliContext, printCliHelp } from './output.js'
import { attachCliEventListeners } from './events.js'
import { handleCliCommand } from './commands.js'
import type { Libp2pNode } from './types.js'

/**
 * Starts the CLI read-eval-print loop (REPL). Registers peer discovery listeners
 * on the libp2p node, sets up the readline interface, outputs introductory help text,
 * and processes incoming user inputs asynchronously.
 * 
 * @param libp2p - The underlying P2P network node wrapper.
 * @param xmppNode - The XMPP protocol manager node.
 * @returns A promise resolving when the session has been started.
 */
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
  try {
    const profile = await xmppNode.getVCard()
    const displayName = profile.fn ?? profile.nickname ?? xmppNode.jid.replace('@p2p', '')
    const nickname = profile.nickname ?? profile.fn
    console.log(`Local profile: ${displayName}${nickname && nickname !== displayName ? ` <${nickname}>` : ''}`)
  } catch (err: any) {
    console.log(`Local profile: ${xmppNode.jid.replace('@p2p', '')}`)
    console.log(`Profile details unavailable: ${err.message}`)
  }
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
