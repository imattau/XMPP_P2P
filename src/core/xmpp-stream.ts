/**
 * @fileoverview Stream wrapper adapting raw P2P duplex streams to XMPP parser elements.
 * Provides parsing of XML buffers into stanzas, and implements basic support for
 * XEP-0198: Stream Management for reliability and session resumption.
 */

import { Parser, Element, xml } from '@xmpp/xml'
import { EventEmitter } from 'events'

/**
 * Wraps an active libp2p network stream, parsing raw XML data buffers
 * into XML Elements (stanzas) and managing reliability/resumption state.
 * Emits 'element' events when stanzas are successfully parsed.
 */
export class XmppStream extends EventEmitter {
  private stream: any
  private parser: Parser
  private isClosed = false
  public readonly remotePeer: string

  // XEP-0198 Stream Management properties
  public smEnabled = false
  public smResumable = false
  public sessionId = Math.random().toString(36).substring(2, 15)
  public inboundStanzaCount = 0
  public outboundStanzaCount = 0
  public unackedQueue: Element[] = []

  /**
   * Creates an instance of XmppStream.
   * 
   * @param stream - The underlying libp2p duplex stream.
   * @param remotePeer - The peer ID string of the remote connection.
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

    // Listen to incoming data directly using the stream's onData callback
    this.stream.onData = (data: any) => {
      if (this.isClosed) return
      try {
        const array = data instanceof Uint8Array ? data : data.subarray()
        const text = new TextDecoder().decode(array)
        console.log(`[DEBUG] Stream received data (peer: ${this.remotePeer}): ${text}`)
        this.parser.write(text)
      } catch (err) {
        this.emit('error', err)
      }
    }

    // Initialize the local XMPP parser stream wrapper so stanzas are parsed as children
    this.parser.write('<stream:stream>')
  }

  /**
   * Processes incoming XEP-0198 Stream Management elements (enable, enabled, r, a, resume, resumed)
   * to maintain stanza acknowledgment state and handle connection resumption.
   * 
   * @param element - The parsed XML element representing the stream management action.
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
      const prevId = element.attrs.previd
      const h = Number(element.attrs.h ?? 0)
      this.send(xml('resumed', {
        xmlns: 'urn:xmpp:sm:3',
        previd: this.sessionId,
        h: String(this.inboundStanzaCount)
      }))
      const sentBeforeQueue = this.outboundStanzaCount - this.unackedQueue.length
      const resendStartIndex = h - sentBeforeQueue
      if (resendStartIndex >= 0 && resendStartIndex < this.unackedQueue.length) {
        const toResend = this.unackedQueue.slice(resendStartIndex)
        for (const msg of toResend) {
          this.sendRaw(msg.toString())
        }
      }
    } else if (name === 'resumed') {
      const h = Number(element.attrs.h ?? 0)
      const sentBeforeQueue = this.outboundStanzaCount - this.unackedQueue.length
      const resendStartIndex = h - sentBeforeQueue
      if (resendStartIndex >= 0 && resendStartIndex < this.unackedQueue.length) {
        const toResend = this.unackedQueue.slice(resendStartIndex)
        for (const msg of toResend) {
          this.sendRaw(msg.toString())
        }
      }
    }
  }

  /**
   * Converts a raw string to bytes and transmits it directly over the stream.
   * 
   * @param text - The raw XML or metadata text string to send.
   */
  sendRaw(text: string) {
    if (this.isClosed) return
    try {
      const bytes = new TextEncoder().encode(text)
      this.stream.send(bytes)
    } catch (err) {
      this.emit('error', err)
    }
  }

  /**
   * Encodes and sends an XML Element stanza or raw text over the connection.
   * Also updates Stream Management state (outbound counts, unacked queue) if it is a standard stanza.
   * 
   * @param element - The element to send.
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
   * Closes the raw stream and triggers clean up, emitting the 'close' event.
   * 
   * @returns A promise resolving when the stream is completely closed.
   */
  async close() {
    if (this.isClosed) return
    this.isClosed = true
    try {
      this.stream.onData = undefined
      await this.stream.close()
    } catch (e) {
      // ignore
    }
    this.emit('close')
  }
}
