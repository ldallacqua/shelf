import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AchievementSetView,
  AchievementView,
  GameAchievements,
} from '@/domain/achievements/achievements'
import { ShelfProvider } from '@/features/library/shelf'
import type { ShelfInfo } from '@/features/library/shelf-address'
import { renderWithIntl } from '@/test/render'

import { Achievements } from './achievements'

/** A game's achievements on its page (issue 72). */

const SHELF: ShelfInfo = {
  handle: 'sample',
  name: 'Sample',
  public: true,
  files: { kind: 'public', key: 'k3y' },
}

const NOW = Date.UTC(2025, 9, 20)
const ICON = 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/220'

const achievement = (id: string, more: Partial<AchievementView> = {}): AchievementView => ({
  id,
  name: `Name of ${id}`,
  description: `About ${id}`,
  icon: `${ICON}/${id}.jpg`,
  iconLocked: `${ICON}/${id}_bw.jpg`,
  hidden: false,
  state: 'locked',
  ...more,
})

const halfLife = (more: Partial<AchievementSetView> = {}): AchievementSetView => ({
  provider: 'steam',
  setId: '220',
  title: 'Half-Life 2',
  state: 'ready',
  readAt: NOW - 3 * 60 * 60 * 1000,
  achievements: [
    achievement('window', { state: 'unlocked', unlockedAt: Date.UTC(2025, 9, 10), rate: 84 }),
    achievement('crowbar', { state: 'unlocked', unlockedAt: Date.UTC(2025, 9, 9), rate: 91.3 }),
    achievement('canals', { state: 'unlocked', rate: 61.7 }),
    achievement('lab', { hidden: true, rate: 12.5, description: 'Find the room behind the lab.' }),
    achievement('last', { rate: 2.1 }),
    achievement('collector', { state: 'unlocked', unlockedAt: Date.UTC(2025, 9, 8), rate: 5.4 }),
  ],
  ...more,
})

let answers: (() => Response)[]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  answers = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const next = answers.shift()
    return next ? next() : Response.json({ sets: [] } satisfies GameAchievements)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const answering = (...sets: AchievementSetView[]) =>
  answers.push(() => Response.json({ sets } satisfies GameAchievements))

const show = (locale: 'en' | 'pt-BR' = 'en') =>
  renderWithIntl(
    <ShelfProvider shelf={SHELF}>
      <Achievements
        slug="half-life-2"
        providers={['steam']}
        minor="h3"
        loading={<p>Loading them</p>}
      />
    </ShelfProvider>,
    locale,
  )

