import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { Scores } from './scores'

const igdb = { rating: 84, count: 312, url: 'https://www.igdb.com/games/ember-road' }
const steam = { app: '620', count: 392586, percent: 98, score: 9 }
const shelf = { rating: 86, count: 14 }

describe('Scores (spec 7.11)', () => {
  it('shows each place on its own scale, with who it speaks for and how many', () => {
    renderWithIntl(<Scores level="h2" igdb={igdb} steam={steam} shelf={shelf} />)
    const section = screen.getByRole('heading', { name: 'Scores' }).parentElement!
    expect(section).toHaveTextContent('84')
    expect(section).toHaveTextContent('of 100')
    expect(section).toHaveTextContent('Critics and players')
    expect(section).toHaveTextContent('312 ratings')
    expect(section).toHaveTextContent('98%')
    expect(section).toHaveTextContent('positive')
    expect(section).toHaveTextContent('Overwhelmingly Positive')
    expect(section).toHaveTextContent('393K reviews')
    expect(section).toHaveTextContent('8.6')
    expect(section).toHaveTextContent('of 10')
    expect(section).toHaveTextContent('14 ratings')
  })

  it('leads to the place a score came from, in a new tab', () => {
    renderWithIntl(<Scores level="h2" igdb={igdb} steam={steam} shelf={shelf} />)
    const toIgdb = screen.getByRole('link', { name: /IGDB/ })
    expect(toIgdb).toHaveAttribute('href', igdb.url)
    expect(toIgdb).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /Steam/ })).toHaveAttribute(
      'href',
      'https://store.steampowered.com/app/620#app_reviews_hash',
    )
  })

  it('says when nobody on Shelf has rated it yet', () => {
    renderWithIntl(<Scores level="h2" igdb={igdb} />)
    expect(screen.getByText('No ratings yet')).toBeInTheDocument()
  })

  it('draws nothing with nothing from anywhere', () => {
    const { container } = renderWithIntl(<Scores level="h2" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gives Steam’s words only where it has them', () => {
    renderWithIntl(<Scores level="h2" steam={{ app: '620', count: 3, percent: 100, score: 0 }} />)
    expect(screen.getByText('Steam players')).toBeInTheDocument()
    expect(screen.getByText('3 reviews')).toBeInTheDocument()
  })

  it('dims the meter of a score that rests on a few, and says how few in words', () => {
    const { container } = renderWithIntl(<Scores level="h2" shelf={{ rating: 90, count: 1 }} />)
    expect(container.querySelector('.game-score-meter[data-few]')).not.toBeNull()
    expect(screen.getByText('1 rating')).toBeInTheDocument()
  })

  it('waits for what the page’s facts bring, and keeps its words from a screen reader', () => {
    renderWithIntl(<Scores level="h2" igdb={igdb} waiting />)
    const section = screen.getByRole('heading', { name: 'Scores' }).parentElement!
    expect(within(section).getByText('312 ratings')).toBeInTheDocument()
    expect(section.querySelectorAll('[aria-hidden="true"].game-score')).toHaveLength(2)
    expect(section).not.toHaveTextContent('No ratings yet')
  })
})
