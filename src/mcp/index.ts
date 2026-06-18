import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import fs from 'fs'
import path from 'path'

// Redirect all standard console.log output to stderr
// to prevent corrupting the stdio transport JSON-RPC stream on stdout.
const originalLog = console.log
console.log = (...args: any[]) => {
  console.error(...args)
}

async function runMcpServer() {
  const args = process.argv.slice(2)
  const portArg = args.find(arg => arg.startsWith('--port='))
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : undefined
  const rosterPathArg = args.find(arg => arg.startsWith('--roster-file='))?.split('=')[1]
  const hostArg = args.find(arg => arg.startsWith('--host='))?.split('=')[1]

  console.error('Initializing libp2p Node for MCP...')
  const libp2p = await createP2PNode(port, { host: hostArg })
  await libp2p.start()

  console.error(`libp2p Node started! Peer ID: ${libp2p.peerId.toString()}`)

  const xmppNode = new XmppNode(libp2p, rosterPathArg ? { rosterPath: rosterPathArg } : {})
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
      tools: [
        {
          name: 'get_info',
          description: 'Get local node info including Peer ID, JID, and listening addresses',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'list_peers',
          description: 'List discovered peers and their multiaddresses',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'dial',
          description: 'Dial/connect to a peer ID or multiaddr',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Peer ID or Multiaddr to dial' },
            },
            required: ['target'],
          },
        },
        {
          name: 'send_message',
          description: 'Send a plaintext message to a target JID or peer JID',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Target JID, Peer ID, or multiaddr' },
              body: { type: 'string', description: 'Message body' },
            },
            required: ['to', 'body'],
          },
        },
        {
          name: 'send_secure_message',
          description: 'Send an OMEMO-encrypted message to a target JID or peer JID',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Target JID, Peer ID, or multiaddr' },
              body: { type: 'string', description: 'Message body' },
            },
            required: ['to', 'body'],
          },
        },
        {
          name: 'list_roster',
          description: 'List current roster contacts',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'add_roster_entry',
          description: 'Add a contact to the roster',
          inputSchema: {
            type: 'object',
            properties: {
              jid: { type: 'string', description: 'JID of the contact' },
              name: { type: 'string', description: 'Optional friendly name' },
            },
            required: ['jid'],
          },
        },
        {
          name: 'remove_roster_entry',
          description: 'Remove a contact from the roster',
          inputSchema: {
            type: 'object',
            properties: {
              jid: { type: 'string', description: 'JID of the contact to remove' },
            },
            required: ['jid'],
          },
        },
        {
          name: 'broadcast_presence',
          description: 'Broadcast availability status',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['available', 'unavailable'], default: 'available' },
              status: { type: 'string', description: 'Optional status message (e.g. "Coding...")' },
              show: { type: 'string', enum: ['away', 'chat', 'dnd', 'xa'], description: 'Optional presence show detail' },
            },
          },
        },
        {
          name: 'join_muc',
          description: 'Join a Multi-User Chat (MUC) room',
          inputSchema: {
            type: 'object',
            properties: {
              roomName: { type: 'string', description: 'Name of the MUC room' },
              nickname: { type: 'string', description: 'Nickname to use in the room' },
            },
            required: ['roomName', 'nickname'],
          },
        },
        {
          name: 'send_muc_message',
          description: 'Send a message to an MUC room',
          inputSchema: {
            type: 'object',
            properties: {
              roomName: { type: 'string', description: 'Name of the MUC room' },
              body: { type: 'string', description: 'Message body' },
            },
            required: ['roomName', 'body'],
          },
        },
        {
          name: 'list_docs',
          description: 'List all generated HTML documentation files under the docs/ directory',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'read_doc',
          description: 'Read and clean the text content of a specific documentation HTML file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of the HTML documentation file (e.g. "classes/XmppNode.html")' },
            },
            required: ['path'],
          },
        },
        {
          name: 'search_docs',
          description: 'Perform a keyword search across the generated documentation HTML files',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Keyword query to search for' },
            },
            required: ['query'],
          },
        },
      ],
    }
  })

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    function resolveTarget(target: string): string {
      const discovered = discoveredPeers.get(target)
      if (discovered && discovered.length > 0) {
        return discovered[0]
      }
      return target
    }

    try {
      switch (name) {
        case 'get_info': {
          const addrs = libp2p.getMultiaddrs().map((ma: any) => ma.toString())
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  peerId: libp2p.peerId.toString(),
                  jid: xmppNode.jid,
                  listeningAddresses: addrs,
                }, null, 2),
              },
            ],
          }
        }
        case 'list_peers': {
          const peersList: any[] = []
          for (const [peerId, addrs] of discoveredPeers.entries()) {
            peersList.push({ peerId, addresses: addrs })
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(peersList, null, 2) }],
          }
        }
        case 'dial': {
          const target = resolveTarget((args as any).target)
          console.error(`Dialing target: ${target}`)
          await xmppNode.getOrCreateStream(target)
          return {
            content: [{ type: 'text', text: `Successfully connected to: ${target}` }],
          }
        }
        case 'send_message': {
          const to = resolveTarget((args as any).to)
          const body = (args as any).body
          const id = await xmppNode.sendMessage(to, body, { requestReceipt: true })
          return {
            content: [{ type: 'text', text: `Message sent. ID: ${id}` }],
          }
        }
        case 'send_secure_message': {
          const to = resolveTarget((args as any).to)
          const body = (args as any).body
          const id = await xmppNode.sendEncryptedMessage(to, body, { requestReceipt: true })
          return {
            content: [{ type: 'text', text: `Secure OMEMO message sent. ID: ${id}` }],
          }
        }
        case 'list_roster': {
          const rosterList = await xmppNode.getRosterEntries()
          return {
            content: [{ type: 'text', text: JSON.stringify(rosterList, null, 2) }],
          }
        }
        case 'add_roster_entry': {
          const jid = (args as any).jid
          const entryName = (args as any).name
          const entry = await xmppNode.addRosterEntry(jid, entryName)
          return {
            content: [{ type: 'text', text: `Roster entry added: ${JSON.stringify(entry)}` }],
          }
        }
        case 'remove_roster_entry': {
          const jid = (args as any).jid
          await xmppNode.removeRosterEntry(jid)
          return {
            content: [{ type: 'text', text: `Roster entry removed: ${jid}` }],
          }
        }
        case 'broadcast_presence': {
          const presenceType = (args as any).type || 'available'
          const status = (args as any).status
          const show = (args as any).show
          await xmppNode.broadcastPresence(presenceType, status, show)
          return {
            content: [{ type: 'text', text: `Presence updated: type=${presenceType}, status=${status}, show=${show}` }],
          }
        }
        case 'join_muc': {
          const roomName = (args as any).roomName
          const nickname = (args as any).nickname
          await xmppNode.muc.joinRoom(roomName, nickname)
          return {
            content: [{ type: 'text', text: `Joined MUC room: ${roomName} as ${nickname}` }],
          }
        }
        case 'send_muc_message': {
          const roomName = (args as any).roomName
          const body = (args as any).body
          const id = await xmppNode.muc.sendGroupMessage(roomName, body)
          return {
            content: [{ type: 'text', text: `MUC message sent. ID: ${id}` }],
          }
        }
        case 'list_docs': {
          const docsDir = path.resolve(process.cwd(), 'docs')
          if (!fs.existsSync(docsDir)) {
            return { content: [{ type: 'text', text: 'Documentation has not been generated yet. Run npm run build and typedoc.' }] }
          }
          const getFiles = (dir: string): string[] => {
            const results: string[] = []
            const list = fs.readdirSync(dir)
            list.forEach(file => {
              const fullPath = path.join(dir, file)
              const stat = fs.statSync(fullPath)
              if (stat && stat.isDirectory()) {
                results.push(...getFiles(fullPath))
              } else {
                if (file.endsWith('.html')) {
                  results.push(path.relative(docsDir, fullPath))
                }
              }
            })
            return results
          }
          const htmlFiles = getFiles(docsDir)
          return {
            content: [{ type: 'text', text: JSON.stringify(htmlFiles, null, 2) }],
          }
        }
        case 'read_doc': {
          const relativePath = (args as any).path
          const targetPath = path.resolve(process.cwd(), 'docs', relativePath)
          if (!targetPath.startsWith(path.resolve(process.cwd(), 'docs'))) {
            return { isError: true, content: [{ type: 'text', text: 'Path traversal detected.' }] }
          }
          if (!fs.existsSync(targetPath)) {
            return { isError: true, content: [{ type: 'text', text: `File not found: ${relativePath}` }] }
          }
          const htmlContent = fs.readFileSync(targetPath, 'utf8')
          const cleanText = htmlContent
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
            .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          return {
            content: [{ type: 'text', text: cleanText }],
          }
        }
        case 'search_docs': {
          const query = ((args as any).query || '').toLowerCase()
          const docsDir = path.resolve(process.cwd(), 'docs')
          if (!fs.existsSync(docsDir)) {
            return { content: [{ type: 'text', text: 'Documentation has not been generated yet.' }] }
          }
          const getFiles = (dir: string): string[] => {
            const results: string[] = []
            const list = fs.readdirSync(dir)
            list.forEach(file => {
              const fullPath = path.join(dir, file)
              const stat = fs.statSync(fullPath)
              if (stat && stat.isDirectory()) {
                results.push(...getFiles(fullPath))
              } else {
                if (file.endsWith('.html')) {
                  results.push(fullPath)
                }
              }
            })
            return results
          }
          const htmlFiles = getFiles(docsDir)
          const matches: any[] = []
          for (const filePath of htmlFiles) {
            const content = fs.readFileSync(filePath, 'utf8')
            const cleanText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
            if (cleanText.toLowerCase().includes(query)) {
              const idx = cleanText.toLowerCase().indexOf(query)
              const start = Math.max(0, idx - 100)
              const end = Math.min(cleanText.length, idx + query.length + 100)
              const snippet = cleanText.substring(start, end)
              matches.push({
                file: path.relative(docsDir, filePath),
                snippet: `... ${snippet.trim()} ...`
              })
            }
            if (matches.length >= 15) break
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }],
          }
        }
        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          }
      }
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
