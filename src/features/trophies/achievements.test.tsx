import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LibraryGame } from '@/domain/library/library'
import { testGame, testLibrary } from '@/domain/library/testing'
import {
  achievementWall,
  type AchievementOptions,
  type GameUnlocks,
  type Unlocked,
} from '@/domain/library/trophy-achievements'
import { trophyWall } from '@/domain/library/trophies'
import { renderWithIntl } from '@/test/render'

import { TrophyWallView } from './trophy-wall'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/**
 * The trophy page's achievements (issue 68's third phase): the figures, the
 * years they came in, the vault kept to a rarity, the games perfected and
 * nearly so, each a way to the games behind them.
 */

const at = (day: string) => Date.parse(`${day}T12:00:00Z`)

const finished = (title: string, completedOn: string, extra: Partial<LibraryGame> = {}) =>
  testGame(title, { status: 'completed', completedOn, genres: [12], ...extra })

const library = testLibrary(
  [
    finished('Hades', '2025-03-02'),
    finished('Bastion', '2024-04-02'),
    finished('Pyre', '2025-05-02'),
    finished('Night Club', '2025-06-02', { adult: true, genres: [] }),
  ],
  { genre: [{ id: 12, name: 'RPG', slug: 'rpg' }] },
)

const unlock = (name: string, rate: number, day?: string): Unlocked => ({
  key: `steam:1/${name}`,
  name,
  rate,
  icon: `https://shared.akamai.steamstatic.com/community_assets/images/apps/1/${name}.jpg`,
  ...(day ? { at: at(day) } : {}),
})

const unlocks: GameUnlocks[] = [
  {
    slug: 'hades',
    total: 3,
    perfect: true,
    readAt: at('2026-10-28'),
    unlocked: [
      unlock('Is It Done Yet?', 0.4, '2025-03-01'),
      unlock('Escaped', 30, '2025-03-01'),
      unlock('Night Owl', 60, '2025-03-02'),
    ],
  },
  {
    slug: 'bastion',
    total: 10,
    perfect: false,
    unlocked: Array.from({ length: 8 }, (_, index) =>
      unlock(`Proud ${index}`, 40 + index, `2024-0${index + 1}-10`),
    ),
  },
  { slug: 'pyre', total: 20, perfect: false, unlocked: [unlock('Rite', 8, '2025-07-01')] },
  {
    slug: 'night-club',
    total: 2,
    perfect: false,
    unlocked: [unlock('Last Call', 3, '2025-08-01')],
  },
]

const draw = (options: AchievementOptions = {}, locale: 'en' | 'pt-BR' = 'en') => {
  const wall = trophyWall(library, 2026, 'en', { today: '2026-10-28', ...options })
  return renderWithIntl(
    <TrophyWallView
      wall={wall}
      achievements={achievementWall(library, unlocks, 2026, options)}
      handle="ana"
      q={options.q}
    />,
    locale,
  )
}

/** A link's address, as the page would follow it. */
const addressOf = (link: HTMLElement) => new URL(link.getAttribute('href')!, 'https://shelf.test')

/**
 * The figures a device that shows adult games draws, or one that hides them:
 * with adult games among them the page draws both, and CSS shows one. Each
 * set's filters and chapter links stand apart from its chapters.
 */
const figuresFor = (when: 'shown' | 'hidden') =>
  [...document.querySelectorAll<HTMLElement>(`[data-when-adult="${when}"]`)].find((each) =>
    each.querySelector('section'),
  )
const shown = () => figuresFor('shown') ?? document.body

describe('the achievements (issue 68)', () => {
  it('say how many are unlocked, perfected, how rare and what they score', () => {
    draw()
    const section = within(shown()).getByRole('region', { name: 'Achievements' })
    expect(section).toHaveTextContent('Achievements unlocked13')
    expect(section).toHaveTextContent('37% of 35 achievements')
    expect(section).toHaveTextContent('Perfect games1')
    expect(section).toHaveTextContent('25% of the games with an unlock')
    expect(section).toHaveTextContent('From Steam, read Oct 28, 2026')
  })

  it('lead from each year to its page, and from a genre to the page kept to it', () => {
    draw({ q: 'status:completed' })
    const section = within(shown()).getByRole('region', { name: 'Achievements' })
    const year = within(section).getByRole('link', { name: '2025: 5 achievements unlocked' })
    expect(addressOf(year).searchParams.get('year')).toBe('2025')
    const genre = within(section).getByRole('link', { name: /^RPG:/ })
    expect(addressOf(genre).pathname).toBe('/en/u/ana/trophies')
    expect(addressOf(genre).searchParams.get('q')).toBe('genre:rpg (status:completed)')
  })

  it('are of the unlocks in the year on its page, month by month', () => {
    draw({ scope: 2025 })
    const section = within(shown()).getByRole('region', { name: 'Achievements' })
    expect(section).toHaveTextContent('Unlocked in 20255')
    expect(
      within(section).getByRole('img', { name: 'March: 3 achievements unlocked' }),
    ).toBeInTheDocument()
    expect(within(section).queryByText(/of 35 achievements/)).toBeNull()
  })

  it('mark the milestones, and say what is worth saying among the rest', () => {
    draw()
    const section = within(shown()).getByRole('region', { name: 'Achievements' })
    expect(section).toHaveTextContent('1st achievementProud 0 in Bastion')
    expect(section).toHaveTextContent('First perfect gameHades')
    const said = within(shown()).getByRole('region', { name: 'What the figures say' })
    expect(said).toHaveTextContent(
      'Your rarest unlock is Is It Done Yet?, in Hades: only 0.4% of Steam players have it.',
    )
  })

  it('are left out where no game has achievements known', () => {
    renderWithIntl(<TrophyWallView wall={trophyWall(library, 2026, 'en')} handle="ana" />, 'en')
    expect(screen.queryAllByRole('region', { name: 'Achievements' })).toEqual([])
    expect(screen.queryAllByRole('region', { name: 'Trophy vault' })).toEqual([])
  })
})

