import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { multiaddr } from '@multiformats/multiaddr'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

async function runUploadTest() {
  console.log('Starting XMPP HTTP Upload / IPFS shim verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-uploads-'))
  const node1SqlitePath = join(workDir, 'node1-state.sqlite')
  const storage1 = new NodeSqliteStorage(node1SqlitePath)

  async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, message: string) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (await condition()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error(message)
  }

  async function fetchWithDiagnostics(label: string, url: string) {
    const response = await fetch(url)
    const text = await response.text()
    console.log(`[${label}] GET ${url} -> ${response.status} (${text.length} bytes)`)
    return { response, text }
  }

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined
  let libp2p3: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode3: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9601)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, storage1)

    libp2p2 = await createP2PNode(9602)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'node2-state.sqlite')))

    libp2p3 = await createP2PNode(9603)
    await libp2p3.start()
    xmppNode3 = new XmppNode(libp2p3, new NodeSqliteStorage(join(workDir, 'node3-state.sqlite')))

    await Promise.all([xmppNode1.ready, xmppNode2.ready, xmppNode3.ready])

    const node1 = xmppNode1 as XmppNode
    const node2 = xmppNode2 as XmppNode
    const node3 = xmppNode3 as XmppNode

    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    const node3Address = libp2p3.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p3.getMultiaddrs()[0]
    if (!node2Address) {
      throw new Error('Node 2 has no listening address')
    }
    if (!node3Address) {
      throw new Error('Node 3 has no listening address')
    }

    const uploadTarget = node2Address.toString().includes('/p2p/')
      ? node2Address
      : multiaddr(`${node2Address.toString()}/p2p/${libp2p2.peerId.toString()}`)
    console.log(`Connecting Node 1 to Node 2 at: ${uploadTarget.toString()}...`)
    await libp2p1.dial(uploadTarget)

    const replicaTarget = node3Address.toString().includes('/p2p/')
      ? node3Address
      : multiaddr(`${node3Address.toString()}/p2p/${libp2p3.peerId.toString()}`)
    console.log(`Connecting Node 1 to Node 3 at: ${replicaTarget.toString()}...`)
    await libp2p1.dial(replicaTarget)

    const node3OriginTarget = node2Address.toString().includes('/p2p/')
      ? node2Address
      : multiaddr(`${node2Address.toString()}/p2p/${libp2p2.peerId.toString()}`)
    console.log(`Connecting Node 3 to Node 2 at: ${node3OriginTarget.toString()}...`)
    await libp2p3.dial(node3OriginTarget)

    const payload = Buffer.from('XEP-0363 over p2p IPFS\n')

    console.log('Requesting upload slot over XMPP...')
    const slot = await node1.requestUploadSlot(uploadTarget, {
      filename: 'greeting.txt',
      size: payload.length,
      contentType: 'text/plain'
    })

    assert.ok(slot.putUrl.startsWith('http://'), 'slot PUT URL should be HTTP')
    assert.ok(slot.getUrl.startsWith('http://'), 'slot GET URL should be HTTP')

    console.log(`Uploading ${payload.length} bytes to: ${slot.putUrl}`)
    const putResponse = await fetch(slot.putUrl, {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain'
      },
      body: payload
    })

    assert.equal(putResponse.status, 201, 'upload PUT should return 201 Created')
    const putJson = await putResponse.json() as { cid: string; url: string }
    assert.ok(putJson.cid.length > 0, 'upload response should include a content id')
    assert.ok(putJson.url.endsWith(putJson.cid), 'upload response URL should be content addressed')

    const node1ContentUrl = node1.getUploadContentUrl(putJson.cid)
    assert.ok(node1ContentUrl, 'node 1 should expose a local content URL')

    console.log('Waiting for Node 1 to cache the uploaded payload...')
    await waitFor(async () => {
      const response = await fetch(node1ContentUrl!)
      const text = await response.text()
      return response.status === 200 && text === payload.toString()
    }, 10000, 'Timed out waiting for Node 1 to cache the uploaded payload')

    const { response: cachedResponse, text: cachedText } = await fetchWithDiagnostics('node1 cached', node1ContentUrl!)
    assert.equal(cachedResponse.status, 200, 'cached GET should resolve from Node 1')
    assert.equal(cachedText, payload.toString(), 'cached GET payload should match the uploaded bytes')
    assert.equal(cachedResponse.headers.get('content-type'), 'text/plain', 'cached GET should preserve the content type')

    console.log('Waiting for Node 3 to mirror the payload as a second provider...')
    const node3ContentUrl = node3.getUploadContentUrl(putJson.cid)
    assert.ok(node3ContentUrl, 'node 3 should expose a local content URL')
    await waitFor(async () => {
      const response = await fetch(node3ContentUrl!)
      const text = await response.text()
      return response.status === 200 && text === payload.toString()
    }, 10000, 'Timed out waiting for Node 3 to mirror the uploaded payload')

    await new Promise(resolve => setTimeout(resolve, 1000))

    console.log('Closing the origin node to prove the cache can serve the blob alone...')
    await xmppNode2.close()
    await libp2p2.stop()
    xmppNode2 = undefined
    libp2p2 = undefined

    console.log('Removing Node 1 local object to force a provider lookup...')
    await storage1.deleteBlob('uploads', putJson.cid)

    const { response: postOriginResponse, text: postOriginText } = await fetchWithDiagnostics('node1 post-origin', node1ContentUrl!)
    assert.equal(postOriginResponse.status, 200, 'cached GET should still work after origin shutdown')
    assert.ok(Number(postOriginResponse.headers.get('content-length') ?? '0') > 0, 'cached GET should not return an empty body after origin shutdown')
    assert.equal(postOriginText, payload.toString(), 'cached GET should still match after origin shutdown')

    console.log('\nUpload Test Results:')
    console.log('  - XMPP Upload Slot Delivered: SUCCESS')
    console.log('  - HTTP PUT Accepted: SUCCESS')
    console.log('  - Peer Cache Warmed From Announcement: SUCCESS')
    console.log('  - Replica Provider Mirrored Payload: SUCCESS')
    console.log('  - Provider Lookup Survived Origin Shutdown: SUCCESS')
    console.log('  - Cached Payload Survived Origin Shutdown: SUCCESS')
    console.log('\n>>> UPLOAD VERIFICATION SUCCESSFUL! <<<')
    return
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await xmppNode3?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await libp2p3?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runUploadTest().catch((err) => {
  console.error('Upload test error:', err)
  process.exit(1)
})
