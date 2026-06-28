import { describe, it, expect, beforeEach } from 'vitest'
import { ArticleBridgeController, getReadTime, createNewArticle } from '../bridge/article/controller'

describe('ArticleBridgeController', () => {
  let controller: ArticleBridgeController

  beforeEach(() => {
    localStorage.clear()
    controller = new ArticleBridgeController()
  })

  it('initializes with seed articles', () => {
    const state = controller.getState()
    expect(state.articles.length).toBeGreaterThan(0)
    expect(state.drafts).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.activeTopic).toBeNull()
  })

  it('gets published articles', () => {
    const articles = controller.getArticles()
    expect(articles.every((a) => a.status === 'published')).toBe(true)
  })

  it('gets a single article by id', () => {
    const articles = controller.getArticles()
    const found = controller.getArticle(articles[0].id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(articles[0].id)
  })

  it('returns undefined for unknown id', () => {
    expect(controller.getArticle('nonexistent')).toBeUndefined()
  })

  it('filters articles by topic', () => {
    const xmppArticles = controller.getTopicArticles('XMPP')
    expect(xmppArticles.every((a) => a.topic === 'XMPP')).toBe(true)
  })

  it('returns featured articles', () => {
    const featured = controller.getFeaturedArticles()
    expect(featured.length).toBeLessThanOrEqual(2)
  })

  it('returns latest articles sorted by date', () => {
    const latest = controller.getLatestArticles()
    for (let i = 1; i < latest.length; i++) {
      const prev = new Date(latest[i - 1].publishedAt ?? latest[i - 1].createdAt).getTime()
      const curr = new Date(latest[i].publishedAt ?? latest[i].createdAt).getTime()
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
  })

  it('saves and retrieves drafts', () => {
    const draft = createNewArticle({ title: 'Test Draft', topic: 'XMPP' })
    controller.saveDraft(draft)

    const state = controller.getState()
    expect(state.drafts.length).toBe(1)
    expect(state.drafts[0].title).toBe('Test Draft')
  })

  it('updates existing draft on second save', () => {
    const draft = createNewArticle({ title: 'Draft 1' })
    controller.saveDraft(draft)

    const updated = { ...draft, title: 'Draft 1 Updated' }
    controller.saveDraft(updated)

    const state = controller.getState()
    expect(state.drafts.length).toBe(1)
    expect(state.drafts[0].title).toBe('Draft 1 Updated')
  })

  it('deletes a draft', () => {
    const draft = createNewArticle({ title: 'Delete Me' })
    controller.saveDraft(draft)
    expect(controller.getState().drafts.length).toBe(1)

    controller.deleteDraft(draft.id)
    expect(controller.getState().drafts.length).toBe(0)
  })

  it('publishes a draft', async () => {
    const draft = createNewArticle({ title: 'Publish Me', topic: 'XMPP' })
    controller.saveDraft(draft)

    const publishedId = await controller.publishArticle(draft)
    expect(publishedId).toBe(draft.id)

    const state = controller.getState()
    expect(state.drafts.length).toBe(0)
    const published = state.articles.find((a) => a.id === draft.id)
    expect(published).toBeDefined()
    expect(published!.status).toBe('published')
    expect(published!.publishedAt).toBeDefined()
  })

  it('toggles bookmark on an article', () => {
    const articleId = controller.getArticles()[0].id
    expect(controller.getState().bookmarkedIds).not.toContain(articleId)

    controller.toggleBookmark(articleId)
    expect(controller.getState().bookmarkedIds).toContain(articleId)
    const article = controller.getState().articles.find((a) => a.id === articleId)
    expect(article?.bookmarked).toBe(true)

    controller.toggleBookmark(articleId)
    expect(controller.getState().bookmarkedIds).not.toContain(articleId)
  })

  it('sets active topic filter', () => {
    controller.setActiveTopic('XMPP')
    expect(controller.getState().activeTopic).toBe('XMPP')

    controller.setActiveTopic(null)
    expect(controller.getState().activeTopic).toBeNull()
  })

  it('subscribes and emits updates', () => {
    let called = false
    const unsub = controller.subscribe(() => { called = true })
    controller.setActiveTopic('PRIVACY')
    expect(called).toBe(true)
    unsub()
  })
})

describe('getReadTime', () => {
  it('calculates read time for short content', () => {
    const blocks = [
      { id: '1', type: 'paragraph' as const, content: 'Hello world' },
    ]
    expect(getReadTime(blocks)).toBe('1 min read')
  })

  it('calculates read time for longer content', () => {
    const blocks = [
      { id: '1', type: 'paragraph' as const, content: Array(100).fill('word').join(' ') },
    ]
    expect(getReadTime(blocks)).toBe('1 min read')
  })

  it('handles list items in word count', () => {
    const blocks = [
      { id: '1', type: 'paragraph' as const, content: 'Some text' },
      { id: '2', type: 'list' as const, content: '', meta: { items: ['item1', 'item2', 'item3'] } },
    ]
    const result = getReadTime(blocks)
    expect(result).toBeTruthy()
    expect(result).toMatch(/^\d+ min read$/)
  })
})

describe('createNewArticle', () => {
  it('creates a default article with two blocks', () => {
    const article = createNewArticle()
    expect(article.id).toBeTruthy()
    expect(article.title).toBe('')
    expect(article.status).toBe('draft')
    expect(article.blocks.length).toBe(2)
    expect(article.blocks[0].type).toBe('heading')
    expect(article.blocks[1].type).toBe('paragraph')
  })

  it('applies overrides', () => {
    const article = createNewArticle({ title: 'Custom Title', topic: 'XMPP' })
    expect(article.title).toBe('Custom Title')
    expect(article.topic).toBe('XMPP')
  })
})
