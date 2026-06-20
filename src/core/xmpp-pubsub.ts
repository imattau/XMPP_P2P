/**
 * @fileoverview PubSub event parsing and dispatch helpers for feed items,
 * collection posts, attachments, encrypted payloads, and upload manifests.
 */

import { Element, Parser } from '@xmpp/xml'
import * as openpgp from 'openpgp'
import { ATOM_XMLNS, ATTACHMENT_XMLNS, HTTP_UPLOAD_XMLNS, PAM_XMLNS, PUBSUB_EVENT_XMLNS } from './xmpp-discovery.js'
import {
  normalizeAttachment,
  normalizeCollectionPost,
  type XmppUploadManifest,
  type XmppUploadProvider,
  type XmppAttachment,
  type XmppCollectionPost,
  type XmppFeedFollower,
  type XmppFeedPost,
  type XmppPubSubMessage
} from './xmpp-records.js'
import { parseMicroblogEntry } from './xmpp-atom.js'

/**
 * Execution context used while processing pubsub event payloads.
 */
export interface XmppPubSubContext {
  localJid: string
  feedTopicForPeer(peerId: string): string
  getEncryptedTopicSecret(topic: string): string | undefined
  removeFollower(feedPeerId: string, followerPeerId: string): Promise<void>
  recordFollower(follower: XmppFeedFollower): Promise<boolean>
  recordAttachment(attachment: XmppAttachment): Promise<boolean>
  recordCollectionPost(post: XmppCollectionPost): Promise<boolean>
  recordFeedPost(post: XmppFeedPost): Promise<boolean>
  recordUploadManifest(manifest: XmppUploadManifest, sourceJid: string): Promise<boolean>
  emitPubSubMessage(message: XmppPubSubMessage): void
  emitError(error: unknown): void
}

/**
 * Parses a microblog post item from a PubSub item element.
 *
 * @param topic - PubSub topic that carried the item.
 * @param itemEl - Item element to parse.
 * @param from - Sender JID or peer reference.
 * @param node - Optional PubSub node name.
 * @returns A normalized feed post or `undefined` when the item is not a post.
 */
export function parseFeedPost(topic: string, itemEl: Element, from: string, node?: string): XmppFeedPost | undefined {
  const entryEl = (itemEl.children as any[]).find(child => child?.name === 'entry' && child?.attrs?.xmlns === ATOM_XMLNS) as Element | undefined
  if (!entryEl) {
    return undefined
  }

  return parseMicroblogEntry(topic, itemEl, from, node)
}

/**
 * Parses a collection post from a PubSub item element.
 *
 * @param topic - PubSub topic that carried the item.
 * @param itemEl - Item element to parse.
 * @param from - Sender JID or peer reference.
 * @returns A normalized collection post or `undefined`.
 */
export function parseCollectionPost(topic: string, itemEl: Element, from: string): XmppCollectionPost | undefined {
  const collectionId = itemEl.attrs.collectionId
  const sourceTopic = itemEl.attrs.sourceTopic
  if (!collectionId || !sourceTopic) {
    return undefined
  }

  const feedPost = parseMicroblogEntry(topic, itemEl, from, sourceTopic)
  if (!feedPost) {
    return undefined
  }

  return {
    ...feedPost,
    collectionId,
    sourceTopic
  }
}

/**
 * Parses noticed/reaction attachment records from a PubSub item element.
 *
 * @param topic - PubSub topic that carried the item.
 * @param itemEl - Item element to parse.
 * @param from - Sender JID or peer reference.
 * @returns A normalized attachment record or `undefined`.
 */
