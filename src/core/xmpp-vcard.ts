import { xml, Element } from '@xmpp/xml'
import { normalizeVCardProfile, type XmppVCardProfile } from './xmpp-records.js'

export const VCARD_XMLNS = 'vcard-temp'

export function parseVCard(element: Element): XmppVCardProfile {
  const fnEl = element.getChild('FN')
  const nicknameEl = element.getChild('NICKNAME')
  const photoEl = element.getChild('PHOTO')
  const photoTypeEl = photoEl?.getChild('TYPE')
  const photoBinvalEl = photoEl?.getChild('BINVAL')

  return normalizeVCardProfile({
    fn: fnEl?.text(),
    nickname: nicknameEl?.text(),
    photo: photoTypeEl && photoBinvalEl
      ? {
          type: photoTypeEl.text(),
          binval: photoBinvalEl.text()
        }
      : undefined
  })
}

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
