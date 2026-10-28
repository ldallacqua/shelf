import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Library } from '@/domain/library/library'
import { ownedOn, testGame, testLibrary, testPlatform } from '@/domain/library/testing'
import { trophyWall } from '@/domain/library/trophies'
import { ShelfProvider } from '@/features/library/shelf'
import { renderWithIntl } from '@/test/render'

import { PrivateTrophies } from './private-trophies'
import { TrophyWallView } from './trophy-wall'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const account = vi.hoisted(() => ({
  status: 'visitor' as 'visitor' | 'checking' | 'signed-in',
  handle: 'ana',
  name: 'Ana',
}))
vi.mock('@/features/owner/account', () => ({
  useAccount: () => ({ ...account }),
  useIsMine: (handle: string | undefined) =>
    account.status === 'signed-in' && account.handle === handle,
}))

const mine = vi.hoisted(() => ({ library: undefined as Library | undefined }))
vi.mock('@/features/library/use-library', () => ({
  loadMine: () => Promise.resolve(mine.library),
}))

const switchPlatform = testPlatform(130, 'switch', 'nintendo', 'Nintendo Switch')
const library = testLibrary(
  [
    testGame('Hades', {
      status: 'completed',
      completedOn: '2025-11-20',
      minutes: 60 * 40,
      rating: 85,
      ...ownedOn(130),
    }),
    testGame('Tunic', { status: 'completed', completedOn: '2026-03-02', minutes: 60 * 12 }),
    testGame('Inside', { status: 'completed' }),
    testGame('Celeste', { status: 'playing', rating: 70 }),
  ],
  { platform: [switchPlatform] },
)

/** A link's filter, as the library's address carries it. */
const filterOf = (link: HTMLElement) =>
  new URL(link.getAttribute('href')!, 'https://shelf.test').searchParams.get('q')

