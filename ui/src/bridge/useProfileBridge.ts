import { useCallback, useEffect, useState } from 'react'
import { getBrowserXmppBridge } from './runtime'

export interface EditableVCard {
  fn: string
  nickname: string
  photo?: { type: string; binval: string } | null
}

export function useProfileBridge() {
  const [vCard, setVCard] = useState<EditableVCard | null>(null)
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
      setVCard({
        fn: profile.fn ?? '',
        nickname: profile.nickname ?? '',
        photo: profile.photo ?? null
      })
    } catch {
      setVCard(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async (updated: EditableVCard): Promise<boolean> => {
    const runtime = getBrowserXmppBridge()
    if (!runtime) return false
    setSaving(true)
    try {
      const result = await runtime.setVCard({
        fn: updated.fn || undefined,
        nickname: updated.nickname || undefined,
        photo: updated.photo ?? undefined
      })
      setVCard({
        fn: result.fn ?? '',
        nickname: result.nickname ?? '',
        photo: result.photo ?? null
      })
      return true
    } catch {
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  return { vCard, loading, saving, refresh, save }
}
