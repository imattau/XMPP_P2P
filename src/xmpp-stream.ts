import { Parser, Element } from '@xmpp/xml'
import { EventEmitter } from 'events'

export class XmppStream extends EventEmitter {
  private stream: any
  private parser: Parser
  private isClosed = false
  public readonly remotePeer: string

  constructor(stream: any, remotePeer: string) {
    super()
    this.stream = stream
    this.remotePeer = remotePeer
    this.parser = new Parser()

    this.parser.on('element', (element: Element) => {
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

  sendRaw(text: string) {
    if (this.isClosed) return
    try {
      const bytes = new TextEncoder().encode(text)
      this.stream.send(bytes)
    } catch (err) {
      this.emit('error', err)
    }
  }

  send(element: Element | string) {
    if (this.isClosed) return
    try {
      const xmlStr = element.toString()
      console.log(`[DEBUG] Stream sending data (peer: ${this.remotePeer}): ${xmlStr}`)
      this.sendRaw(xmlStr)
    } catch (err) {
      this.emit('error', err)
    }
  }

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
