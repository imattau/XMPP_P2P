/**
 * @fileoverview Helpers for parsing and building XMPP extension elements such
 * as receipts, chat state, delays, replies, stanza ids, and carbons.
 */

import { xml, Element } from '@xmpp/xml'

/**
 * XML namespace constants for the supported XMPP extension payloads.
 */
export const RECEIPTS_XMLNS = 'urn:xmpp:receipts'
export const CHATSTATES_XMLNS = 'urn:xmpp:chatstates'
export const DELAY_XMLNS = 'urn:xmpp:delay'
export const CORRECT_XMLNS = 'urn:xmpp:message-correct:0'
export const REPLY_XMLNS = 'urn:xmpp:reply:0'
export const PING_XMLNS = 'urn:xmpp:ping'
export const NICK_XMLNS = 'http://jabber.org/protocol/nick'
export const SID_XMLNS = 'urn:xmpp:sid:0'

export const CARBONS_XMLNS = 'urn:xmpp:carbons:2'
export const FORWARD_XMLNS = 'urn:xmpp:forward:0'

/**
 * Normalized metadata extracted from XEP extension child elements.
 */
export interface XepMetadata {
  receipt?: { type: 'request' | 'received'; id: string }
  chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
  delay?: { from?: string; stamp: string }
  replace?: string
  reply?: { id: string; to?: string }
  thread?: string
  nick?: string
  originId?: string
  stanzaId?: { id: string; by: string }
  carbon?: { type: 'sent' | 'received'; forwardedMessage: Element }
  private?: boolean
}

/**
 * Extracts XEP extension metadata from a stanza.
 *
 * @param element - The incoming stanza element.
 * @returns Normalized metadata for receipts, replies, chat state, and related extensions.
 */
export function parseXepMetadata(element: Element): XepMetadata {
  const metadata: XepMetadata = {}

  // Parse XEP-0184 Receipts: Request
  const requestEl = element.getChild('request')
  if (requestEl && requestEl.attrs.xmlns === RECEIPTS_XMLNS && element.attrs.id) {
    metadata.receipt = { type: 'request', id: element.attrs.id }
  }

  // Parse XEP-0184 Receipts: Received confirmation
  const receivedEl = element.getChild('received')
  if (receivedEl && receivedEl.attrs.xmlns === RECEIPTS_XMLNS) {
    metadata.receipt = { type: 'received', id: receivedEl.attrs.id }
  }

  // Parse XEP-0085 Chat States
  const chatStateNames = ['active', 'composing', 'paused', 'inactive', 'gone'] as const
  for (const name of chatStateNames) {
    const stateEl = element.getChild(name)
    if (stateEl && stateEl.attrs.xmlns === CHATSTATES_XMLNS) {
      metadata.chatState = name
      break
    }
  }

  // Parse XEP-0203 Delay
  const delayEl = element.getChild('delay')
  if (delayEl && delayEl.attrs.xmlns === DELAY_XMLNS && delayEl.attrs.stamp) {
    metadata.delay = {
      from: delayEl.attrs.from,
      stamp: delayEl.attrs.stamp
    }
  }

  // Parse XEP-0308 Last Message Correction
  const replaceEl = element.getChild('replace')
  if (replaceEl && replaceEl.attrs.xmlns === CORRECT_XMLNS) {
    metadata.replace = replaceEl.attrs.id
  }

  const replyEl = element.getChild('reply')
  if (replyEl && replyEl.attrs.xmlns === REPLY_XMLNS && replyEl.attrs.id) {
    metadata.reply = {
      id: replyEl.attrs.id,
      to: replyEl.attrs.to
    }
  }

  const threadEl = element.getChild('thread')
  const thread = threadEl?.text().trim()
  if (thread) {
    metadata.thread = thread
  }

  const nickEl = element.getChild('nick')
  if (nickEl && nickEl.attrs.xmlns === NICK_XMLNS) {
    const nick = nickEl.text().trim()
    if (nick) {
      metadata.nick = nick
    }
  }

  // Parse XEP-0359 Unique Action Identifiers
  const originIdEl = element.getChild('origin-id')
  if (originIdEl && originIdEl.attrs.xmlns === SID_XMLNS) {
    metadata.originId = originIdEl.attrs.id
  }

  const stanzaIdEl = element.getChild('stanza-id')
  if (stanzaIdEl && stanzaIdEl.attrs.xmlns === SID_XMLNS) {
    metadata.stanzaId = {
      id: stanzaIdEl.attrs.id,
      by: stanzaIdEl.attrs.by
    }
  }

  // Parse XEP-0280 Message Carbons
  const privateEl = element.getChild('private')
  if (privateEl && privateEl.attrs.xmlns === CARBONS_XMLNS) {
    metadata.private = true
  }

  const receivedCarbonEl = element.getChild('received')
  if (receivedCarbonEl && receivedCarbonEl.attrs.xmlns === CARBONS_XMLNS) {
    const forwardedEl = receivedCarbonEl.getChild('forwarded')
    if (forwardedEl && forwardedEl.attrs.xmlns === FORWARD_XMLNS) {
      const forwardedMsg = forwardedEl.getChild('message')
      if (forwardedMsg) {
        metadata.carbon = { type: 'received', forwardedMessage: forwardedMsg }
      }
    }
  }

  const sentCarbonEl = element.getChild('sent')
  if (sentCarbonEl && sentCarbonEl.attrs.xmlns === CARBONS_XMLNS) {
    const forwardedEl = sentCarbonEl.getChild('forwarded')
    if (forwardedEl && forwardedEl.attrs.xmlns === FORWARD_XMLNS) {
      const forwardedMsg = forwardedEl.getChild('message')
      if (forwardedMsg) {
        metadata.carbon = { type: 'sent', forwardedMessage: forwardedMsg }
      }
    }
  }

  return metadata
}

