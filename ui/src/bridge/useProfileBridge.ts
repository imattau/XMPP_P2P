import { useCallback, useEffect, useState } from 'react'
import { getBrowserXmppBridge } from './runtime'
import { identityController } from './identity/controller'

const VCARD_KEY = 'xmpp-p2p:vcard'

export interface EditableVCard {
  fn: string
  nickname: string
  photo?: { type: string; binval: string } | null
}

function loadLocalVCard(): EditableVCard | null {
  try {
    const raw = localStorage.getItem(VCARD_KEY)
    return raw ? (JSON.parse(raw) as EditableVCard) : null
  } catch {
    return null
  }
}

function saveLocalVCard(vcard: EditableVCard): void {
  try {
    localStorage.setItem(VCARD_KEY, JSON.stringify(vcard))
  } catch {
    // Storage full or unavailable
  }
}

export function useProfileBridge() {
  const [vCard, setVCard] = useState<EditableVCard | null>(() => {
    const local = loadLocalVCard()
    if (local) return local
    const identity = identityController.getState().identity
    return identity ? { fn: identity.displayName, nickname: identity.handle, photo: null } : null
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    const runtime = getBrowserXmppBridge()
    if (!runtime) {
      setLoading(false)
      return
    }
    try {
      const profile = await runtime.getVCard()
      const vcard: EditableVCard = {
        fn: profile.fn ?? '',
        nickname: profile.nickname ?? '',
        photo: profile.photo ?? null
      }
      setVCard(vcard)
      saveLocalVCard(vcard)
    } catch {
      setVCard(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async (updated: EditableVCard): Promise<boolean> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime) {
      setVCard(updated)
      saveLocalVCard(updated)
      if (updated.fn) {
        const state = identityController.getState()
        if (state.identity) {
          identityController.createIdentity(updated.fn, state.identity.handle, state.identity.recoveryPasscode)
        }
      }
      return true
    }
    setSaving(true)
    try {
      const result = await runtime.setVCard({
        fn: updated.fn || undefined,
        nickname: updated.nickname || undefined,
        photo: updated.photo ?? undefined
      })
      const vcard: EditableVCard = {
        fn: result.fn ?? '',
        nickname: result.nickname ?? '',
        photo: result.photo ?? null
      }
      setVCard(vcard)
      saveLocalVCard(vcard)
      return true
    } catch {
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  return { vCard, loading, saving, refresh, save }
}
