import { describe, it, expect } from 'vitest'
import { FeedBridgeController } from '../bridge/feed/controller'
import type { BridgeFeedPostRecord, XmppRuntimeBridge } from '../bridge/runtime'

describe('FeedBridgeController', () => {
  it('initializes with an empty offline state', () => {
    const controller = new FeedBridgeController()
    const state = controller.getState()
    expect(state.posts).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.activeFilter).toBe('all')
    expect(state.sortBy).toBe('recent')
    expect(state.hasMore).toBe(false)
  })

  it('sets active filter', () => {
    const controller = new FeedBridgeController()
    controller.setActiveFilter('topics')
    expect(controller.getState().activeFilter).toBe('topics')
  })

  it('sets search query', () => {
    const controller = new FeedBridgeController()
    controller.setSearchQuery('test')
    expect(controller.getState().searchQuery).toBe('test')
  })

  it('sets sort order', () => {
    const controller = new FeedBridgeController()
    controller.setSortBy('popular')
    expect(controller.getState().sortBy).toBe('popular')
  })

  it('filters posts by type when no posts are available', () => {
    const controller = new FeedBridgeController()
    controller.setActiveFilter('topics')
    const filtered = controller.getFilteredPosts()
    expect(filtered).toEqual([])
  })

  it('does not simulate a reaction while offline', async () => {
    const controller = new FeedBridgeController()
    expect(await controller.likePost('missing-post')).toBe(false)
  })

  it('keeps the feed unchanged when an offline reaction is attempted', async () => {
    const controller = new FeedBridgeController()
    await controller.likePost('missing-post')
    expect(controller.getState().posts).toEqual([])
  })

  it('does not add a missing post to the visible feed when bookmarking offline', async () => {
    const controller = new FeedBridgeController()
    await controller.bookmarkPost('missing-post')
    expect(controller.getState().posts).toEqual([])
  })

  it('does not simulate a repost while offline', async () => {
    const controller = new FeedBridgeController()
    expect(await controller.repostPost('missing-post')).toBe(false)
  })

  it('sets search open', () => {
    const controller = new FeedBridgeController()
    controller.setSearchOpen(true)
    expect(controller.getState().searchOpen).toBe(true)
  })

  it('handles subscribers', () => {
    const controller = new FeedBridgeController()
    let called = false
    const unsub = controller.subscribe(() => { called = true })
    controller.setActiveFilter('posts')
    expect(called).toBe(true)
    unsub()
  })

  it('shows an incoming XMPP microblog post in the feed', () => {
    let receivePost: ((post: BridgeFeedPostRecord) => void) | undefined
    const runtime = {
      getFeedPosts: async () => [],
      getCollectionPosts: async () => [],
      getAttachments: async () => [],
      onFeedPost: (listener: (post: BridgeFeedPostRecord) => void) => {
        receivePost = listener
        return () => { receivePost = undefined }
      },
      getLocalJid: () => 'alice@example.test',
    } as unknown as XmppRuntimeBridge
    const controller = new FeedBridgeController(runtime)

    receivePost?.({
      id: 'bob@remote.test:remote-post-1',
      topic: 'xmpp-pep:bob@remote.test',
      from: 'bob@remote.test',
      body: 'A post from the XMPP server',
      title: 'Remote microblog',
      author: 'Bob',
      publishedAt: '2026-11-02T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      receivedAt: '2026-11-02T00:00:00.000Z',
    })

    expect(controller.getVisiblePosts()).toContainEqual(expect.objectContaining({
      id: 'bob@remote.test:remote-post-1',
      sourceProtocol: 'xmpp',
      content: 'A post from the XMPP server',
      author: expect.objectContaining({ name: 'Bob', server: 'remote.test' }),
    }))
  })
})
