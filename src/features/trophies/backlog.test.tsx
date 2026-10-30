import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { testGame, testLibrary, testPlatform } from '@/domain/library/testing'
import { trophyWall } from '@/domain/library/trophies'
import { renderWithIntl } from '@/test/render'

import { Backlog } from './backlog'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** The trophy page's backlog (issue 68): what is still to play, with IGDB's estimate said as one. */

const hours = (count: number) => count * 60
const library = testLibrary(
  [
    testGame('Elden Ring', {
      length: hours(60),
      minutes: hours(10),
      igdbRating: 95,
      igdbRatingCount: 400,
      year: 2022,
      genres: [31],
      copies: [{ platform: 6, format: 'digital' }],
    }),
    testGame('Inside', { length: hours(4), year: 2016, genres: [31] }),
    testGame('Okami', { status: 'someday', igdbRating: 91, igdbRatingCount: 200, year: 2006 }),
    testGame('Hades', { status: 'completed', completedOn: '2026-03-02', minutes: hours(54) }),
    testGame('Tunic', { status: 'unsorted' }),
  ],
  {
    genre: [{ id: 31, name: 'Adventure', slug: 'adventure' }],
    platform: [testPlatform(6, 'pc', 'pc', 'PC')],
  },
)

const draw = (
  options: { scope?: number; q?: string } = {},
  locale: 'en' | 'pt-BR' = 'en',
  shelf = library,
) => {
  const { stats } = trophyWall(shelf, 2026, locale, { ...options, today: '2026-10-29' })
  return renderWithIntl(<Backlog stats={stats} handle="ana" q={options.q} id="backlog" />, locale)
}

/** The same shelf, with IGDB's hasty time for Elden Ring: 45 hours of its 60. */
const hasty = testLibrary(
  library.games.map((game) => (game.title === 'Elden Ring' ? { ...game, hastyShare: 75 } : game)),
  library.names,
)

const section = (name: string) => screen.getByRole('region', { name })

describe('the trophy page’s backlog (issue 68)', () => {
  it('says how much is waiting, how long by IGDB, and how soon at my pace', () => {
    draw()
    const backlog = section('Still to play')
    expect(within(backlog).getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      `/en/u/ana?${new URLSearchParams({ q: 'status:backlog' })}`,
    )
    expect(backlog).toHaveTextContent('1 more for someday')
    // Elden Ring 50 and Inside 4: IGDB's estimate, of both backlog games.
    expect(backlog).toHaveTextContent('54hours')
    expect(backlog).toHaveTextContent("IGDB's estimate, of 2 of 2 games")
    // The 54 hours finished in the last twelve months clear 54 left in twelve.
    expect(backlog).toHaveTextContent('12months')
    expect(backlog).toHaveTextContent(
      'At the 54 hours of what you finished in the last twelve months',
    )
  })

  it('says the hours left and the months as ranges, from IGDB’s hasty times to its normal ones', () => {
    draw({}, 'en', hasty)
    const backlog = section('Still to play')
    // Elden Ring 35 to 50, Inside 4: 39 to 54 hours, and 9 to 12 months at 54 a year.
    expect(within(backlog).getByText('39–54')).toHaveAttribute('aria-hidden', 'true')
    expect(within(backlog).getByText('39 to 54')).toHaveClass('sr-only')
    expect(backlog).toHaveTextContent('From IGDB’s hasty to normal times, of 2 of 2 games')
    expect(within(backlog).getByText('9–12')).toHaveAttribute('aria-hidden', 'true')
    expect(within(backlog).getByText('9 to 12')).toHaveClass('sr-only')
  })

  it('lists the games to start with, each a way to its page', () => {
    draw()
    const quickest = section('Quickest to finish')
    expect(
      within(quickest)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Inside, 4 hours left', 'Elden Ring, 50 hours left'])
    expect(within(quickest).getByRole('link', { name: 'Inside, 4 hours left' })).toHaveAttribute(
      'href',
      '/en/u/ana/game/inside',
    )
    expect(
      within(section('Best rated, still waiting'))
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Elden Ring, 9.5 on IGDB', 'Okami, 9.1 on IGDB'])
    expect(
      within(section('Released longest ago'))
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Okami, 2006', 'Inside, 2016', 'Elden Ring, 2022'])
  })

  it('counts what is waiting by genre and platform, each a way to those games, the filter kept', () => {
    draw({ q: 'year:<2030' })
    expect(
      within(section('Waiting, by genre')).getByRole('link', {
        name: 'Adventure: 2 games waiting',
      }),
    ).toHaveAttribute(
      'href',
      `/en/u/ana?${new URLSearchParams({ q: 'status:backlog,someday genre:adventure (year:<2030)' })}`,
    )
    expect(
      within(section('Waiting, by platform')).getByRole('link', { name: 'PC: 1 game waiting' }),
    ).toBeInTheDocument()
  })

  it('counts the games a sync brought in apart, as a way to them', () => {
    draw()
    expect(
      screen.getByRole('link', { name: '1 more game from syncs, not placed yet' }),
    ).toHaveAttribute('href', `/en/u/ana?${new URLSearchParams({ q: 'status:unsorted' })}`)
  })

  it('speaks Portuguese', () => {
    draw({}, 'pt-BR')
    const backlog = section('Ainda por jogar')
    expect(backlog).toHaveTextContent('Mais 1 para algum dia')
    expect(within(backlog).getByRole('link', { name: 'Inside, Faltam 4 horas' })).toBeVisible()
  })

  it('writes a range as Portuguese does', () => {
    draw({}, 'pt-BR', hasty)
    const backlog = section('Ainda por jogar')
    expect(within(backlog).getByText('39–54')).toHaveAttribute('aria-hidden', 'true')
    expect(within(backlog).getByText('39 a 54')).toHaveClass('sr-only')
    expect(backlog).toHaveTextContent('Do tempo rápido ao normal do IGDB, de 2 de 2 jogos')
  })

  it('is not on a year’s page', () => {
    draw({ scope: 2026 })
    expect(screen.queryByRole('region', { name: 'Still to play' })).toBeNull()
  })
})
