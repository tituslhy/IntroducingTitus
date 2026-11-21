import { render, screen } from '@testing-library/react'
import { ARTICLE_COUNT_NUMBER, numberToWords } from '@/lib/content'
import { FRONT_STATS } from '@/lib/front-page'
import { OPEN_SOURCE } from '@/lib/profile'
import OpeningLine from './OpeningLine'

describe('OpeningLine', () => {
  it('says the years in words, then the article count', () => {
    const { container } = render(<OpeningLine />)
    const sentence = container.querySelector('p')!
    expect(sentence).toHaveTextContent(`Eight years putting AI into production. ${ARTICLE_COUNT_NUMBER} articles explaining how it works.`)
  })

  it('bolds exactly the articles, repos and contributions, in that order', () => {
    const { container } = render(<OpeningLine />)
    const numbers = Array.from(container.querySelectorAll('p b')).map((b) => b.textContent)
    expect(numbers).toEqual([
      String(FRONT_STATS.articles),
      String(FRONT_STATS.repos),
      String(FRONT_STATS.contributions),
    ])
  })

  it('takes the contribution count from OPEN_SOURCE and the repo count from the GitHub data', () => {
    expect(FRONT_STATS.contributions).toBe(OPEN_SOURCE.length)
    const { container } = render(<OpeningLine />)
    expect(container.querySelector('p')).toHaveTextContent(`${FRONT_STATS.repos} public repos`)
    expect(container.querySelector('p')).toHaveTextContent(`${OPEN_SOURCE.length} contributions back`)
  })

  it('spells out the years from the years constant, not a typed word', () => {
    expect(numberToWords(8)).toBe('eight')
    render(<OpeningLine />)
    expect(screen.getByText(/^Eight years putting AI into production\./)).toBeInTheDocument()
  })

  it('has the down button beneath the sentence', () => {
    render(<OpeningLine />)
    expect(screen.getByRole('link', { name: "Scroll down to what's on this site" })).toHaveAttribute('href', '#on-this-site')
  })
})
