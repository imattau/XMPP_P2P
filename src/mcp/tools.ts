/**
 * @fileoverview MCP tool descriptors and execution helpers for the XMPP node
 * management surface exposed to external clients.
 */

import fs from 'fs'
import path from 'path'
import { type XmppNode } from '../core/xmpp-node.js'

/**
 * Arguments accepted by the feed publishing MCP tool.
 */
export type FeedPublishArgs = {
  body: string
  targetId?: string
  title?: string
  summary?: string
  categories?: string[]
  coverBase64?: string
  coverFilename?: string
  coverContentType?: string
  coverTarget?: string
}

/**
 * Describes a single MCP tool and its JSON schema.
 */
export type McpToolDescriptor = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Returns a MIME type guess based on the provided filename.
 *
 * @param filename - Optional filename to inspect.
 * @returns A best-effort content type string.
 */
const guessContentType = (filename?: string) => {
  switch (path.extname(filename ?? '').toLowerCase()) {
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
 * Lists the MCP tools supported by this node.
 *
 * @returns Tool descriptors with names, descriptions, and input schemas.
 */
export const listMcpTools = (): McpToolDescriptor[] => [
  {
    name: 'get_info',
    description: 'Get local node info including Peer ID, JID, and listening addresses',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_peers',
    description: 'List discovered peers and their multiaddresses',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'dial',
    description: 'Dial/connect to a peer ID or multiaddr',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Peer ID or Multiaddr to dial' }
      },
      required: ['target']
    }
  },
  {
    name: 'send_message',
    description: 'Send a plaintext message to a target JID or peer JID',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target JID, Peer ID, or multiaddr' },
        body: { type: 'string', description: 'Message body' }
      },
      required: ['to', 'body']
    }
  },
  {
    name: 'send_secure_message',
    description: 'Send an OMEMO-encrypted message to a target JID or peer JID',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target JID, Peer ID, or multiaddr' },
        body: { type: 'string', description: 'Message body' }
      },
      required: ['to', 'body']
    }
  },
  {
    name: 'list_roster',
    description: 'List current roster contacts',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'add_roster_entry',
    description: 'Add a contact to the roster',
    inputSchema: {
      type: 'object',
      properties: {
        jid: { type: 'string', description: 'JID of the contact' },
        name: { type: 'string', description: 'Optional friendly name' }
      },
      required: ['jid']
    }
  },
  {
    name: 'remove_roster_entry',
    description: 'Remove a contact from the roster',
    inputSchema: {
      type: 'object',
      properties: {
        jid: { type: 'string', description: 'JID of the contact to remove' }
      },
      required: ['jid']
    }
  },
  {
    name: 'broadcast_presence',
    description: 'Broadcast availability status',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['available', 'unavailable'], default: 'available' },
        status: { type: 'string', description: 'Optional status message (e.g. "Coding...")' },
        show: { type: 'string', enum: ['away', 'chat', 'dnd', 'xa'], description: 'Optional presence show detail' }
      }
    }
  },
  {
    name: 'set_client_state',
    description: 'Set local client state (active or inactive) for Client State Indication (XEP-0352)',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['active', 'inactive'], description: 'Client state to set' }
      },
      required: ['state']
    }
  },
  {
    name: 'join_muc',
    description: 'Join a Multi-User Chat (MUC) room',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: { type: 'string', description: 'Name of the MUC room' },
        nickname: { type: 'string', description: 'Nickname to use in the room' }
      },
      required: ['roomName', 'nickname']
    }
  },
  {
    name: 'send_muc_message',
    description: 'Send a message to an MUC room',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: { type: 'string', description: 'Name of the MUC room' },
        body: { type: 'string', description: 'Message body' }
      },
      required: ['roomName', 'body']
    }
  },
  {
    name: 'publish_feed',
    description: 'Publish a feed post or article with Atom metadata and an optional cover image upload',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'Post body text' },
        targetId: { type: 'string', description: 'Feed target id, defaults to the local feed' },
        title: { type: 'string', description: 'Optional article title' },
        summary: { type: 'string', description: 'Optional article summary' },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional Atom category terms'
        },
        coverBase64: { type: 'string', description: 'Optional cover image as base64' },
        coverFilename: { type: 'string', description: 'Filename used for the cover upload slot' },
        coverContentType: { type: 'string', description: 'Optional cover image MIME type' },
        coverTarget: { type: 'string', description: 'Peer id, JID, or multiaddr used to request the upload slot' }
      },
      required: ['body']
    }
  },
  {
    name: 'list_feed_posts',
    description: 'List local feed posts including Atom metadata',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_docs',
    description: 'List all generated HTML documentation files under the docs/ directory',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_doc',
    description: 'Read and clean the text content of a specific documentation HTML file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path of the HTML documentation file (e.g. "classes/XmppNode.html")' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_docs',
    description: 'Perform a keyword search across the generated documentation HTML files',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword query to search for' }
      },
      required: ['query']
    }
  }
]

