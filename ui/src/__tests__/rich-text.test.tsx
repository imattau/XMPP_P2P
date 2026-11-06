import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RichText } from '../components/RichText'

describe('RichText', () => {
  const text = 'See [the docs](https://example.org/a_%28b%29) and https://example.org/x.\nNot a link: javascript:alert(1)'

  it('renders http links as safe anchors when interactive', () => {
    render(<p><RichText text={text} interactive /></p>)
    const docs = screen.getByRole('link', { name: 'the docs' })
    expect(docs.getAttribute('href')).toBe('https://example.org/a_%28b%29')
    expect(docs.getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('link', { name: 'https://example.org/x' })).toBeTruthy()
    expect(screen.queryAllByRole('link')).toHaveLength(2)
  })

  it('renders styled text, not anchors, inside another link', () => {
    render(<p><RichText text={text} /></p>)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('the docs')).toBeTruthy()
  })
})