/**
 * Builds XEP extension child elements for an outgoing stanza.
 *
 * @param options - Optional protocol decorations to attach to the stanza.
 * @returns A list of XML elements to append to a message stanza.
 */
export function buildXepElements(options: {
  replace?: string
  reply?: { id: string; to?: string }
  thread?: string
  requestReceipt?: boolean
  chatState?: 'active' | 'composing' | 'paused' | 'inactive' | 'gone'
  delay?: { stamp: string; from?: string }
  nick?: string
  originId?: string
  stanzaId?: { id: string; by: string }
  private?: boolean
}): Element[] {
  const elements: Element[] = []

  if (options.private) {
    elements.push(xml('private', { xmlns: CARBONS_XMLNS }))
  }

  if (options.requestReceipt) {
    elements.push(xml('request', { xmlns: RECEIPTS_XMLNS }))
  }

  if (options.chatState) {
    elements.push(xml(options.chatState, { xmlns: CHATSTATES_XMLNS }))
  }

  if (options.delay) {
    const delayAttrs: Record<string, string> = {
      xmlns: DELAY_XMLNS,
      stamp: options.delay.stamp
    }
    if (options.delay.from) {
      delayAttrs.from = options.delay.from
    }
    elements.push(xml('delay', delayAttrs))
  }

  if (options.replace) {
    elements.push(xml('replace', {
      xmlns: CORRECT_XMLNS,
      id: options.replace
    }))
  }

  if (options.reply) {
    const replyAttrs: Record<string, string> = {
      xmlns: REPLY_XMLNS,
      id: options.reply.id
    }
    if (options.reply.to) {
      replyAttrs.to = options.reply.to
    }
    elements.push(xml('reply', replyAttrs))
  }

  if (options.thread) {
    elements.push(xml('thread', {}, options.thread))
  }

  if (options.nick) {
    elements.push(xml('nick', { xmlns: NICK_XMLNS }, options.nick))
  }

  if (options.originId) {
    elements.push(xml('origin-id', { xmlns: SID_XMLNS, id: options.originId }))
  }

  if (options.stanzaId) {
    elements.push(xml('stanza-id', { xmlns: SID_XMLNS, id: options.stanzaId.id, by: options.stanzaId.by }))
  }

  return elements
}