export function parseAttachment(topic: string, itemEl: Element, from: string): XmppAttachment | undefined {
  const targetId = itemEl.attrs.targetId
  if (!targetId) {
    return undefined
  }

  const noticedEl = itemEl.getChild('noticed')
  if (noticedEl && noticedEl.attrs.xmlns === ATTACHMENT_XMLNS) {
    return normalizeAttachment({
      id: itemEl.attrs.id,
      topic,
      targetId,
      from,
      kind: 'noticed',
      value: noticedEl.text() || noticedEl.attrs.value,
      publishedAt: noticedEl.attrs.publishedAt,
      receivedAt: new Date().toISOString()
    })
  }

  const reactionsEl = itemEl.getChild('reactions')
  if (reactionsEl && reactionsEl.attrs.xmlns === ATTACHMENT_XMLNS) {
    const reactionEl = (reactionsEl.children as any[]).find(child => child?.name === 'reaction') as Element | undefined
    const value = reactionEl?.attrs.emoji || reactionEl?.text() || reactionsEl.text()
    return normalizeAttachment({
      id: itemEl.attrs.id,
      topic,
      targetId,
      from,
      kind: 'reaction',
      value,
      publishedAt: reactionEl?.attrs.publishedAt,
      receivedAt: new Date().toISOString()
    })
  }

  return undefined
}

async function parseEncryptedPubSubItem(
  topic: string,
  itemEl: Element,
  from: string,
  getSecret: (topic: string) => string | undefined
): Promise<XmppPubSubMessage | undefined> {
  const encryptedEl = itemEl.getChild('encrypted')
  if (!encryptedEl || encryptedEl.attrs.xmlns !== 'urn:xmpp:openpgp:pubsub:0') {
    return undefined
  }

  const keyId = encryptedEl.attrs.key
  const payload = encryptedEl.text().trim()
  if (!payload) {
    return undefined
  }

  const secret = getSecret(topic)
  if (!secret) {
    return undefined
  }

  const bytes = Buffer.from(payload, 'base64')
  const message = await openpgp.readMessage({ binaryMessage: bytes })
  const decrypted = await openpgp.decrypt({
    message,
    passwords: secret,
    format: 'utf8'
  })
  const body = typeof decrypted.data === 'string' ? decrypted.data : new TextDecoder().decode(decrypted.data as Uint8Array)
  return {
    topic,
    node: itemEl.attrs.node,
    from,
    body,
    itemId: itemEl.attrs.id,
    encrypted: true,
    encryption: 'openpgp',
    keyId
  }
}

/**
 * Parses an upload manifest from a PubSub item element.
 *
 * @param topic - PubSub topic that carried the item.
 * @param itemEl - Item element to parse.
 * @param from - Sender JID or peer reference.
 * @returns A normalized upload manifest or `undefined`.
 */
function parseUploadManifest(
  topic: string,
  itemEl: Element,
  from: string
): XmppUploadManifest | undefined {
  const uploadEl = itemEl.getChild('upload')
  if (!uploadEl || uploadEl.attrs.xmlns !== HTTP_UPLOAD_XMLNS) {
    return undefined
  }

  const cid = uploadEl.attrs.cid || itemEl.attrs.cid
  const getUrl = uploadEl.attrs.url || uploadEl.attrs.getUrl
  if (!cid || !getUrl) {
    return undefined
  }

  const providersEl = uploadEl.getChild('providers')
  const providerEls = (providersEl?.children as any[] ?? []).filter(child => child?.name === 'provider') as Element[]
  const providers: XmppUploadProvider[] = []
  for (const providerEl of providerEls) {
    const url = providerEl.attrs.url
    if (!url) {
      continue
    }
    providers.push({
      url,
      jid: providerEl.attrs.jid
    })
  }

  if (!providers.some(provider => provider.url === getUrl)) {
    providers.unshift({
      url: getUrl,
      jid: uploadEl.attrs.from || itemEl.attrs.from || from
    })
  }

  const size = Number(uploadEl.attrs.size ?? itemEl.attrs.size)
  return {
    cid,
    slotId: uploadEl.attrs.slotId || itemEl.attrs.slotId,
    filename: uploadEl.attrs.filename || itemEl.attrs.filename,
    contentType: uploadEl.attrs.contentType || uploadEl.attrs['content-type'] || itemEl.attrs.contentType,
    size: Number.isFinite(size) ? size : undefined,
    getUrl,
    providers,
    uploadedAt: uploadEl.attrs.uploadedAt || itemEl.attrs.uploadedAt || new Date().toISOString(),
    from,
    topic
  }
}

