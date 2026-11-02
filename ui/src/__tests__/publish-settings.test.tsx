import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PublishSettings from '../components/article/PublishSettings'
import { createNewArticle } from '../bridge/article/controller'

describe('PublishSettings', () => {
  it('offers XMPP when connected and sends the selected destination on publish', async () => {
    const onPublish = vi.fn(async () => undefined)
    render(
      <PublishSettings
        article={createNewArticle({ title: 'An article', topic: 'XMPP' })}
        serverConnected
        onUpdate={vi.fn()}
        onPublish={onPublish}
        onSaveDraft={vi.fn()}
        onBack={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /XMPP microblog/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish to XMPP' }))

    await waitFor(() => expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ title: 'An article' }), 'xmpp'))
  })

  it('keeps XMPP unavailable until an account is connected', () => {
    render(
      <PublishSettings
        article={createNewArticle({ title: 'An article', topic: 'XMPP' })}
        serverConnected={false}
        onUpdate={vi.fn()}
        onPublish={vi.fn()}
        onSaveDraft={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /XMPP microblog/ })).toBeDisabled()
    expect(screen.getByText('Connect an XMPP account in Settings to enable')).toBeVisible()
  })
})
