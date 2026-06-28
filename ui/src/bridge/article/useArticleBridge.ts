import { useMemo, useState, useEffect } from 'react'
import { getBrowserXmppBridge } from '../runtime'
import { ArticleBridgeController } from './controller'
import type { Article, ArticleViewState } from './types'

export function useArticleBridge() {
  const controller = useMemo(() => new ArticleBridgeController(getBrowserXmppBridge()), [])
  const [state, setState] = useState<ArticleViewState>(controller.getState())

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    return () => { unsubscribe() }
  }, [controller])

  return {
    articles: state.articles,
    drafts: state.drafts,
    bookmarkedIds: state.bookmarkedIds,
    loading: state.loading,
    activeTopic: state.activeTopic,

    getArticles: () => controller.getArticles(),
    getArticle: (id: string) => controller.getArticle(id),
    getDrafts: () => controller.getDrafts(),
    getTopicArticles: (tag: string) => controller.getTopicArticles(tag),
    getFeaturedArticles: () => controller.getFeaturedArticles(),
    getLatestArticles: () => controller.getLatestArticles(),

    setActiveTopic: (tag: string | null) => controller.setActiveTopic(tag),
    saveDraft: (article: Article) => controller.saveDraft(article),
    deleteDraft: (id: string) => controller.deleteDraft(id),
    publishArticle: (article: Article) => controller.publishArticle(article),
    toggleBookmark: (id: string) => controller.toggleBookmark(id),
  }
}
