import { useCallback, useEffect, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'
import { identityController } from './identity/controller'
import { getAccountScopedStorageKey } from '../lib/account-storage'

const VCARD_KEY = 'xmpp-p2p:vcard'
const vCardStorageKey = () => getAccountScopedStorageKey(VCARD_KEY)

export interface EditableVCard {
  fn: string
  nickname: string
  desc?: string
  photo?: { type?: string; binval?: string } | null
}

function loadLocalVCard(): EditableVCard | null {
  try {
    const raw = localStorage.getItem(vCardStorageKey())
    return raw ? (JSON.parse(raw) as EditableVCard) : null
  } catch {
    return null
  }
}

function saveLocalVCard(vcard: EditableVCard): boolean {
  try {
    localStorage.setItem(vCardStorageKey(), JSON.stringify(vcard))
    return true
  } catch {
    return false
  }
}

export function useProfileBridge() {
  const runtime = useBrowserXmppBridge()
  const [vCard, setVCard] = useState<EditableVCard | null>(() => {
    const local = loadLocalVCard()
    if (local) return local
    const identity = identityController.getState().identity
    return identity ? { fn: identity.displayName, nickname: identity.handle, photo: null } : null
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!runtime) {
      setLoading(false)
      return
    }
    try {
      const profile = await runtime.getVCard()
      const vcard: EditableVCard = {
        fn: profile.fn ?? '',
        nickname: profile.nickname ?? '',
        desc: profile.desc ?? '',
        photo: profile.photo ?? null
      }
      setVCard(vcard)
      saveLocalVCard(vcard)
    } catch {
      // Keep the cached profile visible when the peer network is temporarily unavailable.
    } finally {
      setLoading(false)
    }
  }, [runtime])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async (updated: EditableVCard): Promise<boolean> => {
    if (!runtime) {
      if (!saveLocalVCard(updated)) return false
      setVCard(updated)
      if (updated.fn) {
        const state = identityController.getState()
        if (state.identity) {
          identityController.updateDisplayName(updated.fn)
        }
      }
      return true
    }
    setSaving(true)
    try {
      const result = await runtime.setVCard({
        fn: updated.fn || undefined,
        nickname: updated.nickname || undefined,
        desc: updated.desc || undefined,
        photo: updated.photo ?? undefined
      })
      const vcard: EditableVCard = {
        fn: result.fn ?? '',
        nickname: result.nickname ?? '',
        desc: result.desc ?? '',
        photo: result.photo ?? null
      }
      if (vcard.fn) identityController.updateDisplayName(vcard.fn)
      setVCard(vcard)
      saveLocalVCard(vcard)
      const nickname = vcard.fn || identityController.getState().identity?.displayName
      if (nickname) void runtime.broadcastPresence('available', undefined, undefined, nickname).catch(() => {})
      return true
    } catch {
      return false
    } finally {
      setSaving(false)
    }
  }, [runtime])

  return { vCard, loading, saving, refresh, save }
}
