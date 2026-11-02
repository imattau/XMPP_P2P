import { describe, it, expect, beforeEach } from 'vitest'
import { ArticleBridgeController, getReadTime, createNewArticle } from '../bridge/article/controller'

describe('ArticleBridgeController', () => {
  let controller: ArticleBridgeController

  beforeEach(() => {
    localStorage.clear()
    controller = new ArticleBridgeController()
  })

  it('initializes with an empty offline article state', () => {
    const state = controller.getState()
    expect(state.articles).toEqual([])
    expect(state.drafts).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.activeTopic).toBeNull()
    expect(state.loadError).toMatch(/Connect to the peer network/)
  })

  it('gets published articles', () => {
    const articles = controller.getArticles()
    expect(articles.every((a) => a.status === 'published')).toBe(true)
  })

  it('gets a single article by id', () => {
    const draft = createNewArticle({ title: 'Draft lookup' })
    controller.saveDraft(draft)
    const found = controller.getArticle(draft.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(draft.id)
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

  it('keeps a draft when publishing without a network runtime', async () => {
    const draft = createNewArticle({ title: 'Publish Me', topic: 'XMPP' })
    controller.saveDraft(draft)

    await expect(controller.publishArticle(draft)).rejects.toThrow(/Connect to the peer network/)
    expect(controller.getState().drafts.map((entry) => entry.id)).toContain(draft.id)
  })

  it('publishes the complete article to the peer feed and removes its draft', async () => {
    const feedPublishes: Array<{ body: string; options: Record<string, unknown> }> = []
    const runtime = {
      getFeedPosts: async () => [],
      publishFeed: async (body: string, options: Record<string, unknown>) => {
        feedPublishes.push({ body, options })
        return String(options.itemId)
      },
      onFeedPost: () => () => {},
    }
    controller = new ArticleBridgeController(runtime as never)
    const draft = createNewArticle({
      id: 'article-publish-check',
      title: 'A complete article',
      topic: 'P2P',
      blocks: [
        { id: 'heading-1', type: 'heading', content: 'Why this matters' },
        { id: 'paragraph-1', type: 'paragraph', content: 'Published body text.' },
      ],
    })
    controller.saveDraft(draft)

    const publishedId = await controller.publishArticle(draft)

    expect(publishedId).toBe(draft.id)
    expect(feedPublishes).toHaveLength(1)
    expect(feedPublishes[0].body).toContain('nexus-article:v1')
    expect(feedPublishes[0].body).toContain('Published body text.')
    expect(feedPublishes[0].options).toMatchObject({ itemId: draft.id, title: draft.title, categories: ['P2P'] })
    expect(controller.getState().drafts).toEqual([])
    expect(controller.getArticle(draft.id)).toMatchObject({ status: 'published', title: draft.title })
  })

  it('publishes an encoded article to the connected XMPP microblog and removes its draft after acknowledgement', async () => {
    const serverPublishes: Array<{ body: string; options: Record<string, unknown> }> = []
    let onFeedPost: ((record: any) => void) | undefined
    const runtime = {
      getFeedPosts: async () => [],
      publishFeed: async () => 'unused',
      publishServerMicroblog: async (body: string, options: Record<string, unknown>) => {
        serverPublishes.push({ body, options })
        onFeedPost?.({
          id: `author@example.test:${String(options.itemId)}`,
          topic: 'xmpp-pep:author@example.test',
          from: 'author@example.test',
          body,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          title: String(options.title),
          categories: ['XMPP'],
          author: 'Author',
        })
        return String(options.itemId)
      },
      onFeedPost: (listener: (record: any) => void) => { onFeedPost = listener; return () => {} },
    }
    controller = new ArticleBridgeController(runtime as never)
    const draft = createNewArticle({
      id: 'article-xmpp-publish-check',
      title: 'An XMPP article',
      topic: 'XMPP',
      blocks: [{ id: 'paragraph-1', type: 'paragraph', content: 'Article body over PEP.' }],
    })
    controller.saveDraft(draft)

    await expect(controller.publishArticle(draft, 'xmpp')).resolves.toBe(draft.id)

    expect(serverPublishes).toHaveLength(1)
    expect(serverPublishes[0].body).toContain('nexus-article:v1')
    expect(serverPublishes[0].body).toContain('Article body over PEP.')
    expect(serverPublishes[0].options).toMatchObject({ itemId: draft.id, title: draft.title, categories: ['XMPP'] })
    expect(controller.getState().drafts).toEqual([])
    expect(controller.getArticle(draft.id)).toMatchObject({ status: 'published', title: draft.title })
    expect(controller.getArticles().filter((article) => article.id === draft.id)).toHaveLength(1)
  })

  it('keeps the article draft when the XMPP publish acknowledgement fails', async () => {
    const runtime = {
      getFeedPosts: async () => [],
      publishFeed: async () => 'unused',
      publishServerMicroblog: async () => { throw new Error('XMPP server rejected publication') },
      onFeedPost: () => () => {},
    }
    controller = new ArticleBridgeController(runtime as never)
    const draft = createNewArticle({ id: 'article-xmpp-failed-check', title: 'Keep this draft', topic: 'XMPP' })
    controller.saveDraft(draft)

    await expect(controller.publishArticle(draft, 'xmpp')).rejects.toThrow(/server rejected/)
    expect(controller.getState().drafts.map((entry) => entry.id)).toContain(draft.id)
    expect(controller.getArticle(draft.id)?.status).toBe('draft')
  })

  it('toggles a saved article bookmark id', () => {
    const articleId = 'offline-bookmark-test'
    expect(controller.getState().bookmarkedIds).not.toContain(articleId)

    controller.toggleBookmark(articleId)
    expect(controller.getState().bookmarkedIds).toContain(articleId)
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
