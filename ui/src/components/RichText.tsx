import * as React from 'react'

const TOKEN = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"])/g

/**
 * Render post text with http(s) links. Links are real anchors when
 * `interactive`; inside another link (feed cards) they are styled text so the
 * card still opens the post.
 */
export function RichText({ text, interactive = false }: { text: string; interactive?: boolean }) {
  const nodes: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const label = match[1] ?? match[3]
    const href = match[2] ?? match[3]
    const key = `${index}-${href}`
    nodes.push(interactive
      ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline underline-offset-2 hover:text-primary/80">{label}</a>
      : <span key={key} className="break-all text-primary underline underline-offset-2">{label}</span>)
    last = index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}
