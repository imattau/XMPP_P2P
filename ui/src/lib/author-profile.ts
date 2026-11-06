type ProfileAuthor = { handle: string; server?: string }

export function authorProfileUrl(author: ProfileAuthor, protocol?: 'p2p' | 'xmpp' | 'rss'): string {
  const params = new URLSearchParams({
    protocol: protocol ?? 'p2p',
    handle: author.handle,
    server: author.server ?? '',
  })
  return `/profile/author?${params.toString()}`
}
