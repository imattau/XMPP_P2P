import { useMemo, useState, useEffect } from 'react'
import { getBrowserXmppBridge } from '../runtime'
import { ArticleBridgeController } from './controller'
import type { Article, ArticleViewState } from './types'

export function useArticleBridge() {
  const controller = useMemo(() => new ArticleBridgeController(getBrowserXmppBridge()), [])
  const [state, setState] = useState<ArticleViewState>(controller.getState())

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState)
    const attachRuntime = () => controller.setRuntime(getBrowserXmppBridge())
    window.addEventListener('xmpp-p2p:bridge-ready', attachRuntime)
    window.addEventListener('xmpp-p2p:bridge-disconnected', attachRuntime)
    attachRuntime()
    return () => {
      unsubscribe()
      window.removeEventListener('xmpp-p2p:bridge-ready', attachRuntime)
      window.removeEventListener('xmpp-p2p:bridge-disconnected', attachRuntime)
    }
  }, [controller])

  return {
    articles: state.articles,
    drafts: state.drafts,
    bookmarkedIds: state.bookmarkedIds,
    loading: state.loading,
    loadError: state.loadError,
    activeTopic: state.activeTopic,

    getArticles: () => controller.getArticles(),
    getArticle: (id: string) => controller.getArticle(id),
    getDrafts: () => controller.getDrafts(),
    getTopicArticles: (tag: string) => controller.getTopicArticles(tag),
    getFeaturedArticles: () => controller.getFeaturedArticles(),
    getLatestArticles: () => controller.getLatestArticles(),
    getFollowedTopics: () => controller.getFollowedTopics(),
    toggleFollowedTopic: (topic: string) => controller.toggleFollowedTopic(topic),
    refresh: () => controller.refresh(),

    setActiveTopic: (tag: string | null) => controller.setActiveTopic(tag),
    saveDraft: (article: Article) => controller.saveDraft(article),
    deleteDraft: (id: string) => controller.deleteDraft(id),
    publishArticle: (article: Article, destination?: 'p2p' | 'xmpp') => controller.publishArticle(article, destination),
    toggleBookmark: (id: string) => controller.toggleBookmark(id),
  }
}
