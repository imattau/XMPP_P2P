import readline from 'readline'
import { XmppNode } from './xmpp-node.js'

export type Libp2pNode = {
  peerId: { toString(): string }
  getMultiaddrs(): Array<{ toString(): string }>
  addEventListener(event: string, listener: (evt: any) => void): void
  getConnections(peerId?: any): any[]
  start(): Promise<void>
  stop(): Promise<void>
}

export type CliContext = {
  libp2p: Libp2pNode
  xmppNode: XmppNode
  discoveredPeers: Map<string, string[]>
  rl: readline.Interface
  showPrompt: () => void
  resolvePeerTarget: (target: string) => string
}

