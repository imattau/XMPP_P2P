import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createP2PNode } from '../core/p2p.js'
import { XmppNode } from '../core/xmpp-node.js'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, message: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(message)
}

async function runProtocolTest() {
  console.log('Starting XMPP relay-compatibility protocol verification test...\n')

  const workDir = await mkdtemp(join(tmpdir(), 'xmpp-p2p-protocol-'))

  let libp2p1: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode1: XmppNode | undefined
  let libp2p2: Awaited<ReturnType<typeof createP2PNode>> | undefined
  let xmppNode2: XmppNode | undefined

  try {
    libp2p1 = await createP2PNode(9701)
    await libp2p1.start()
    xmppNode1 = new XmppNode(libp2p1, new NodeSqliteStorage(join(workDir, 'node1-state.sqlite')), { nickname: 'Alice' })

    libp2p2 = await createP2PNode(9702)
    await libp2p2.start()
    xmppNode2 = new XmppNode(libp2p2, new NodeSqliteStorage(join(workDir, 'node2-state.sqlite')), { nickname: 'Bob' })

    await Promise.all([xmppNode1.ready, xmppNode2.ready])

    const node1 = xmppNode1
    const node2 = xmppNode2
    const node1Address = libp2p1.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p1.getMultiaddrs()[0]
    const node2Address = libp2p2.getMultiaddrs().find((ma: any) => ma.toString().includes('127.0.0.1')) || libp2p2.getMultiaddrs()[0]
    if (!node1Address) {
      throw new Error('Node 1 has no listening addresses')
    }
    if (!node2Address) {
      throw new Error('Node 2 has no listening addresses')
    }

    await libp2p2.dial(node1Address)

    const streamFromNode2 = await node2.getOrCreateStream(node1Address)
    await node2.setNickname('Bobster')

    await waitFor(async () => {
      const rosterEntry = await node1.getRosterEntry(libp2p2.peerId.toString() + '@p2p')
      return rosterEntry?.nickname === 'Bobster'
    }, 10000, 'Timed out waiting for nickname to propagate through presence')

    let receivedMessageNickname: string | undefined
    node1.on('message', (msg) => {
      if (msg.body === 'Nickname check') {
        receivedMessageNickname = msg.nickname
      }
    })

    const iqResponsePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for IQ error response')), 10000)
      const onElement = (element: any) => {
        if (element.name !== 'iq' || element.attrs.type !== 'error') {
          return
        }
        clearTimeout(timeout)
        streamFromNode2.off('element', onElement)
        resolve(element)
      }

      streamFromNode2.on('element', onElement)
    })

    streamFromNode2.send(
      `<iq to='${libp2p1.peerId.toString()}@p2p' from='${libp2p2.peerId.toString()}@p2p' type='get' id='proto-1'><query xmlns='urn:example:unsupported'/></iq>`
    )

    const iqResponse = await iqResponsePromise
    const errorEl = iqResponse.getChild('error')
    if (!errorEl || errorEl.attrs.type !== 'cancel') {
      throw new Error('Unsupported IQ did not produce a cancel error')
    }
    const conditionEl = (errorEl.children as any[]).find(child => child?.name === 'service-unavailable')
    if (!conditionEl) {
      throw new Error('Unsupported IQ did not return service-unavailable')
    }

    const malformedIqPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for malformed IQ error response')), 10000)
      const onElement = (element: any) => {
        if (element.name !== 'iq' || element.attrs.type !== 'error') {
          return
        }
        clearTimeout(timeout)
        streamFromNode2.off('element', onElement)
        resolve(element)
      }

      streamFromNode2.on('element', onElement)
    })

    streamFromNode2.send(
      `<iq to='${libp2p1.peerId.toString()}@p2p' from='${libp2p2.peerId.toString()}@p2p' type='get' id='proto-2'><query xmlns='jabber:iq:roster'/><extra xmlns='urn:example:extra'/></iq>`
    )

    const malformedIqResponse = await malformedIqPromise
    const malformedIqError = malformedIqResponse.getChild('error')
    const malformedIqCondition = malformedIqError?.getChild('bad-request')
    if (!malformedIqError || malformedIqError.attrs.type !== 'modify' || !malformedIqCondition) {
      throw new Error('Malformed IQ did not produce a bad-request modify error')
    }

    const badPresencePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for malformed presence error response')), 10000)
      const onElement = (element: any) => {
        if (element.name !== 'presence' || element.attrs.type !== 'error') {
          return
        }
        clearTimeout(timeout)
        streamFromNode2.off('element', onElement)
        resolve(element)
      }

      streamFromNode2.on('element', onElement)
    })

    streamFromNode2.send(
      `<presence from='${libp2p2.peerId.toString()}@p2p/resource' to='${libp2p1.peerId.toString()}@p2p'><show>busy</show></presence>`
    )

    const badPresenceResponse = await badPresencePromise
    const badPresenceError = badPresenceResponse.getChild('error')
    const badPresenceCondition = badPresenceError?.getChild('bad-request')
    if (!badPresenceError || badPresenceError.attrs.type !== 'modify' || !badPresenceCondition) {
      throw new Error('Malformed presence did not produce a bad-request modify error')
    }

    streamFromNode2.send(
      `<presence from='${libp2p2.peerId.toString()}@p2p/resource' to='${libp2p1.peerId.toString()}@p2p'><c xmlns='http://jabber.org/protocol/caps' hash='sha-256' node='urn:xmpp:p2p:relay-test' ver='relay-test-ver'/></presence>`
    )

    await waitFor(async () => {
      const caps = await node1.getEntityCapabilities(node2Address)
      return caps?.peerId === libp2p2.peerId.toString() && caps?.hash === 'sha-256'
    }, 10000, 'Timed out waiting for non-SHA-1 capabilities to be recorded')

    await node2.sendMessage(node1Address, 'Nickname check')
    await waitFor(() => receivedMessageNickname === 'Bobster', 10000, 'Timed out waiting for nickname on chat message')

    const initialAvatar = Buffer.from('bob-avatar-1').toString('base64')
    const updatedAvatar = Buffer.from('bob-avatar-2').toString('base64')
    await node2.setVCard({ fn: 'Bob Example', nickname: 'Bobster', photo: { type: 'image/png', binval: initialAvatar } })

    const streamToNode2 = await node1.getOrCreateStream(node2Address)

    const vCardGetPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for vCard get response')), 10000)
      const onElement = (element: any) => {
        if (element.name !== 'iq' || element.attrs.type !== 'result') {
          return
        }
        clearTimeout(timeout)
        streamToNode2.off('element', onElement)
        resolve(element)
      }

      streamToNode2.on('element', onElement)
    })

    streamToNode2.send(
      `<iq to='${libp2p2.peerId.toString()}@p2p' from='${libp2p1.peerId.toString()}@p2p' type='get' id='vcard-1'><vCard xmlns='vcard-temp'/></iq>`
    )

    const vCardGetResponse = await vCardGetPromise
    const vCardGet = vCardGetResponse.getChild('vCard')
    const vCardGetFn = vCardGet?.getChild('FN')?.text()
    const vCardGetNickname = vCardGet?.getChild('NICKNAME')?.text()
    const vCardGetPhotoType = vCardGet?.getChild('PHOTO')?.getChild('TYPE')?.text()
    const vCardGetPhotoBinval = vCardGet?.getChild('PHOTO')?.getChild('BINVAL')?.text()
    if (vCardGetFn !== 'Bob Example' || vCardGetNickname !== 'Bobster' || vCardGetPhotoType !== 'image/png' || vCardGetPhotoBinval !== initialAvatar) {
      throw new Error(`Unexpected initial vCard payload: FN=${vCardGetFn ?? 'missing'} NICKNAME=${vCardGetNickname ?? 'missing'} PHOTO.TYPE=${vCardGetPhotoType ?? 'missing'} PHOTO.BINVAL=${vCardGetPhotoBinval ?? 'missing'}`)
    }

    const vCardSetPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for vCard set response')), 10000)
      const onElement = (element: any) => {
        if (element.name !== 'iq' || element.attrs.type !== 'result') {
          return
        }
        clearTimeout(timeout)
        streamToNode2.off('element', onElement)
        resolve(element)
      }

      streamToNode2.on('element', onElement)
    })

    streamToNode2.send(
      `<iq to='${libp2p2.peerId.toString()}@p2p' from='${libp2p1.peerId.toString()}@p2p' type='set' id='vcard-2'><vCard xmlns='vcard-temp'><FN>Bob Relay</FN><NICKNAME>Bobby</NICKNAME><PHOTO><TYPE>image/png</TYPE><BINVAL>${updatedAvatar}</BINVAL></PHOTO></vCard></iq>`
    )

    await vCardSetPromise

    await waitFor(async () => {
      const rosterEntry = await node1.getRosterEntry(libp2p2.peerId.toString() + '@p2p')
      return rosterEntry?.nickname === 'Bobby'
    }, 10000, 'Timed out waiting for nickname to propagate from vCard update')

    const vCardGetUpdatedPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for updated vCard get response')), 10000)
      const onElement = (element: any) => {
        if (element.name !== 'iq' || element.attrs.type !== 'result') {
          return
        }
        clearTimeout(timeout)
        streamToNode2.off('element', onElement)
        resolve(element)
      }

      streamToNode2.on('element', onElement)
    })

    streamToNode2.send(
      `<iq to='${libp2p2.peerId.toString()}@p2p' from='${libp2p1.peerId.toString()}@p2p' type='get' id='vcard-3'><vCard xmlns='vcard-temp'/></iq>`
    )

    const vCardGetUpdatedResponse = await vCardGetUpdatedPromise
    const vCardGetUpdated = vCardGetUpdatedResponse.getChild('vCard')
    const vCardGetUpdatedFn = vCardGetUpdated?.getChild('FN')?.text()
    const vCardGetUpdatedNickname = vCardGetUpdated?.getChild('NICKNAME')?.text()
    const vCardGetUpdatedPhotoType = vCardGetUpdated?.getChild('PHOTO')?.getChild('TYPE')?.text()
    const vCardGetUpdatedPhotoBinval = vCardGetUpdated?.getChild('PHOTO')?.getChild('BINVAL')?.text()
    if (vCardGetUpdatedFn !== 'Bob Relay' || vCardGetUpdatedNickname !== 'Bobby' || vCardGetUpdatedPhotoType !== 'image/png' || vCardGetUpdatedPhotoBinval !== updatedAvatar) {
      throw new Error(`Unexpected updated vCard payload: FN=${vCardGetUpdatedFn ?? 'missing'} NICKNAME=${vCardGetUpdatedNickname ?? 'missing'} PHOTO.TYPE=${vCardGetUpdatedPhotoType ?? 'missing'} PHOTO.BINVAL=${vCardGetUpdatedPhotoBinval ?? 'missing'}`)
    }

    console.log('\nProtocol Test Results:')
    console.log('  - Unsupported IQ Returned XMPP Error: SUCCESS')
    console.log('  - Malformed IQ Returned Bad Request: SUCCESS')
    console.log('  - Malformed Presence Returned Bad Request: SUCCESS')
    console.log('  - Non-SHA-1 Caps Still Triggered Discovery: SUCCESS')
    console.log('  - Presence Nickname Propagated: SUCCESS')
    console.log('  - Chat Message Nickname Propagated: SUCCESS')
    console.log('  - vCard Get Returned Profile Data: SUCCESS')
    console.log('  - vCard Set Updated Profile Data: SUCCESS')
    console.log('\n>>> RELAY-COMPATIBILITY PROTOCOL VERIFICATION SUCCESSFUL! <<<')
    return
  } finally {
    await xmppNode1?.close().catch(() => {})
    await xmppNode2?.close().catch(() => {})
    await libp2p1?.stop().catch(() => {})
    await libp2p2?.stop().catch(() => {})
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

runProtocolTest().catch((err) => {
  console.error('Protocol test error:', err)
  process.exit(1)
})
