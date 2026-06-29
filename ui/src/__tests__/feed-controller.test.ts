import { describe, it, expect } from 'vitest'
import { FeedBridgeController } from '../bridge/feed/controller'

describe('FeedBridgeController', () => {
  it('initializes with seed posts and loading state', () => {
    const controller = new FeedBridgeController()
    const state = controller.getState()
    expect(state.posts.length).toBeGreaterThan(0)
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

  it('filters posts by type', () => {
    const controller = new FeedBridgeController()
    controller.setActiveFilter('topics')
    const filtered = controller.getFilteredPosts()
    expect(filtered.every((p) => p.type === 'topic')).toBe(true)
  })

  it('likes a post', () => {
    const controller = new FeedBridgeController()
    const post = controller.getState().posts.find((p) => !p.liked)!
    const before = post.likes
    controller.likePost(post.id)
    const updated = controller.getState().posts.find((p) => p.id === post.id)!
    expect(updated.likes).toBe(before + 1)
    expect(updated.liked).toBe(true)
  })

  it('unlikes a post', () => {
    const controller = new FeedBridgeController()
    const post = controller.getState().posts.find((p) => !p.liked)!
    controller.likePost(post.id)
    controller.likePost(post.id)
    const updated = controller.getState().posts.find((p) => p.id === post.id)!
    expect(updated.liked).toBe(false)
    expect(updated.likes).toBe(post.likes)
  })

  it('bookmarks a post', () => {
    const controller = new FeedBridgeController()
    const postId = controller.getState().posts[0].id
    controller.bookmarkPost(postId)
    expect(controller.getState().posts[0].bookmarked).toBe(true)
  })

  it('reposts a post', () => {
    const controller = new FeedBridgeController()
    const postId = controller.getState().posts[0].id
    controller.repostPost(postId)
    expect(controller.getState().posts[0].reposted).toBe(true)
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
})
