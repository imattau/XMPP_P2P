import assert from 'node:assert/strict'
import { XmppNode } from '../core/xmpp-node.js'

async function run() {
  const node = Object.create(XmppNode.prototype) as any
  let acknowledgePublish!: () => void
  let receivedPublish!: (value: { jid: string; node: string; itemId: string; payload: { toString(): string } }) => void
  const publishRequest = new Promise<{ jid: string; node: string; itemId: string; payload: { toString(): string } }>((resolve) => {
    receivedPublish = resolve
  })
  let recordedPost: any
  node.clientBridge = {
    isConnected: true,
    accountJid: 'alice@example.test/resource',
    pubsubPublish: (jid: string, pepNode: string, itemId: string, payload: { toString(): string }) => {
      receivedPublish({ jid, node: pepNode, itemId, payload })
      return new Promise<void>((resolve) => { acknowledgePublish = resolve })
    },
  }
  node.feedManager = {
    recordFeedPost: async (post: unknown, options: unknown) => {
      recordedPost = { post, options }
      return true
    },
  }

  const publishing = node.publishServerMicroblog('A post for my XMPP followers', {
    itemId: 'server-post-1',
    title: 'Server post',
    summary: 'A short summary',
    categories: ['Nexus'],
  })
  const request = await publishRequest

  assert.equal(request.jid, 'alice@example.test')
  assert.equal(request.node, 'urn:xmpp:microblog:0')
  assert.equal(request.itemId, 'server-post-1')
  assert.match(request.payload.toString(), /<entry xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/)
  assert.match(request.payload.toString(), /<title type="text">Server post<\/title>/)
  assert.match(request.payload.toString(), /<summary type="text">A short summary<\/summary>/)
  assert.match(request.payload.toString(), /<category term="Nexus"/)
  assert.match(request.payload.toString(), /A post for my XMPP followers/)
  assert.equal(recordedPost, undefined, 'The local feed must wait until the XMPP server acknowledges publication.')

  acknowledgePublish()
  assert.equal(await publishing, 'server-post-1')
  const recorded = recordedPost as { post: any; options: any } | undefined
  assert.ok(recorded)
  assert.deepEqual(recorded.options, { propagateToCollections: false, updateExisting: true })
  assert.equal(recorded.post.id, 'alice@example.test:server-post-1')
  assert.equal(recorded.post.topic, 'xmpp-pep:alice@example.test')
  assert.equal(recorded.post.from, 'alice@example.test')
  assert.equal(recorded.post.body, 'A post for my XMPP followers')
  assert.deepEqual(recorded.post.categories, ['Nexus'])

  node.clientBridge.isConnected = false
  await assert.rejects(node.publishServerMicroblog('Offline post'), /Connect your XMPP account/)
  console.log('XMPP server microblog publishing acknowledgement and feed mapping: PASS')
}

void run().catch((error) => {
  console.error('XMPP server microblog publishing test failed:', error)
  process.exitCode = 1
})
