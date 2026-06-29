/**
 * @packageDocumentation Stream wrapper adapting raw P2P duplex streams to XMPP parser
 * elements and XEP-0198 stream management acknowledgements.
 */

import { Parser, Element, xml } from '@xmpp/xml'
import { EventEmitter } from 'events'
import { pushable, type Pushable } from 'it-pushable'

/**
 * Wraps an active libp2p network stream, parsing raw XML data buffers
 * into XML Elements (stanzas) and managing reliability/resumption state.
 * Emits 'element' events when stanzas are successfully parsed.
 *
 * libp2p streams implement the async-iterable duplex interface:
 *   - `stream.source` is an AsyncIterable<Uint8Array> for inbound data
 *   - `stream.sink`   is an async function(AsyncIterable<Uint8Array>) for outbound data
 *
 * We bridge these to an EventEmitter so the rest of the codebase can use
 * simple event-based stanza handling.
 */
export class XmppStream extends EventEmitter {
  private stream: any
  private parser: Parser
  private isClosed = false
  /** Pushable source that feeds outbound bytes into stream.sink */
  private readonly outbound: Pushable<Uint8Array>
  public readonly remotePeer: string

  // XEP-0198 Stream Management properties
  public smEnabled = false
  public smResumable = false
  public sessionId = Math.random().toString(36).substring(2, 15)
  public inboundStanzaCount = 0
  public outboundStanzaCount = 0
  public unackedQueue: Element[] = []

  /**
   * Creates an XMPP parser wrapper around a libp2p stream.
   *
   * @param stream - The underlying duplex stream from libp2p (source/sink interface).
   * @param remotePeer - String form of the remote peer ID.
   */
  constructor(stream: any, remotePeer: string) {
    super()
    this.stream = stream
    this.remotePeer = remotePeer
    this.parser = new Parser()

    this.parser.on('element', (element: Element) => {
      // Handle XEP-0198 Stream Management elements
      if (element.attrs.xmlns === 'urn:xmpp:sm:3') {
        this.handleSmElement(element)
        return
      }

      if (['message', 'presence', 'iq'].includes(element.name)) {
        this.inboundStanzaCount++
        if (this.smEnabled && this.inboundStanzaCount % 5 === 0) {
          this.send(xml('r', { xmlns: 'urn:xmpp:sm:3' }))
        }
      }

      this.emit('element', element)
    })

    this.parser.on('error', (err: Error) => {
      this.emit('error', err)
    })

    // Create the pushable source for outbound data and wire it into stream.sink.
    this.outbound = pushable<Uint8Array>({ objectMode: false })
    this.stream.sink(this.outbound).catch((err: Error) => {
      if (!this.isClosed) {
        this.emit('error', err)
      }
    })

    // Consume the async-iterable source for inbound data.
    this.readInbound().catch((err: Error) => {
      if (!this.isClosed) {
        this.emit('error', err)
      }
    })

    // Prime the parser with a synthetic root so stanza fragments parse cleanly.
    this.parser.write('<stream:stream>')
  }

  /**
   * Reads inbound bytes from the libp2p stream source as an async iterable
   * and feeds them into the XML parser.
   */
  private async readInbound(): Promise<void> {
    try {
      for await (const chunk of this.stream.source) {
        if (this.isClosed) break
        try {
          const array: Uint8Array = chunk instanceof Uint8Array ? chunk : chunk.subarray()
          const text = new TextDecoder().decode(array)
          console.log(`[DEBUG] Stream received data (peer: ${this.remotePeer}): ${text}`)
          this.parser.write(text)
        } catch (err) {
          this.emit('error', err)
        }
      }
    } finally {
      // The source iterator is exhausted — the remote side closed the stream.
      if (!this.isClosed) {
        this.isClosed = true
        this.outbound.end()
        this.emit('close')
      }
    }
  }

