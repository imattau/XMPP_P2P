/**
 * @fileoverview MCP server entrypoint that exposes the XMPP node as a
 * JSON-RPC tool surface over stdio.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { executeMcpTool, listMcpTools } from './tools.js'
import { getPackageVersion, parseCliStartupArgs, printMcpUsage } from '../cli/startup.js'

// Redirect all standard console.log output to stderr
// to prevent corrupting the stdio transport JSON-RPC stream on stdout.
console.log = (...args: any[]) => {
  console.error(...args)
}

/**
 * Starts the MCP server, initializes the XMPP runtime, and wires tool handlers.
 *
 * @returns A promise that resolves when the stdio transport is connected.
 */
async function runMcpServer() {
  const startupOptions = parseCliStartupArgs(process.argv.slice(2))

  if (startupOptions.errors.length > 0) {
    console.error('Unable to start MCP server:')
    for (const error of startupOptions.errors) {
      console.error(`  - ${error}`)
    }
    console.error('')
    printMcpUsage()
    process.exit(1)
  }

  if (startupOptions.helpRequested) {
    printMcpUsage()
    process.exit(0)
  }

  if (startupOptions.versionRequested) {
    console.error(await getPackageVersion())
    process.exit(0)
  }

  const storage = new NodeSqliteStorage(
    startupOptions.sqlitePath ?? process.env.XMPP_SQLITE_PATH ?? join(process.cwd(), 'data', 'state.sqlite')
  )

  console.error('Initializing libp2p Node for MCP...')
  const libp2p = await createP2PNode(startupOptions.port, { host: startupOptions.host })
  await libp2p.start()

  console.error(`libp2p Node started! Peer ID: ${libp2p.peerId.toString()}`)

  const xmppNode = new XmppNode(libp2p, storage, {})
  await xmppNode.ready
  console.error(`XmppNode initialized! JID: ${xmppNode.jid}`)

  // Store discovered peers dynamically
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
      discoveredPeers.set(peerId, addrs)
    }
  })

  // Instantiate MCP server
  const server = new Server(
    {
      name: 'xmpp-p2p-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Define tools list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: listMcpTools(),
    }
  })

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      return await executeMcpTool(name, args, {
        xmppNode,
        peerId: libp2p.peerId.toString(),
        listeningAddresses: libp2p.getMultiaddrs().map((ma: any) => ma.toString()),
        discoveredPeers
      })
    } catch (err: any) {
      console.error(`MCP Tool execution failed: ${err.stack || err.message}`)
      return {
        isError: true,
        content: [{ type: 'text', text: `Execution failed: ${err.message}` }],
      }
    }
  })

  // Establish connection using Stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('MCP Server connected and listening on stdin/stdout!')
}

runMcpServer().catch((err) => {
  console.error('Fatal MCP Server startup error:', err)
  process.exit(1)
})
