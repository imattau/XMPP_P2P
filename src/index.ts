/**
 * @fileoverview Main entry point for the XMPP P2P CLI application.
 * Parses CLI configuration arguments, spins up the underlying libp2p network node,
 * instantiates the XMPP protocol shim, and launches the interactive CLI session.
 */

import { createP2PNode } from './core/p2p.js'
import { XmppNode } from './core/xmpp-node.js'
import { startCli } from './cli/session.js'

/**
 * Parses startup options from the command line, starts the local P2P network node,
 * bootstraps XMPP protocol managers, and enters the terminal CLI loop.
 * 
 * @returns A promise that resolves when the session completes.
 */
async function main() {
  const args = process.argv.slice(2)
  const portArg = args.find(arg => arg.startsWith('--port='))
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : undefined
  const rosterPathArg = args.find(arg => arg.startsWith('--roster-file='))?.split('=')[1]
  const hostArg = args.find(arg => arg.startsWith('--host='))?.split('=')[1]

  console.log('Initializing libp2p Node...')
  const libp2p = await createP2PNode(port, { host: hostArg })

  await libp2p.start()
  console.log('libp2p Node started!')
  console.log(`Peer ID: ${libp2p.peerId.toString()}`)
  console.log('Listening Addresses:')
  libp2p.getMultiaddrs().forEach((ma: any) => {
    console.log(`  ${ma.toString()}`)
  })

  const xmppNode = new XmppNode(libp2p, rosterPathArg ? { rosterPath: rosterPathArg } : {})
  await xmppNode.ready

  await startCli(libp2p, xmppNode)
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
