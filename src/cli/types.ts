/**
 * @fileoverview Type definitions for the CLI terminal layer,
 * describing libp2p nodes and the shared interactive CLI execution context.
 */

import readline from 'readline'
import { XmppNode } from '../core/xmpp-node.js'

/**
 * Representation of the subset of a libp2p Node's API needed by the CLI.
 */
export type Libp2pNode = {
  peerId: { toString(): string }
  getMultiaddrs(): Array<{ toString(): string }>
  addEventListener(event: string, listener: (evt: any) => void): void
  getConnections(peerId?: any): any[]
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Execution context passed to CLI command handlers, maintaining
 * terminal UI state, network instances, and helper routing methods.
 */
export type CliContext = {
  libp2p: Libp2pNode
  xmppNode: XmppNode
  discoveredPeers: Map<string, string[]>
  rl: readline.Interface
  showPrompt: () => void
  resolvePeerTarget: (target: string) => string
}

