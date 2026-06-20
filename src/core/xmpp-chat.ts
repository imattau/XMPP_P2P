/**
 * @fileoverview Chat history management and DHT-backed archive helpers for
 * one-to-one XMPP messages.
 */

import { Libp2p } from 'libp2p'
import { xml, Element } from '@xmpp/xml'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { XmppStorage } from './storage/types.js'
import { XmppMessage } from './xmpp-records.js'
import { readDhtJson, writeDhtJson } from './xmpp-dht.js'
import { loadChatHistoryState, persistChatHistoryState } from './xmpp-persistence.js'
import { buildXepElements, parseXepMetadata } from './xmpp-xep-helpers.js'

/**
 * Maximum number of chat messages retained locally and in the DHT archive.
 */
export const CHAT_HISTORY_LIMIT = 500

/**
 * Dependencies required by the chat manager.
 */
export interface XmppChatContext {
  libp2p: Libp2p
  storage: XmppStorage
  jid: string
  getOrCreateStream(peerAddr: string): Promise<any>
  sendIqRequest(target: string, stanza: Element, timeoutMs?: number): Promise<Element>
  sendIqResult(peerId: string, id: string, payload?: Element | Element[]): Promise<void>
  parsePeerReference(peerAddr: string): { peerId: string }
  jidFromPeerId(peerId: string): string
  emit(event: string, ...args: any[]): boolean
}

/**
 * AES-GCM wrapper used to store chat archives in the DHT.
 */
interface EncryptedDhtPayload {
  iv: string
  tag: string
  ciphertext: string
}

function encryptDhtPayload(plaintext: string, key: Buffer): EncryptedDhtPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  }
}

function decryptDhtPayload(payload: EncryptedDhtPayload, key: Buffer): string {
  const ivBuf = Buffer.from(payload.iv, 'base64')
  const tagBuf = Buffer.from(payload.tag, 'base64')
  const ciphertextBuf = Buffer.from(payload.ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf)
  decipher.setAuthTag(tagBuf)
  return Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]).toString('utf8')
}

/**
 * Stores, reloads, and archives one-to-one chat history.
 */
export class XmppChatManager {
  private readonly ctx: XmppChatContext
  public readonly chatHistory = new Map<string, XmppMessage>()
  private chatHistorySaveQueue = Promise.resolve()

  constructor(ctx: XmppChatContext) {
    this.ctx = ctx
  }

  public async initialize(): Promise<void> {
    await this.loadChatHistory()
  }

  private getLibp2pPrivateKeyBytes(): Uint8Array | undefined {
    const components = (this.ctx.libp2p as any).components?.components
    if (components?.privateKey?.raw instanceof Uint8Array) {
      return components.privateKey.raw
    }
    if ((this.ctx.libp2p.peerId as any).privateKey instanceof Uint8Array) {
      return (this.ctx.libp2p.peerId as any).privateKey
    }
    if (typeof (this.ctx.libp2p.peerId as any).privateKey?.marshal === 'function') {
      return (this.ctx.libp2p.peerId as any).privateKey.marshal()
    }
    return undefined
  }

  private async getDhtEncryptionKey(): Promise<Buffer> {
    const pkBytes = this.getLibp2pPrivateKeyBytes()
    if (pkBytes) {
      return createHash('sha256').update(pkBytes).digest()
    }

    const namespace = 'security'
    const keyName = 'dht_storage_key'
    let raw = await this.ctx.storage.getRecord(namespace, keyName)
    if (!raw) {
      const newKey = randomBytes(32).toString('base64')
      await this.ctx.storage.putRecord(namespace, keyName, newKey, new Date().toISOString())
      raw = newKey
    }
    return Buffer.from(raw, 'base64')
  }

  private async loadChatHistory(): Promise<void> {
    await loadChatHistoryState({
      storage: this.ctx.storage,
      chatHistory: this.chatHistory
    } as any, CHAT_HISTORY_LIMIT)

    try {
      const dhtKey = new TextEncoder().encode(`/xmpp/archive/chats/${this.ctx.libp2p.peerId.toString()}`)
      const dhtData = await readDhtJson<any>(this.ctx.libp2p, dhtKey)
      if (dhtData) {
        let chatData: { version: number; messages: XmppMessage[] } | undefined = undefined

        if (dhtData.ciphertext && dhtData.iv && dhtData.tag) {
          try {
            const key = await this.getDhtEncryptionKey()
            const decryptedJson = decryptDhtPayload(dhtData, key)
            chatData = JSON.parse(decryptedJson)
          } catch (decErr) {
            console.error('[XMPP] Failed to decrypt DHT chat history record:', decErr)
          }
        } else if (Array.isArray(dhtData.messages)) {
          chatData = dhtData
        }

        if (chatData && Array.isArray(chatData.messages)) {
          for (const msg of chatData.messages) {
            if (!this.chatHistory.has(msg.id || '')) {
              this.chatHistory.set(msg.id || Math.random().toString(36).substring(2, 15), msg)
            }
          }
          while (this.chatHistory.size > CHAT_HISTORY_LIMIT) {
            const oldestKey = this.chatHistory.keys().next().value
            if (oldestKey == null) break
            this.chatHistory.delete(oldestKey)
          }
        }
      }
    } catch (err) {
      console.warn('[XMPP] Failed to load chat history from DHT:', err)
    }
  }