  /**
   * Handles inbound XEP-0198 stream management stanzas.
   *
   * @param element - The parsed SM element to process.
   * @returns Nothing.
   */
  private handleSmElement(element: Element) {
    const name = element.name
    if (name === 'enable') {
      const resume = element.attrs.resume === 'true'
      this.smEnabled = true
      this.smResumable = resume
      this.send(xml('enabled', {
        xmlns: 'urn:xmpp:sm:3',
        id: this.sessionId,
        resume: resume ? 'true' : 'false'
      }))
    } else if (name === 'enabled') {
      this.smEnabled = true
      this.smResumable = element.attrs.resume === 'true'
      if (element.attrs.id) {
        this.sessionId = element.attrs.id
      }
    } else if (name === 'r') {
      this.send(xml('a', {
        xmlns: 'urn:xmpp:sm:3',
        h: String(this.inboundStanzaCount)
      }))
    } else if (name === 'a') {
      const h = Number(element.attrs.h ?? 0)
      if (Number.isFinite(h)) {
        const ackedCount = h
        const keepCount = this.outboundStanzaCount - ackedCount
        if (keepCount >= 0 && keepCount < this.unackedQueue.length) {
          this.unackedQueue = this.unackedQueue.slice(this.unackedQueue.length - keepCount)
        }
      }
    } else if (name === 'resume') {
      const h = Number(element.attrs.h ?? 0)
      this.send(xml('resumed', {
        xmlns: 'urn:xmpp:sm:3',
        previd: this.sessionId,
        h: String(this.inboundStanzaCount)
      }))
      const toResend = this.computeStanzasToResend(h)
      for (const msg of toResend) {
        this.sendRaw(msg.toString())
      }
    } else if (name === 'resumed') {
      const h = Number(element.attrs.h ?? 0)
      const toResend = this.computeStanzasToResend(h)
      for (const msg of toResend) {
        this.sendRaw(msg.toString())
      }
    }
  }

  /**
   * Encodes and pushes raw XML text bytes into the outbound pushable sink.
   *
   * @param text - The XML payload to transmit.
   * @returns Nothing.
   */
  /**
   * Computes which stanzas from the unacked queue need resending
   * based on the remote peer's last acknowledged stanza count (h).
   * Clamps the index to safe bounds to prevent off-by-one errors.
   */
  private computeStanzasToResend(remoteH: number): Element[] {
    if (this.unackedQueue.length === 0) return []
    const sentBeforeQueue = this.outboundStanzaCount - this.unackedQueue.length
    const resendStartIndex = Math.max(0, Math.min(
      remoteH - sentBeforeQueue,
      this.unackedQueue.length - 1
    ))
    return this.unackedQueue.slice(resendStartIndex)
  }

  sendRaw(text: string) {
    if (this.isClosed) return
    try {
      const bytes = new TextEncoder().encode(text)
      this.outbound.push(bytes)
    } catch (err) {
      this.emit('error', err)
    }
  }

  /**
   * Encodes and sends a stanza or raw XML string to the remote peer.
   *
   * @param element - The payload to send.
   * @returns Nothing.
   */
  send(element: Element | string) {
    if (this.isClosed) return
    try {
      let xmlStr: string
      if (element instanceof Element) {
        if (['message', 'presence', 'iq'].includes(element.name)) {
          this.outboundStanzaCount++
          this.unackedQueue.push(element)
        }
        xmlStr = element.toString()
      } else {
        xmlStr = element
      }
      console.log(`[DEBUG] Stream sending data (peer: ${this.remotePeer}): ${xmlStr}`)
      this.sendRaw(xmlStr)

      if (this.smEnabled && this.outboundStanzaCount % 5 === 0) {
        this.sendRaw(xml('r', { xmlns: 'urn:xmpp:sm:3' }).toString())
      }
    } catch (err) {
      this.emit('error', err)
    }
  }

  /**
   * Closes the underlying transport stream and emits `close`.
   *
   * @returns A promise that resolves when shutdown completes.
   */
  async close() {
    if (this.isClosed) return
    this.isClosed = true
    try {
      this.outbound.end()
    } catch {
      // ignore
    }
    try {
      await this.stream.close()
    } catch {
      // ignore
    }
    this.emit('close')
  }
}