describe('the trophy vault (issue 68)', () => {
  it('lists the rarest unlocks, the rare ones glowing, each leading to its game’s achievements', () => {
    draw()
    const vault = within(shown()).getByRole('region', { name: 'Trophy vault' })
    const rarest = within(
      within(vault).getByRole('region', { name: 'Rarest unlocked' }),
    ).getAllByRole('link')
    expect(rarest[0]).toHaveAccessibleName(
      'Is It Done Yet?, in Hades, 0.4% of Steam players, unlocked Mar 1, 2025',
    )
    expect(rarest[0]).toHaveAttribute('href', '/en/u/ana/game/hades#achievements')
    expect(rarest[0]!.querySelector('[data-rare]')).not.toBeNull()
    expect(rarest.at(-1)!.querySelector('[data-rare]')).toBeNull()
  })

  it('keeps itself to a rarity chosen from its columns, with the way back to every one', () => {
    draw({ rarity: 'rare', q: 'genre:rpg' })
    const vault = within(shown()).getByRole('region', { name: 'Trophy vault' })
    const rare = within(vault).getByRole('link', { name: /^Rare, 5% to 10%/ })
    expect(rare).toHaveAttribute('aria-current', 'page')
    // Chosen again, it lets go.
    expect(addressOf(rare).searchParams.has('rarity')).toBe(false)
    const ultra = addressOf(within(vault).getByRole('link', { name: /^Ultra rare/ }))
    expect(ultra.searchParams.get('rarity')).toBe('ultra')
    expect(ultra.searchParams.get('q')).toBe('genre:rpg')
    expect(ultra.hash).toBe('#trophy-vault')
    expect(within(vault).getByRole('region', { name: 'Rarest unlocked' })).toHaveTextContent(
      'RitePyre8%',
    )
    expect(within(vault).getByRole('link', { name: 'Every rarity' })).toBeInTheDocument()
  })

  it('shows the games perfected, and those a few short', () => {
    draw()
    const vault = within(shown()).getByRole('region', { name: 'Trophy vault' })
    expect(within(vault).getByRole('region', { name: 'Perfect games (1)' })).toHaveTextContent(
      'All 3 · Mar 2025',
    )
    const close = within(vault).getByRole('link', {
      name: 'Bastion: 8 of 10 unlocked, 2 left',
    })
    expect(close).toHaveAttribute('href', '/en/u/ana/game/bastion#achievements')
  })

  it('leaves out adult games for a device that hides them', () => {
    draw()
    const hidden = figuresFor('hidden')!
    expect(within(hidden).getByRole('region', { name: 'Trophy vault' })).not.toHaveTextContent(
      'Last Call',
    )
    expect(within(shown()).getByRole('region', { name: 'Trophy vault' })).toHaveTextContent(
      'Last Call',
    )
    // Each set's columns, and its chapter links, lead to its own vault.
    const ultra = within(hidden).getByRole('link', { name: /^Ultra rare/ })
    expect(addressOf(ultra).hash).toBe('#trophy-vault-safe')
    expect(document.getElementById('trophy-vault-safe')).toBe(
      within(hidden).getByRole('region', { name: 'Trophy vault' }),
    )
  })

  it('reads in Portuguese', () => {
    draw({}, 'pt-BR')
    expect(within(shown()).getByRole('region', { name: 'Cofre de troféus' })).toHaveTextContent(
      'Mais raras',
    )
    expect(within(shown()).getByRole('region', { name: 'Conquistas' })).toHaveTextContent(
      '1ª conquista',
    )
  })
})
