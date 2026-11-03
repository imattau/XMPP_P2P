import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  runtime: null as any,
  addContact: vi.fn(),
}))

vi.mock('../bridge/runtime', () => ({
  useBrowserXmppBridge: () => mocks.runtime,
}))

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../bridge/useRosterBridge', () => ({
  useRosterBridge: () => ({
    contacts: [],
    serverSubscriptionRequests: [],
    answerServerSubscriptionRequest: vi.fn(),
    loading: false,
    loadError: '',
    available: true,
    refresh: vi.fn(),
    addContact: mocks.addContact,
    removeContact: vi.fn(),
  }),
}))

import ContactsPage from '../pages/ContactsPage'

describe('discovered contacts', () => {
  beforeEach(() => {
    mocks.addContact.mockReset().mockResolvedValue(undefined)
    mocks.runtime = {
      getConnectedPeers: () => ['peer-123'],
      onConnectionChange: () => () => undefined,
      onPresence: () => () => undefined,
    }
  })

  it('shows connected peers separately and adds one to saved contacts on request', async () => {
    render(<ContactsPage />)

    expect(screen.getByRole('heading', { name: 'Available on P2P · 1' })).toBeVisible()
    expect(screen.getByText('Connected peers you haven’t added to your contacts.')).toBeVisible()
    expect(screen.getByText('peer-123@p2p')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Add peer-123 to contacts' }))

    await waitFor(() => expect(mocks.addContact).toHaveBeenCalledWith('peer-123@p2p', 'peer-123'))
  })
})
