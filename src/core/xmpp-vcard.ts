/**
 * @packageDocumentation vCard parsing and serialization helpers for local profile
 * metadata and roster presentation.
 */

import { xml, Element } from '@xmpp/xml'
import { normalizeVCardProfile, type XmppVCardProfile } from './xmpp-records.js'

/**
 * XML namespace for legacy XMPP vCard payloads.
 */
export const VCARD_XMLNS = 'vcard-temp'

/**
 * Parses a vCard stanza into the normalized profile shape used by the runtime.
 *
 * @param element - The incoming `<vCard/>` element.
 * @returns A normalized profile object.
 */
export function parseVCard(element: Element): XmppVCardProfile {
  const fnEl = element.getChild('FN')
  const nicknameEl = element.getChild('NICKNAME')
  const descEl = element.getChild('DESC')
  const photoEl = element.getChild('PHOTO')
  const photoTypeEl = photoEl?.getChild('TYPE')
  const photoBinvalEl = photoEl?.getChild('BINVAL')

  return normalizeVCardProfile({
    fn: fnEl?.text(),
    nickname: nicknameEl?.text(),
    desc: descEl?.text(),
    photo: photoTypeEl && photoBinvalEl
      ? {
          type: photoTypeEl.text(),
          binval: photoBinvalEl.text()
        }
      : undefined
  })
}

/**
 * Builds a vCard stanza from a normalized profile.
 *
 * @param profile - The profile data to serialize.
 * @param fallbackFn - Optional display name to use when FN and nickname are missing.
 * @returns A `<vCard/>` element ready to send over XMPP.
 */
export function buildVCard(profile: XmppVCardProfile, fallbackFn?: string): Element {
  const normalized = normalizeVCardProfile(profile)
  const fn = normalized.fn ?? normalized.nickname ?? fallbackFn?.trim()
  const children: Element[] = []

  if (fn) {
    children.push(xml('FN', {}, fn))
  }

  if (normalized.nickname) {
    children.push(xml('NICKNAME', {}, normalized.nickname))
  }

  if (normalized.desc) {
    children.push(xml('DESC', {}, normalized.desc))
  }

  if (normalized.photo?.type && normalized.photo.binval) {
    children.push(
      xml(
        'PHOTO',
        {},
        xml('TYPE', {}, normalized.photo.type),
        xml('BINVAL', {}, normalized.photo.binval)
      )
    )
  }

  return children.length > 0
    ? xml('vCard', { xmlns: VCARD_XMLNS }, ...children)
    : xml('vCard', { xmlns: VCARD_XMLNS })
}
