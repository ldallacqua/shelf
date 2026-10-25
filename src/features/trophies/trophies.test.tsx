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

describe('the trophy wall', () => {
  it('stands every finished game under its year, newest first, each a way to its page', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Trophies' })).toBeInTheDocument()
    const years = screen.getAllByRole('heading', { level: 2 })
    expect(years.map((year) => year.textContent)).toEqual([
      '2026 1 game',
      '2025 1 game',
      'Day not recorded 1 game',
    ])

    const year = screen.getByRole('region', { name: '2025 1 game' })
    const hades = within(year).getByRole('link', { name: 'Hades' })
    expect(hades).toHaveAttribute('href', '/en/u/ana/game/hades')
    const trophy = hades.closest('li')!
    expect(within(trophy).getByText('Finished Nov 20')).toBeInTheDocument()
    expect(within(trophy).getByText('40 hours')).toBeInTheDocument()
    expect(within(trophy).getByText('8.5 out of 10')).toBeInTheDocument()
  })

  it('says how far the shelf got, and leaves out what it cannot know', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />)
    const stats = screen.getByRole('group', { name: 'Trophy stats' })

    const figure = (label: string) => within(stats).getByText(label).nextElementSibling
    expect(figure('Finished')).toHaveTextContent('3')
    expect(figure('In 2026')).toHaveTextContent('1')
    expect(figure('Hours played')).toHaveTextContent('52')
    // 85 and 70: 7.75, kept to its tenth.
    expect(figure('Average rating')).toHaveTextContent('7.8out of 10')
    // Three finished of four started.
    expect(figure('Of the games started')).toHaveTextContent('75% finished')
    expect(within(stats).getByRole('link', { name: 'Hades' })).toHaveAttribute(
      'href',
      '/en/u/ana/game/hades',
    )
    expect(figure('Played most on')).toHaveTextContent('Nintendo Switch40 hours')
  })

  it('reads in Portuguese', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026)} handle="ana" />, 'pt-BR')
    expect(screen.getByRole('heading', { level: 1, name: 'Troféus' })).toBeInTheDocument()
    expect(screen.getByText('Dia não registrado')).toBeInTheDocument()
    expect(screen.getByText('75% zerados')).toBeInTheDocument()
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
