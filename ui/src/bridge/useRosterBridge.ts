import { useCallback, useEffect, useState } from 'react'
import { useBrowserXmppBridge } from './runtime'
import { canonicalDirectChatId } from './direct-chat-history'

export interface RosterContact {
  jid: string
  name?: string
  nickname?: string
  online: boolean
  subscription?: string
}

export function useRosterBridge() {
  const runtime = useBrowserXmppBridge()
  const [contacts, setContacts] = useState<RosterContact[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [serverSubscriptionRequests, setServerSubscriptionRequests] = useState<Array<{ jid: string; server: string }>>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(Boolean(runtime))
    if (!runtime) {
      setContacts([])
      setServerSubscriptionRequests([])
      setLoadError('Peer network is unavailable. Reconnect to load your contacts.')
      return () => { cancelled = true }
    }
    setLoadError('')
    setLoading(true)

    const fetchRoster = async () => {
      try {
        const entries = await runtime.getRosterEntries()
        if (!cancelled) {
          const unique = new Map<string, RosterContact>()
          for (const entry of entries as any[]) {
            const contact = {
              jid: entry.jid,
              name: entry.name,
              nickname: entry.nickname,
              subscription: entry.subscription,
              online: entry.presence?.type === 'available',
            }
            const key = canonicalDirectChatId(contact.jid)
            const existing = unique.get(key)
            unique.set(key, existing ? {
              ...existing,
              ...contact,
              name: contact.name ?? existing.name,
              nickname: contact.nickname ?? existing.nickname,
              online: contact.online || existing.online,
            } : contact)
          }
          setContacts([...unique.values()])
        }
      } catch {
        if (!cancelled) setLoadError('Could not load your contacts. Check your connection and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchRoster()

    const unsubPresence = runtime.onPresence?.((presence: any) => {
      const isAvailable = presence.type !== 'unavailable'
      const from = String(presence.from ?? '').split('/')[0]
      if (!from) return
      const presenceJid = canonicalDirectChatId(from.includes('@') ? from : `${from}@p2p`)
      setContacts((previous) => {
        const existing = previous.some((contact) => canonicalDirectChatId(contact.jid) === presenceJid)
        if (existing) {
          return previous.map((contact) => canonicalDirectChatId(contact.jid) === presenceJid
            ? { ...contact, nickname: presence.nickname ?? contact.nickname, online: isAvailable }
            : contact)
        }
        // Presence can come from peers discovered on the network. Keep the
        // roster list limited to contacts the user explicitly saved.
        return previous
      })
    })
    const unsubServerConnection = runtime.onServerConnection((info) => {
      if (info.status === 'connected' || info.status === 'disconnected' || info.status === 'error') refresh()
    })
    const unsubServerRoster = runtime.onServerRosterChange(refresh)
    const unsubServerPresenceRequest = runtime.onServerPresenceSubscriptionRequest?.((request) => {
      setServerSubscriptionRequests((previous) => previous.some((item) => item.jid === request.jid)
        ? previous
        : [...previous, request])
    })

    return () => {
      cancelled = true
      if (unsubPresence) unsubPresence()
      unsubServerConnection()
      unsubServerRoster()
      unsubServerPresenceRequest?.()
    }
  }, [runtime, refreshVersion, refresh])

  const onlinePeers = new Set(contacts.filter((c) => c.online).map((c) => canonicalDirectChatId(c.jid)))

  const addContact = async (jid: string, name?: string) => {
    if (!runtime?.addRosterEntry) throw new Error('Connect to the peer network before adding a contact')
    const entry = await runtime.addRosterEntry(jid, name)
    const contact = { jid: entry.jid, name: entry.name, nickname: entry.nickname, online: false }
    const contactKey = canonicalDirectChatId(contact.jid)
    setContacts((current) => [contact, ...current.filter((item) => canonicalDirectChatId(item.jid) !== contactKey)])
    setLoadError('')
    return contact
  }

  const removeContact = async (jid: string) => {
    if (!runtime?.removeRosterEntry) throw new Error('Connect to the peer network before removing a contact')
    await runtime.removeRosterEntry(jid)
    const contactKey = canonicalDirectChatId(jid)
    setContacts((current) => current.filter((contact) => canonicalDirectChatId(contact.jid) !== contactKey))
  }

  const answerServerSubscriptionRequest = async (jid: string, approve: boolean) => {
    if (!runtime) throw new Error('Connect an XMPP account to manage server contact requests.')
    if (approve) {
      if (!runtime.approveServerPresenceSubscription) throw new Error('Connect an XMPP account to manage server contact requests.')
      await runtime.approveServerPresenceSubscription(jid)
    } else {
      if (!runtime.denyServerPresenceSubscription) throw new Error('Connect an XMPP account to manage server contact requests.')
      await runtime.denyServerPresenceSubscription(jid)
    }
    setServerSubscriptionRequests((previous) => previous.filter((request) => request.jid !== jid))
    if (approve) refresh()
  }

  return {
    contacts,
    serverSubscriptionRequests,
    onlinePeers,
    loading,
    loadError,
    available: Boolean(runtime),
    serverConnected: runtime?.isServerConnected() ?? false,
    refresh,
    addContact,
    removeContact,
    answerServerSubscriptionRequest,
  }
}
