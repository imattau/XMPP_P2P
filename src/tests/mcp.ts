import assert from 'node:assert/strict'
import { executeMcpTool, listMcpTools } from '../mcp/tools.js'

async function runMcpTest() {
  console.log('Starting MCP tool verification test...\n')

  const tools = listMcpTools()
  const toolNames = tools.map(tool => tool.name)
  assert.ok(toolNames.includes('publish_feed'), 'publish_feed tool should be exposed')
  assert.ok(toolNames.includes('list_feed_posts'), 'list_feed_posts tool should be exposed')

  const uploadRequests: Array<{ filename: string; size: number; contentType?: string }> = []
  const publishFeedCalls: Array<{ body: string; options: any }> = []
  const publishCollectionCalls: Array<{ id: string; body: string; options: any }> = []

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: true,
    status: 201
  }) as any) as typeof fetch

  try {
    const xmppNode = {
      jid: 'tester@p2p',
      libp2p: {
        peerId: {
          toString: () => 'peer-test'
        },
        getMultiaddrs: () => [{ toString: () => '/ip4/127.0.0.1/tcp/9999/p2p/peer-test' }]
      },
      requestUploadSlot: async (_target: string, options: { filename: string; size: number; contentType?: string }) => {
        uploadRequests.push(options)
        return {
          putUrl: 'http://127.0.0.1/upload/test',
          getUrl: 'http://127.0.0.1/ipfs/test'
        }
      },
      publishFeed: async (body: string, options: any = {}) => {
        publishFeedCalls.push({ body, options })
        return 'feed-item-1'
      },
      publishCollection: async (id: string, body: string, options: any = {}) => {
        publishCollectionCalls.push({ id, body, options })
        return 'collection-item-1'
      },
      getFeedPosts: async () => [{ id: 'post-1', title: 'Local post' }]
    }

    const discoveredPeers = new Map<string, string[]>([['peer-alias', ['/ip4/127.0.0.1/tcp/5555/p2p/peer-target']]])
    const context = {
      xmppNode: xmppNode as any,
      peerId: 'peer-test',
      listeningAddresses: ['/ip4/127.0.0.1/tcp/9999/p2p/peer-test'],
      discoveredPeers
    }

    const feedResult = await executeMcpTool('publish_feed', {
      body: 'Hello from MCP',
      title: 'MCP Article',
      summary: 'MCP summary',
      categories: ['news', 'mcp'],
      coverBase64: Buffer.from('cover-bytes').toString('base64'),
      coverFilename: 'cover.png',
      coverTarget: 'peer-alias'
    }, context)

    assert.equal(uploadRequests.length, 1)
    assert.equal(uploadRequests[0].filename, 'cover.png')
    assert.equal(uploadRequests[0].contentType, 'image/png')
    assert.equal(publishFeedCalls.length, 1)
    assert.match(publishFeedCalls[0].body, /^!\[cover\]\(http:\/\/127\.0\.0\.1\/ipfs\/test\)\n\nHello from MCP$/)
    assert.equal(publishFeedCalls[0].options.title, 'MCP Article')
    assert.deepEqual(publishFeedCalls[0].options.categories, ['news', 'mcp'])
    assert.equal(feedResult.content[0].text.includes('feed-item-1'), true)

    const collectionResult = await executeMcpTool('publish_feed', {
      body: 'Community post',
      targetId: 'community-1',
      categories: ['community']
    }, context)

    assert.equal(publishCollectionCalls.length, 1)
    assert.equal(publishCollectionCalls[0].id, 'community-1')
    assert.equal(publishCollectionCalls[0].body, 'Community post')
    assert.deepEqual(publishCollectionCalls[0].options.categories, ['community'])
    assert.equal(collectionResult.content[0].text.includes('collection-item-1'), true)

    const listResult = await executeMcpTool('list_feed_posts', {}, {
      xmppNode: xmppNode as any,
      peerId: 'peer-test',
      listeningAddresses: ['/ip4/127.0.0.1/tcp/9999/p2p/peer-test'],
      discoveredPeers
    })
    assert.equal(listResult.content[0].text.includes('Local post'), true)

    console.log('MCP tool verification results:')
    console.log('  - Tool registry includes publish_feed: SUCCESS')
    console.log('  - Tool registry includes list_feed_posts: SUCCESS')
    console.log('  - Cover upload path invoked: SUCCESS')
    console.log('  - Feed publish path invoked: SUCCESS')
    console.log('  - Collection publish path invoked: SUCCESS')
    console.log('  - Feed listing path invoked: SUCCESS')
    console.log('\n>>> MCP VERIFICATION SUCCESSFUL! <<<')
    process.exit(0)
  } finally {
    globalThis.fetch = originalFetch
  }
}

runMcpTest().catch((err) => {
  console.error('MCP test error:', err)
  process.exit(1)
})