const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('Achievements', () => {
  it('asks for them when it opens, then says how many are unlocked, from where and when', async () => {
    answering(halfLife())
    show()
    expect(screen.getByText('Loading them')).toBeInTheDocument()
    expect(await screen.findByText('4 of 6 unlocked')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/libraries/k3y/achievements/half-life-2?locale=en',
      expect.anything(),
    )
    expect(screen.getByText('66%')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Achievements unlocked on Steam' })
    expect(bar).toHaveAttribute('aria-valuenow', '4')
    expect(bar).toHaveAttribute('aria-valuemax', '6')
    expect(screen.getByText('From Steam, read 3 hours ago.')).toBeInTheDocument()
  })

  it('says in words whether each is unlocked and when, and how rare Steam says it is', async () => {
    answering(halfLife())
    show()
    await screen.findByText('4 of 6 unlocked')
    const [window, , canals, , last] = rows()
    expect(within(window!).getByText('Name of window')).toBeInTheDocument()
    expect(within(window!).getByText('Unlocked Oct 10, 2025')).toBeInTheDocument()
    expect(within(window!).getByText('84% of Steam players')).toBeInTheDocument()
    // Steam does not know when: no date is made up.
    expect(within(canals!).getByText('Unlocked, day not known')).toBeInTheDocument()
    expect(within(last!).getByText('Locked')).toBeInTheDocument()
    expect(within(last!).getByText('2.1% of Steam players')).toBeInTheDocument()
  })

  it('keeps a hidden one’s details out of sight until it is unlocked, or I ask to see them', async () => {
    answering(halfLife())
    show()
    await screen.findByText('4 of 6 unlocked')
    expect(screen.queryByText('Name of lab')).toBeNull()
    expect(screen.queryByText('Find the room behind the lab.')).toBeNull()
    expect(screen.getByText('Hidden achievement')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: 'Show the hidden one' }))
    expect(screen.getByText('Name of lab')).toBeInTheDocument()
    expect(screen.getByText('Find the room behind the lab.')).toBeInTheDocument()
  })

  it('filters to the unlocked or the locked ones, and orders them by rarity or the latest unlocked', async () => {
    answering(halfLife())
    show()
    await screen.findByText('4 of 6 unlocked')
    const group = screen.getByRole('radiogroup', { name: 'Which achievements' })
    await userEvent.click(within(group).getByRole('radio', { name: 'Locked 2' }))
    expect(rows()).toHaveLength(2)
    await userEvent.click(within(group).getByRole('radio', { name: 'Unlocked 4' }))
    expect(rows()).toHaveLength(4)

    await userEvent.click(screen.getByRole('combobox', { name: 'Order' }))
    await userEvent.click(screen.getByRole('option', { name: 'Recently unlocked' }))
    expect(rows().map((row) => within(row).getAllByText(/Name of/)[0]!.textContent)).toEqual([
      'Name of window',
      'Name of crowbar',
      'Name of collector',
      'Name of canals',
    ])

    await userEvent.click(within(group).getByRole('radio', { name: 'All 6' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Order' }))
    await userEvent.click(screen.getByRole('option', { name: 'Rarest first' }))
    expect(within(rows()[0]!).getByText('2.1% of Steam players')).toBeInTheDocument()
  })

  it('says when every one is unlocked', async () => {
    answering(
      halfLife({
        achievements: [
          achievement('a', { state: 'unlocked' }),
          achievement('b', { state: 'unlocked' }),
        ],
      }),
    )
    show()
    expect(await screen.findByText('All 2 unlocked')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('gives no percentage while an achievement added since the last read is not known', async () => {
    answering(
      halfLife({
        achievements: [
          achievement('a', { state: 'unlocked' }),
          achievement('b', { state: 'unknown' }),
        ],
      }),
    )
    show()
    expect(await screen.findByText('1 of 2 unlocked')).toBeInTheDocument()
    expect(screen.queryByText('50%')).toBeNull()
    expect(screen.getByText(/One achievement was added since/)).toBeInTheDocument()
    expect(screen.getByText('Not known yet')).toBeInTheDocument()
  })

  it('shows a long list a part at a time', async () => {
    answering(
      halfLife({ achievements: Array.from({ length: 40 }, (_, at) => achievement(`a${at}`)) }),
    )
    show()
    await screen.findByText('0 of 40 unlocked')
    expect(rows()).toHaveLength(30)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 40' }))
    expect(rows()).toHaveLength(40)
  })

  it.each([
    ['none', 'This game has no achievements on Steam.'],
    ['pending', 'Not read from Steam yet. They come with the next sync.'],
    ['private', 'Steam keeps these achievements private.'],
    ['failed', 'Steam didn’t answer when they were read. They are read again with the next sync.'],
  ] as const)(
    'says so when they are %s, rather than showing none unlocked',
    async (state, said) => {
      answering(halfLife({ state, achievements: [] }))
      show()
      expect(await screen.findByText(said)).toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).toBeNull()
    },
  )

  it('says when what it shows is a snapshot, or older than the last read', async () => {
    answering(halfLife({ snapshot: true }))
    show()
    expect(
      await screen.findByText(
        'From Steam, as of Oct 19, 2025. Steam is no longer linked, so they are not read again.',
      ),
    ).toBeInTheDocument()
    cleanup()
    answering(halfLife({ problem: 'unreachable' }))
    show()
    expect(
      await screen.findByText(
        'Steam didn’t answer the last time they were read: these are as of Oct 19, 2025.',
      ),
    ).toBeInTheDocument()
  })

  it('names each of a game’s sets when it has several', async () => {
    answering(
      halfLife(),
      halfLife({ setId: '320', title: 'Half-Life 2: Deathmatch', state: 'none' }),
    )
    show()
    expect(await screen.findByRole('heading', { name: 'Half-Life 2 on Steam' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Half-Life 2: Deathmatch on Steam' }),
    ).toBeInTheDocument()
  })

  it('says when they could not be loaded, and tries again when asked', async () => {
    answers.push(() => new Response(null, { status: 500 }))
    answering(halfLife())
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The achievements could not be loaded.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('4 of 6 unlocked')).toBeInTheDocument()
  })

  it('is in Portuguese too, with Steam’s own Portuguese names', async () => {
    answering(
      halfLife({
        achievements: [
          ...halfLife().achievements.slice(0, 5),
          achievement('collector', { state: 'unlocked', rate: 5.4, inEnglish: true }),
        ],
      }),
    )
    show('pt-BR')
    expect(await screen.findByText('4 de 6 desbloqueadas')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/libraries/k3y/achievements/half-life-2?locale=pt-BR',
      expect.anything(),
    )
    expect(screen.getByRole('radiogroup', { name: 'Quais conquistas' })).toBeInTheDocument()
    expect(screen.getByText('Conquista oculta')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/dos jogadores da Steam/).length).toBe(6))
    // Steam has it only in English: said as English.
    expect(screen.getByText('Name of collector')).toHaveAttribute('lang', 'en')
    expect(screen.getByText('Name of window')).not.toHaveAttribute('lang')
  })
})
