import { useEffect, useState } from 'react'
import { getBrowserXmppBridge } from './runtime'

export interface RosterContact {
  jid: string
  name?: string
  nickname?: string
  online: boolean
}

export function useRosterBridge() {
  const [contacts, setContacts] = useState<RosterContact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const runtime = getBrowserXmppBridge()
    if (!runtime) {
      setLoading(false)
      return
    }

    const fetchRoster = async () => {
      try {
        const entries = await runtime.getRosterEntries()
        setContacts(entries.map((e: any) => ({
          jid: e.jid,
          name: e.name,
          nickname: e.nickname,
          online: false
        })))
      } catch {
        setContacts([])
      } finally {
        setLoading(false)
      }
    }

    void fetchRoster()

    const unsubPresence = runtime.onPresence?.((presence: any) => {
      const isAvailable = presence.type !== 'unavailable'
      const presenceJid = presence.from.includes('@') ? presence.from : `${presence.from}@p2p`
      setContacts((prev) =>
        prev.map((c) =>
          c.jid === presenceJid
            ? { ...c, online: isAvailable }
            : c
        )
      )
    })

    return () => {
      if (unsubPresence) unsubPresence()
    }
  }, [])

  const onlinePeers = new Set(contacts.filter((c) => c.online).map((c) => c.jid))

  return { contacts, onlinePeers, loading }
}