describe('the trophy wall', () => {
  it('stands every finished game under its year, newest first, each a way to its page', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Trophies' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '2026 1 game' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day not recorded 1 game' })).toBeInTheDocument()

    const year = screen.getByRole('region', { name: '2025 1 game' })
    const hades = within(year).getByRole('link', { name: 'Hades' })
    expect(hades).toHaveAttribute('href', '/en/u/ana/game/hades')
    const trophy = hades.closest('li')!
    expect(within(trophy).getByText('Finished Nov 20')).toBeInTheDocument()
    expect(within(trophy).getByText('40 hours')).toBeInTheDocument()
    expect(within(trophy).getByText('8.5 out of 10')).toBeInTheDocument()
  })

  it('leads with the games finished, and says how far the shelf got, leaving out what it cannot know', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)
    const stats = screen.getByRole('group', { name: 'Trophy stats' })

    expect(within(stats).getByText('Games finished').nextElementSibling).toHaveTextContent('3')
    // One of four started is still being played.
    expect(within(stats).getByText('1 in 2026 · 75% of the games started')).toBeInTheDocument()
    const figure = (label: string) => within(stats).getByText(label).nextElementSibling
    expect(figure('Hours played')).toHaveTextContent('52')
    // 85 and 70: 7.75, kept to its tenth.
    expect(figure('Average rating')).toHaveTextContent('7.8out of 10')
    // 12 and 40 hours: 26 in the middle.
    expect(figure('Median playtime')).toHaveTextContent('26hours')
    expect(figure('Dropped')).toHaveTextContent('0')
    expect(within(stats).getByRole('link', { name: 'Hades' })).toHaveAttribute(
      'href',
      '/en/u/ana/game/hades',
    )
    expect(figure('Played most on')).toHaveTextContent('Nintendo Switch40 hours')
  })

  it('draws the years as columns, each a way to that year’s trophies alone, with a table too', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)
    const years = screen.getByRole('region', { name: 'Finished, year by year' })
    expect(within(years).getByRole('link', { name: '2025: 1 game finished' })).toHaveAttribute(
      'href',
      '/en/u/ana/trophies?year=2025',
    )
    const table = within(years).getByRole('table', { name: 'Finished, year by year' })
    expect(within(table).getByRole('row', { name: '2026 1' })).toBeInTheDocument()
  })

  it('leads from a month, and from a platform, to the games behind it in the library', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)
    const months = screen.getByRole('region', { name: 'Finished, month by month' })
    expect(filterOf(within(months).getByRole('link', { name: 'November 2025' }))).toBe(
      'completed:2025-11',
    )
    const kinds = screen.getByRole('region', { name: 'What is finished' })
    const platform = within(kinds).getByRole('link', { name: 'Nintendo Switch: 1 game finished' })
    expect(platform.getAttribute('href')).toMatch(/^\/en\/u\/ana\?/)
    expect(filterOf(platform)).toBe('status:completed owned:switch')
  })

  it('keeps the records: the first finish, the quickest, the best rated', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)
    const records = screen.getByRole('region', { name: 'Records' })
    const record = (label: string) => within(records).getByText(label).nextElementSibling
    expect(record('First finish recorded')).toHaveTextContent('HadesNov 20, 2025')
    expect(record('Quickest finish')).toHaveTextContent('Tunic12 hours')
    expect(record('Rated highest')).toHaveTextContent('Hades8.5 out of 10')
  })

  it('is of one year when the address asks, the way back to all of them first', () => {
    renderWithIntl(
      <TrophyWallView wall={trophyWall(library, 2026, 'en', { scope: 2025 })} handle="ana" />,
    )
    const stats = screen.getByRole('group', { name: 'Trophy stats' })
    expect(within(stats).getByText('Finished in 2025').nextElementSibling).toHaveTextContent('1')
    expect(within(stats).getByText('Hours on them').nextElementSibling).toHaveTextContent('40')
    const period = screen.getByRole('list', { name: 'Period' })
    expect(within(period).getByRole('link', { name: '2025' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(period).getByRole('link', { name: 'All time' })).toHaveAttribute(
      'href',
      '/en/u/ana/trophies',
    )
    // The year's own column leads back to every year.
    const years = screen.getByRole('region', { name: 'Finished, year by year' })
    expect(within(years).getByRole('link', { name: '2025: 1 game finished' })).toHaveAttribute(
      'href',
      '/en/u/ana/trophies',
    )
    expect(screen.queryByRole('region', { name: '2026 1 game' })).toBeNull()
    expect(screen.getByRole('region', { name: '2025 1 game' })).toBeInTheDocument()
  })

  it('keeps the filter it was worked out with in every way onward, and says when nothing matches', () => {
    // Nothing finished is still being played.
    const q = 'status:playing'
    renderWithIntl(
      <TrophyWallView wall={trophyWall(library, 2026, 'en', { q })} handle="ana" q={q} />,
    )
    expect(screen.getByRole('searchbox', { name: /Filter/ })).toHaveValue(q)
    expect(screen.getByText('No finished game matches.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear' })).toHaveAttribute(
      'href',
      '/en/u/ana/trophies',
    )
  })

  it('reads in Portuguese', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />, 'pt-BR')
    expect(screen.getByRole('heading', { level: 1, name: 'Troféus' })).toBeInTheDocument()
    expect(screen.getByText('Dia não registrado')).toBeInTheDocument()
    expect(screen.getByText('1 em 2026 · 75% dos jogos começados')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Zerados, ano a ano' })).toBeInTheDocument()
  })
})

describe('a private shelf’s trophy wall', () => {
  beforeEach(() => {
    account.status = 'visitor'
    mine.library = library
  })

  const wallOf = () =>
    renderWithIntl(
      <ShelfProvider shelf={{ handle: 'ana', name: '', public: false, files: { kind: 'mine' } }}>
        <PrivateTrophies />
      </ShelfProvider>,
    )

  it('tells anyone else only that the shelf is private', () => {
    wallOf()
    expect(screen.getByText('This shelf is private.')).toBeInTheDocument()
    expect(screen.queryByText('Hades')).not.toBeInTheDocument()
  })

  it('is filled in for its own account', async () => {
    account.status = 'signed-in'
    wallOf()
    expect(await screen.findByRole('region', { name: '2025 1 game' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Trophy stats' })).toBeInTheDocument()
  })

  it('is the empty wall while nothing is finished', async () => {
    account.status = 'signed-in'
    mine.library = testLibrary([testGame('Celeste', { status: 'playing' })])
    wallOf()
    expect(await screen.findByText('Nothing finished yet.')).toBeInTheDocument()
  })
})