/**
 * Routes a PubSub event message to the correct local handler.
 *
 * @param topic - The pubsub topic the message arrived on.
 * @param element - Incoming `<message/>` stanza.
 * @param ctx - PubSub execution context.
 * @returns Nothing.
 */
export async function handlePubSubMessageElement(topic: string, element: Element, ctx: XmppPubSubContext): Promise<void> {
  const eventEl = element.getChild('event')
  if (!eventEl || eventEl.attrs.xmlns !== PUBSUB_EVENT_XMLNS) {
    return
  }

  const itemsEl = eventEl.getChild('items')
  const nodeName = itemsEl?.attrs.node
  const itemEls = (itemsEl?.children as any[] ?? []).filter(child => child?.name === 'item') as Element[]
  for (const itemEl of itemEls) {
    const subscriptionEl = itemEl.getChild('subscription')
    if (subscriptionEl && subscriptionEl.attrs.xmlns === PAM_XMLNS) {
      const followerPeerId = itemEl.attrs.followerPeerId
      const feedPeerId = itemEl.attrs.feedPeerId
      const visibility = itemEl.attrs.visibility === 'public' ? 'public' : 'private'
      const action = itemEl.attrs.action === 'remove' ? 'remove' : 'upsert'
      const followerJid = itemEl.attrs.followerJid || element.attrs.from || 'unknown'
      if (feedPeerId && followerPeerId) {
        if (action === 'remove') {
          void ctx.removeFollower(feedPeerId, followerPeerId).catch(err => ctx.emitError(err))
        } else {
          void ctx.recordFollower({
            followerPeerId,
            followerJid,
            feedPeerId,
            feedTopic: ctx.feedTopicForPeer(feedPeerId),
            visibility,
            subscribedAt: itemEl.attrs.subscribedAt || new Date().toISOString(),
            updatedAt: itemEl.attrs.updatedAt || new Date().toISOString()
          }).catch(err => ctx.emitError(err))
        }
      }
      continue
    }

    const attachment = parseAttachment(topic, itemEl, element.attrs.from || 'unknown')
    if (attachment) {
      void ctx.recordAttachment(attachment).catch(err => ctx.emitError(err))
      continue
    }

    const uploadManifest = parseUploadManifest(topic, itemEl, element.attrs.from || 'unknown')
    if (uploadManifest) {
      void ctx.recordUploadManifest(uploadManifest, element.attrs.from || 'unknown').catch(err => ctx.emitError(err))
      continue
    }

    const encrypted = await parseEncryptedPubSubItem(topic, itemEl, element.attrs.from || 'unknown', ctx.getEncryptedTopicSecret)
    if (encrypted) {
      ctx.emitPubSubMessage(encrypted)
      continue
    }

    const bodyEl = itemEl.getChild('body')
    if (bodyEl) {
      ctx.emitPubSubMessage({
        topic,
        node: nodeName,
        from: element.attrs.from || 'unknown',
        body: bodyEl.text(),
        itemId: itemEl.attrs.id
      })
    }

    const collectionPost = parseCollectionPost(topic, itemEl, element.attrs.from || 'unknown')
    if (collectionPost) {
      void ctx.recordCollectionPost(collectionPost).catch(err => ctx.emitError(err))
      continue
    }

    const feedPost = parseFeedPost(topic, itemEl, element.attrs.from || 'unknown', nodeName)
    if (feedPost) {
      void ctx.recordFeedPost(feedPost).catch(err => ctx.emitError(err))
    }
  }
}

export async function handlePubSubPayload(topic: string, xmlStr: string, ctx: XmppPubSubContext): Promise<void> {
  try {
    const p = new Parser()
    p.write('<stream:stream>')
    p.on('element', (element: Element) => {
      if (element.name !== 'message') {
        return
      }

      void handlePubSubMessageElement(topic, element, ctx).catch(err => ctx.emitError(err))
    })
    p.write(xmlStr)
  } catch {
    // ignore parsing error for malformed pubsub elements
  }
}
