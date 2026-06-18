import { xml, Element } from '@xmpp/xml'
import { normalizeVCardProfile, type XmppVCardProfile } from './xmpp-records.js'

export const VCARD_XMLNS = 'vcard-temp'

export function parseVCard(element: Element): XmppVCardProfile {
  const fnEl = element.getChild('FN')
  const nicknameEl = element.getChild('NICKNAME')

  return normalizeVCardProfile({
    fn: fnEl?.text(),
    nickname: nicknameEl?.text()
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

  return children.length > 0
    ? xml('vCard', { xmlns: VCARD_XMLNS }, ...children)
    : xml('vCard', { xmlns: VCARD_XMLNS })
}