export async function executeMcpTool(
  name: string,
  args: unknown,
  ctx: {
    xmppNode: XmppNode
    peerId: string
    listeningAddresses: string[]
    discoveredPeers: Map<string, string[]>
  }
): Promise<{ isError?: boolean; content: Array<{ type: 'text'; text: string }> }> {
  function resolveTarget(target: string): string {
    const discovered = ctx.discoveredPeers.get(target)
    if (discovered && discovered.length > 0) {
      return discovered[0]
    }
    return target
  }

  switch (name) {
    case 'get_info': {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              peerId: ctx.peerId,
              jid: ctx.xmppNode.jid,
              listeningAddresses: ctx.listeningAddresses
            }, null, 2)
          }
        ]
      }
    }
    case 'list_peers': {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(Array.from(ctx.discoveredPeers.entries()).map(([peerId, addresses]) => ({ peerId, addresses })), null, 2)
          }
        ]
      }
    }
    case 'dial': {
      const target = resolveTarget((args as any).target)
      await ctx.xmppNode.getOrCreateStream(target)
      return {
        content: [{ type: 'text', text: `Successfully connected to: ${target}` }]
      }
    }
    case 'send_message': {
      const to = resolveTarget((args as any).to)
      const body = (args as any).body
      const id = await ctx.xmppNode.sendMessage(to, body, { requestReceipt: true })
      return {
        content: [{ type: 'text', text: `Message sent. ID: ${id}` }]
      }
    }
    case 'send_secure_message': {
      const to = resolveTarget((args as any).to)
      const body = (args as any).body
      const id = await ctx.xmppNode.sendEncryptedMessage(to, body, { requestReceipt: true })
      return {
        content: [{ type: 'text', text: `Secure OMEMO message sent. ID: ${id}` }]
      }
    }
    case 'list_roster': {
      const rosterList = await ctx.xmppNode.getRosterEntries()
      return { content: [{ type: 'text', text: JSON.stringify(rosterList, null, 2) }] }
    }
    case 'add_roster_entry': {
      const jid = (args as any).jid
      const entryName = (args as any).name
      const entry = await ctx.xmppNode.addRosterEntry(jid, entryName)
      return { content: [{ type: 'text', text: `Roster entry added: ${JSON.stringify(entry)}` }] }
    }
    case 'remove_roster_entry': {
      const jid = (args as any).jid
      await ctx.xmppNode.removeRosterEntry(jid)
      return { content: [{ type: 'text', text: `Roster entry removed: ${jid}` }] }
    }
    case 'broadcast_presence': {
      const presenceType = (args as any).type || 'available'
      const status = (args as any).status
      const show = (args as any).show
      await ctx.xmppNode.broadcastPresence(presenceType, status, show)
      return {
        content: [{ type: 'text', text: `Presence updated: type=${presenceType}, status=${status}, show=${show}` }]
      }
    }
    case 'set_client_state': {
      const state = (args as any).state
      await ctx.xmppNode.setClientState(state)
      return { content: [{ type: 'text', text: `Client state updated to: ${state}` }] }
    }
    case 'join_muc': {
      const roomName = (args as any).roomName
      const nickname = (args as any).nickname
      await ctx.xmppNode.muc.joinRoom(roomName, nickname)
      return { content: [{ type: 'text', text: `Joined MUC room: ${roomName} as ${nickname}` }] }
    }
    case 'send_muc_message': {
      const roomName = (args as any).roomName
      const body = (args as any).body
      const id = await ctx.xmppNode.muc.sendGroupMessage(roomName, body)
      return { content: [{ type: 'text', text: `MUC message sent. ID: ${id}` }] }
    }
    case 'publish_feed': {
      const feedArgs = args as FeedPublishArgs
      const body = feedArgs.body?.trim()
      if (!body) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Feed body is required.' }]
        }
      }

      let finalBody = body
      if (feedArgs.coverBase64) {
        const coverFilename = feedArgs.coverFilename || 'cover-image'
        const coverTarget = resolveTarget(feedArgs.coverTarget || ctx.xmppNode.jid)
        const contentType = feedArgs.coverContentType || guessContentType(coverFilename)
        const bytes = Buffer.from(feedArgs.coverBase64, 'base64')
        const slot = await ctx.xmppNode.requestUploadSlot(coverTarget, {
          filename: coverFilename,
          size: bytes.byteLength,
          contentType
        })

        const response = await fetch(slot.putUrl, {
          method: 'PUT',
          headers: {
            'content-type': contentType
          },
          body: bytes
        })

        if (!response.ok) {
          throw new Error(`Cover upload failed with ${response.status}`)
        }

        finalBody = `![cover](${slot.getUrl})\n\n${finalBody}`
      }

      const targetId = feedArgs.targetId?.trim()
      const categories = feedArgs.categories ?? []
      const itemId = !targetId || targetId === 'feed'
        ? await ctx.xmppNode.publishFeed(finalBody, {
            title: feedArgs.title,
            summary: feedArgs.summary,
            categories
          })
        : await ctx.xmppNode.publishCollection(targetId, finalBody, {
            title: feedArgs.title,
            summary: feedArgs.summary,
            categories
          })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              itemId,
              targetId: targetId || 'feed',
              title: feedArgs.title ?? null,
              categories
            }, null, 2)
          }
        ]
      }
    }
    case 'list_feed_posts': {
      const posts = await ctx.xmppNode.getFeedPosts()
      return { content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }] }
    }
    case 'list_docs': {
      const docsDir = path.resolve(process.cwd(), 'docs')
      if (!fs.existsSync(docsDir)) {
        return { content: [{ type: 'text', text: 'Documentation has not been generated yet. Run npm run build and typedoc.' }] }
      }
      const getFiles = (dir: string): string[] => {
        const results: string[] = []
        const list: string[] = fs.readdirSync(dir)
        list.forEach((file: string) => {
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
      return { content: [{ type: 'text', text: JSON.stringify(htmlFiles, null, 2) }] }
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
      return { content: [{ type: 'text', text: cleanText }] }
    }
    case 'search_docs': {
      const query = ((args as any).query || '').toLowerCase()
      const docsDir = path.resolve(process.cwd(), 'docs')
      if (!fs.existsSync(docsDir)) {
        return { content: [{ type: 'text', text: 'Documentation has not been generated yet.' }] }
      }
      const getFiles = (dir: string): string[] => {
        const results: string[] = []
        const list: string[] = fs.readdirSync(dir)
        list.forEach((file: string) => {
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
      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] }
    }
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }]
      }
  }
}
