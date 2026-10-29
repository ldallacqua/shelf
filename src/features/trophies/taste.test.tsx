import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LibraryGame } from '@/domain/library/library'
import { testGame, testLibrary } from '@/domain/library/testing'
import { trophyWall, type WallOptions } from '@/domain/library/trophies'
import { renderWithIntl } from '@/test/render'

import { TrophyWallView } from './trophy-wall'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/**
 * The trophy page's second phase (issue 68): the ranking chosen in the
 * address, what the figures say, my ratings, the series and my years, each a
 * way to the games behind it.
 */

const finished = (title: string, completedOn: string, extra: Partial<LibraryGame> = {}) =>
  testGame(title, { status: 'completed', completedOn, ...extra })

const rated = (title: string, completedOn: string, mine: number, theirs: number, year: number) =>
  finished(title, completedOn, {
    rating: mine,
    igdbRating: theirs,
    igdbRatingCount: 40,
    year,
    minutes: 60 * 10,
    genres: [12],
    developers: [1],
  })

const library = testLibrary(
  [
    rated('Hades', '2025-03-02', 95, 70, 2020),
    rated('Bastion', '2025-04-02', 85, 80, 2011),
    rated('Pyre', '2025-05-02', 80, 80, 2017),
    rated('Transistor', '2026-01-10', 90, 85, 2014),
    rated('Hades II', '2026-02-10', 40, 85, 2025),
    finished('Zelda', '2024-06-01', { franchises: [7], year: 1986 }),
    finished('Link to the Past', '2024-07-01', { franchises: [7], year: 1991 }),
    testGame('Breath of the Wild', { status: 'backlog', franchises: [7], year: 2017 }),
  ],
  {
    genre: [{ id: 12, name: 'RPG', slug: 'rpg' }],
    company: [{ id: 1, name: 'Supergiant', slug: 'supergiant' }],
    franchise: [{ id: 7, name: 'The Legend of Zelda', slug: 'the-legend-of-zelda' }],
  },
)

const draw = (options: WallOptions = {}, locale: 'en' | 'pt-BR' = 'en') =>
  renderWithIntl(
    <TrophyWallView
      wall={trophyWall(library, 2026, 'en', { today: '2026-10-28', ...options })}
      handle="ana"
      q={options.q}
    />,
    locale,
  )

/** A link's address, as the page would follow it. */
const addressOf = (link: HTMLElement) => new URL(link.getAttribute('href')!, 'https://shelf.test')

