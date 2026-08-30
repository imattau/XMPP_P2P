import assert from 'node:assert/strict'
import { XmppNode } from '../core/xmpp-node.js'

type BridgeStub = {
  isConnected: boolean
  connectionInfo: { domain: string }
  sendMessage: (to: string, body: string, options: { type: string; thread?: string }) => Promise<string>
}

const callSendMessage = (clientBridge: BridgeStub, to: string, body: string, options: any = {}) =>
  XmppNode.prototype.sendMessage.call({ clientBridge }, to, body, options) as Promise<string>

async function main() {
  const sent: Array<{ to: string; body: string; options: any }> = []
  const bridge: BridgeStub = {
    isConnected: true,
    connectionInfo: { domain: 'home.example' },
    async sendMessage(to, body, options) {
      sent.push({ to, body, options })
      return 'server-message-1'
    }
  }

  const id = await callSendMessage(bridge, 'alice@remote.example', 'Federated hello', { thread: 'thread-1' })
  assert.equal(id, 'server-message-1')
  assert.deepEqual(sent, [{
    to: 'alice@remote.example',
    body: 'Federated hello',
    options: { type: 'chat', thread: 'thread-1' }
  }])

  bridge.isConnected = false
  await assert.rejects(
    callSendMessage(bridge, 'alice@remote.example', 'Unavailable'),
    /Server bridge is not connected/
  )

  console.log('Server bridge federated-domain routing test passed')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