  public async recordChatMessage(msg: XmppMessage): Promise<void> {
    const key = msg.id || Math.random().toString(36).substring(2, 15)
    this.chatHistory.set(key, msg)
    while (this.chatHistory.size > CHAT_HISTORY_LIMIT) {
      const oldestKey = this.chatHistory.keys().next().value
      if (oldestKey == null) break
      this.chatHistory.delete(oldestKey)
    }

    this.chatHistorySaveQueue = this.chatHistorySaveQueue.then(async () => {
      await persistChatHistoryState({
        storage: this.ctx.storage,
        chatHistory: this.chatHistory
      } as any)
      await this.persistChatHistoryToDht()
    })
  }

  private async persistChatHistoryToDht(): Promise<void> {
    try {
      const historyList = Array.from(this.chatHistory.values())
      const key = new TextEncoder().encode(`/xmpp/archive/chats/${this.ctx.libp2p.peerId.toString()}`)
      
      const plaintext = JSON.stringify({
        version: 1,
        messages: historyList
      })

      const encKey = await this.getDhtEncryptionKey()
      const encryptedPayload = encryptDhtPayload(plaintext, encKey)

      await writeDhtJson(this.ctx.libp2p, key, encryptedPayload)
    } catch (err) {
      console.warn('[XMPP] Failed to persist chat history to DHT:', err)
    }
  }

  public async handleIncomingMamQuery(element: Element, peerId: string): Promise<void> {
    const query = element.getChild('query')
    if (!query) return

    const queryId = query.attrs.queryid

    let filterWith: string | undefined = undefined
    const xEl = query.getChild('x')
    if (xEl && xEl.attrs.xmlns === 'jabber:x:data') {
      const fields = (xEl.children as any[]).filter(child => child?.name === 'field')
      for (const f of fields) {
        if (f.attrs.var === 'with') {
          filterWith = f.getChild('value')?.text()
        }
      }
    }

    let history = Array.from(this.chatHistory.values())
    if (filterWith) {
      const bareFilterWith = filterWith.split('/')[0]
      history = history.filter(msg => {
        const fromBare = msg.from.split('/')[0]
        const toBare = msg.to.split('/')[0]
        return fromBare === bareFilterWith || toBare === bareFilterWith
      })
    }

    for (const msg of history) {
      const children: Element[] = []
      if (msg.body) {
        children.push(xml('body', {}, msg.body))
      }

      children.push(...buildXepElements({
        replace: msg.replace,
        reply: msg.reply,
        thread: msg.thread,
        private: msg.private,
        originId: msg.originId,
        stanzaId: msg.stanzaId
      }))

      const msgEl = xml('message', {
        to: msg.to,
        from: msg.from,
        type: msg.type || 'chat',
        id: msg.id ?? ''
      }, ...children)

      const resultEl = xml('result', {
        xmlns: 'urn:xmpp:mam:2',
        queryid: queryId,
        id: msg.id ?? ''
      }, xml('forwarded', { xmlns: 'urn:xmpp:forward:0' },
        xml('delay', { xmlns: 'urn:xmpp:delay', stamp: msg.delay?.stamp || new Date().toISOString() }),
        msgEl
      ))

      const wrapperMsg = xml('message', {
        to: `${peerId}@p2p`,
        from: this.ctx.jid
      }, resultEl)

      const stream = await this.ctx.getOrCreateStream(`${peerId}@p2p`)
      stream.send(wrapperMsg)
    }

    const finEl = xml('fin', { xmlns: 'urn:xmpp:mam:2', complete: 'true' },
      xml('count', {}, String(history.length))
    )
    await this.ctx.sendIqResult(peerId, element.attrs.id, finEl)
  }

  public async handleIncomingMamResult(element: Element, peerId: string): Promise<void> {
    const resultEl = element.getChild('result')
    if (!resultEl) return

    const queryId = resultEl.attrs.queryid
    const forwardedEl = resultEl.getChild('forwarded')
    const delayEl = forwardedEl?.getChild('delay')
    const delayStamp = delayEl?.attrs.stamp
    const innerMsg = forwardedEl?.getChild('message')

    if (innerMsg) {
      const fromVal = innerMsg.attrs.from || ''
      const toVal = innerMsg.attrs.to || ''
      const body = innerMsg.getChild('body')?.text() || ''
      const msgId = innerMsg.attrs.id || resultEl.attrs.id

      const metadata = parseXepMetadata(innerMsg)

      const msg: XmppMessage = {
        from: fromVal,
        to: toVal,
        body,
        id: msgId,
        type: innerMsg.attrs.type || 'chat',
        delay: delayStamp ? { stamp: delayStamp, from: delayEl?.attrs.from } : undefined,
        ...metadata
      }

      await this.recordChatMessage(msg)

      this.ctx.emit('message', {
        ...msg,
        mam: true,
        queryId
      })
    }
  }

  public async queryChatHistory(targetPeerJid: string, withJid?: string, queryId?: string): Promise<string> {
    const id = Math.random().toString(36).substring(2, 11)
    const toJid = this.ctx.jidFromPeerId(this.ctx.parsePeerReference(targetPeerJid).peerId)

    const children: Element[] = []
    if (withJid) {
      children.push(
        xml('x', { xmlns: 'jabber:x:data', type: 'submit' },
          xml('field', { var: 'FORM_TYPE', type: 'hidden' }, xml('value', {}, 'urn:xmpp:mam:2')),
          xml('field', { var: 'with' }, xml('value', {}, withJid))
        )
      )
    }

    const iq = xml('iq', { type: 'get', id, to: toJid, from: this.ctx.jid },
      xml('query', { xmlns: 'urn:xmpp:mam:2', ...(queryId ? { queryid: queryId } : {}) }, ...children)
    )
    await this.ctx.sendIqRequest(toJid, iq)
    return id
  }

  public async flushSaveQueue(): Promise<void> {
    await this.chatHistorySaveQueue
  }
}