describe('the ranking (issue 68)', () => {
  it('is chosen by links that keep the year and the filter, the current one marked', () => {
    draw({ by: 'hours', q: 'genre:rpg' })
    const rankBy = screen.getByRole('list', { name: 'Rank by' })
    expect(within(rankBy).getByRole('link', { name: 'Hours' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const rating = addressOf(within(rankBy).getByRole('link', { name: 'Rating' }))
    expect(rating.pathname).toBe('/en/u/ana/trophies')
    expect(rating.searchParams.get('by')).toBe('rating')
    expect(rating.searchParams.get('q')).toBe('genre:rpg')
    // Games finished is the page's own order: it needs nothing in the address.
    const plain = addressOf(within(rankBy).getByRole('link', { name: 'Finished' }))
    expect(plain.searchParams.has('by')).toBe(false)
    // The period and the filter keep it too.
    const period = screen.getByRole('list', { name: 'Period' })
    expect(
      addressOf(within(period).getByRole('link', { name: '2025' })).searchParams.get('by'),
    ).toBe('hours')
    expect(document.querySelector('input[type="hidden"][name="by"]')).toHaveValue('hours')
  })

  it('says each kind by the measure, and how many it finished beside it', () => {
    draw({ by: 'hours' })
    const kinds = screen.getByRole('region', { name: 'What is finished' })
    const rpg = within(kinds).getByRole('link', { name: 'RPG: 5 games finished, 50 hours on them' })
    expect(rpg).toHaveTextContent('RPG50 h5 finished')
    expect(addressOf(rpg).searchParams.get('q')).toBe('status:completed genre:rpg')
    const developers = within(kinds).getByRole('region', { name: 'Developers' })
    expect(within(developers).getByRole('link')).toHaveTextContent('Supergiant')
  })

  it('offers no share finished for one year, whose games began whenever they did', () => {
    draw({ scope: 2025 })
    const rankBy = screen.getByRole('list', { name: 'Rank by' })
    expect(within(rankBy).queryByRole('link', { name: 'Share finished' })).toBeNull()
    expect(within(rankBy).getByRole('link', { name: 'Rating' })).toHaveAttribute(
      'href',
      '/en/u/ana/trophies?year=2025&by=rating',
    )
  })

  it('leads from a decade to the games finished that came out in it', () => {
    draw()
    const decades = screen.getByRole('region', { name: 'Released, by decade' })
    const link = within(decades).getByRole('link', {
      name: '2010s: 3 games finished',
    })
    expect(addressOf(link).searchParams.get('q')).toBe('status:completed year:2010..2019')
  })
})

describe('what the figures say (issue 68)', () => {
  it('says a few things in words, each with the way to its games', () => {
    draw()
    const said = screen.getByRole('region', { name: 'What the figures say' })
    // 2026 has two finishes, 2025 had three: one more to match it.
    expect(said).toHaveTextContent("One more game and this year matches 2025's 3.")
    expect(said).toHaveTextContent(
      'Your best-rated developer is Supergiant: 7.8 out of 10 across 5 games finished.',
    )
    const developer = within(said)
      .getAllByRole('link', { name: 'See the games' })
      .map((link) => addressOf(link).searchParams.get('q'))
    expect(developer).toContain('status:completed developer:supergiant')
  })
})

describe('my ratings (issue 68)', () => {
  it('fall by point, each a way to the games of that rating', () => {
    draw()
    const ratings = screen.getByRole('region', { name: 'Ratings' })
    const eight = within(ratings).getByRole('link', { name: 'Rated 8 or 8.5: 2 games' })
    expect(addressOf(eight).searchParams.get('q')).toBe('rating:8..8.5')
  })

  it('stand against IGDB’s players’, and name the widest gaps', () => {
    draw()
    const ratings = screen.getByRole('region', { name: 'Ratings' })
    expect(ratings).toHaveTextContent("On average you rate 0.2 lower than IGDB's players.")
    const table = within(ratings).getByRole('table', { name: "Your rating and IGDB's, by game" })
    expect(within(table).getByRole('row', { name: 'Hades 9.5 7' })).toBeInTheDocument()
    expect(
      within(ratings).getByRole('region', { name: 'Rated well above IGDB' }),
    ).toHaveTextContent('HadesYou 9.5 · IGDB 7')
    expect(
      within(ratings).getByRole('region', { name: 'Rated well below IGDB' }),
    ).toHaveTextContent('Hades IIYou 4 · IGDB 8.5')
  })
})

describe('the series (issue 68)', () => {
  it('say how far through each I am, its games under it, and lead to them', () => {
    draw()
    const series = screen.getByRole('region', { name: 'Series' })
    const zelda = within(series).getByText('The Legend of Zelda').closest('details')!
    expect(zelda).toHaveTextContent('2 of 3')
    expect(
      within(zelda)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'CompletedZelda1986',
      'CompletedLink to the Past1991',
      'BacklogBreath of the Wild2017',
    ])
    const all = within(zelda).getByRole('link', { name: 'See them in the library' })
    expect(addressOf(all).searchParams.get('q')).toBe('franchise:the-legend-of-zelda')
  })

  it('are not on a year’s page', () => {
    draw({ scope: 2025 })
    expect(screen.queryByRole('region', { name: 'Series' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Your years' })).toBeNull()
  })
})

describe('my years (issue 68)', () => {
  it('are oldest first, each a way to its own page, with what led it and its milestones', () => {
    draw()
    const years = within(screen.getByRole('region', { name: 'Your years' })).getAllByRole(
      'listitem',
    )
    const heads = years.filter((item) => item.classList.contains('trophy-history-year'))
    expect(heads.map((item) => item.querySelector('a')!.textContent)).toEqual([
      '2024',
      '2025',
      '2026',
    ])
    expect(heads[0]).toHaveTextContent('1st finishZelda')
    expect(heads[1]).toHaveTextContent('Mostly RPG')
    expect(heads[1]!.querySelector('a')).toHaveAttribute('href', '/en/u/ana/trophies?year=2025')
  })

  it('read in Portuguese', () => {
    draw({}, 'pt-BR')
    const years = screen.getByRole('region', { name: 'Seus anos' })
    expect(years).toHaveTextContent('1º zerado')
    expect(screen.getByRole('list', { name: 'Ordenar por' })).toBeInTheDocument()
  })
})
