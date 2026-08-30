import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createP2PNode } from './core/p2p.js'
import { NodeSqliteStorage } from './core/storage/node-sqlite-storage.js'
import { XmppNode } from './core/xmpp-node.js'
import { startTui } from './tui/index.js'

const valueFor = (args: string[], name: string) => {
  const index = args.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (index < 0) return undefined
  const arg = args[index]
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[index + 1]
}

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm start -- [--port <port>] [--host <host>] [--sqlite-path <path>]')
    return
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log('1.0.0')
    return
  }

  const portValue = valueFor(args, '--port')
  const port = portValue === undefined ? undefined : Number(portValue)
  if (portValue !== undefined && (port === undefined || !Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error(`Invalid port value: ${portValue}`)
  }

  const sqlitePath = valueFor(args, '--sqlite-path') ?? join(process.cwd(), 'data', 'state.sqlite')
  await mkdir(dirname(sqlitePath), { recursive: true })

  const libp2p = await createP2PNode(port, {
    host: valueFor(args, '--host'),
    enableWebRTC: args.includes('--webrtc'),
    enableRelay: args.includes('--relay')
  })
  const xmppNode = new XmppNode(libp2p, new NodeSqliteStorage(sqlitePath))
  await xmppNode.ready

  console.log(`Peer ID: ${libp2p.peerId.toString()}`)
  console.log(`JID: ${xmppNode.jid}`)
  console.log('Listening addresses:')
  for (const address of libp2p.getMultiaddrs()) console.log(`  ${address.toString()}`)
  await startTui(libp2p, xmppNode)
}

main().catch((error) => {
  console.error(`Fatal startup error: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
