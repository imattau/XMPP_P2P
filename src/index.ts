/**
 * @packageDocumentation Main entry point for the XMPP P2P CLI application.
 * Parses CLI configuration arguments, spins up the underlying libp2p network node,
 * instantiates the XMPP protocol shim, and launches the interactive CLI session.
 */

import { join } from 'path'
import { createP2PNode } from './core/p2p.js'
import { XmppNode } from './core/xmpp-node.js'
import { NodeSqliteStorage } from './core/storage/node-sqlite-storage.js'
import { startCli } from './cli/session.js'
import { getPackageVersion, parseCliStartupArgs, printCliUsage } from './cli/startup.js'

/**
 * Parses startup options from the command line, starts the local P2P network node,
 * bootstraps XMPP protocol managers, and enters the terminal CLI loop.
 * 
 * @returns A promise that resolves when the session completes.
 */
async function main() {
  const startupOptions = parseCliStartupArgs(process.argv.slice(2))

  if (startupOptions.errors.length > 0) {
    console.error('Unable to start CLI:')
    for (const error of startupOptions.errors) {
      console.error(`  - ${error}`)
    }
    console.error('')
    printCliUsage()
    process.exit(1)
  }

  if (startupOptions.helpRequested) {
    printCliUsage()
    process.exit(0)
  }

  if (startupOptions.versionRequested) {
    console.log(await getPackageVersion())
    process.exit(0)
  }

  const storage = new NodeSqliteStorage(
    startupOptions.sqlitePath ?? process.env.XMPP_SQLITE_PATH ?? join(process.cwd(), 'data', 'state.sqlite')
  )

  console.log('Initializing libp2p Node...')
  const libp2p = await createP2PNode(startupOptions.port, { host: startupOptions.host })

  await libp2p.start()
  console.log('libp2p Node started!')
  console.log(`Peer ID: ${libp2p.peerId.toString()}`)
  console.log('Listening Addresses:')
  libp2p.getMultiaddrs().forEach((ma: any) => {
    console.log(`  ${ma.toString()}`)
  })

  const xmppNode = new XmppNode(libp2p, storage, {})
  await xmppNode.ready

  await startCli(libp2p, xmppNode)
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
