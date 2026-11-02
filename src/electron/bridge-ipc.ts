/**
 * @packageDocumentation Main-process dispatcher for the renderer IPC bridge.
 *
 * One `BrowserXmppRuntimeBridge` instance owns the native libp2p node. The
 * renderer gets a proxied copy over IPC so there is exactly one peer identity.
 */

import type { BrowserXmppRuntimeBridge } from '../bridge/browser-runtime.js'
import { ALL_METHODS, EVENT_METHODS, IPC, SYNC_METHODS } from './bridge-contract.js'

type BridgeMethod = (...args: any[]) => any

export class IpcBridgeHost {
  private readonly disposers: Array<() => void> = []

  constructor(
    private readonly bridge: BrowserXmppRuntimeBridge,
    private readonly send: (channel: string, ...args: any[]) => void
  ) {}

  /** Subscribes once per event and forwards payloads to the renderer. */
  registerEvents(): void {
    for (const name of EVENT_METHODS) {
      const subscribe = (this.bridge as unknown as Record<string, BridgeMethod | undefined>)[name]
      if (typeof subscribe !== 'function') continue
      const unsubscribe = subscribe.call(this.bridge, (...args: any[]) => {
        this.send(IPC.event, name, args)
      })
      if (typeof unsubscribe === 'function') this.disposers.push(unsubscribe)
    }
  }

  /** Invokes an asynchronous bridge method. */
  async call(method: string, args: unknown[]): Promise<unknown> {
    this.assertCallable(method)
    const fn = (this.bridge as unknown as Record<string, BridgeMethod | undefined>)[method]
    if (typeof fn !== 'function') return undefined
    return await fn.apply(this.bridge, args)
  }

  /** Invokes a getter that the React hooks read synchronously. */
  callSync(method: string, args: unknown[]): unknown {
    if (!(SYNC_METHODS as readonly string[]).includes(method)) {
      throw new Error(`Method is not synchronous: ${method}`)
    }
    const fn = (this.bridge as unknown as Record<string, BridgeMethod | undefined>)[method]
    if (typeof fn !== 'function') return undefined
    return fn.apply(this.bridge, args)
  }

  /** Detaches event forwarding. */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      try { dispose() } catch { /* listener already gone */ }
    }
  }

  private assertCallable(method: string): void {
    if (!ALL_METHODS.has(method)) throw new Error(`Unknown bridge method: ${method}`)
    if (method === 'disconnect' || (EVENT_METHODS as readonly string[]).includes(method)) {
      throw new Error(`Method is handled separately: ${method}`)
    }
  }
}
