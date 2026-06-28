/**
 * @packageDocumentation Main entry point for the XMPP P2P CLI application.
 * Parses CLI configuration arguments, spins up the underlying libp2p network node,
 * instantiates the XMPP protocol shim, and launches the interactive CLI session.
 */

import { join } from 'path'
import { createP2PNode } from './core/p2p.js'
import { XmppNode } from './core/xmpp-node.js'
import { NodeSqliteStorage } from './core/storage/node-sqlite-storage.js'
import { EncryptedStorage } from './core/storage/encrypted-storage.js'
import { startCli } from './cli/session.js'
import { startTui } from './tui/index.js'
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

  const innerStorage = new NodeSqliteStorage(
    startupOptions.sqlitePath ?? process.env.XMPP_SQLITE_PATH ?? join(process.cwd(), 'data', 'state.sqlite')
  )

  const passphrase = startupOptions.passphrase ?? process.env.XMPP_PASSPHRASE
  let storage = innerStorage as any

  if (passphrase) {
    const encrypted = new EncryptedStorage(innerStorage)
    const isEncrypted = await encrypted.isStorageEncrypted()
    if (!isEncrypted) {
      await encrypted.initialize(passphrase)
      console.log('Key storage encryption initialized (existing unencrypted records will migrate on next write)')
    } else {
      const valid = await encrypted.verifyPassphrase(passphrase)
      if (!valid) {
        console.error('Invalid passphrase — cannot decrypt local key storage')
        process.exit(1)
      }
      await encrypted.initialize(passphrase)
      console.log('Key storage unlocked')
    }
    storage = encrypted
  }

  console.log('Initializing libp2p Node...')
  const libp2p = await createP2PNode(startupOptions.port, {
    host: startupOptions.host,
    enableRelay: startupOptions.enableRelay,
    enableWebRTC: startupOptions.enableWebRTC
  })

  await libp2p.start()
  console.log('libp2p Node started!')
  console.log(`Peer ID: ${libp2p.peerId.toString()}`)
  console.log('Listening Addresses:')
  libp2p.getMultiaddrs().forEach((ma: any) => {
    console.log(`  ${ma.toString()}`)
  })

  const xmppNode = new XmppNode(libp2p, storage, {})
  await xmppNode.ready

  // Auto-connect XMPP component (XEP-0114) for federation
  if (startupOptions.componentHost && startupOptions.componentSecret && startupOptions.componentDomain) {
    try {
      const port = startupOptions.componentPort ?? 5347
      console.log(`Auto-connecting XMPP component ${startupOptions.componentDomain} at ${startupOptions.componentHost}:${port}...`)
      await xmppNode.connectComponent(startupOptions.componentHost, port, startupOptions.componentSecret, startupOptions.componentDomain)
    } catch (err: any) {
      console.error(`Failed to auto-connect XMPP component: ${err.message}`)
    }
  }

  // Configure S2S domain for direct federation
  if (startupOptions.s2sDomain) {
    xmppNode.setS2SDomain(startupOptions.s2sDomain)
    console.log(`S2S domain set to ${startupOptions.s2sDomain}`)
  }

  if (startupOptions.tuiRequested) {
    await startTui(libp2p, xmppNode)
  } else {
    await startCli(libp2p, xmppNode)
  }
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
