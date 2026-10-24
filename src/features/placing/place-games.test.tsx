import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Placing, UnsortedGame } from '@/domain/library/placing'
import type { AccountState } from '@/features/owner/account'
import type { Notice } from '@/features/shell/notices'
import { renderWithIntl } from '@/test/render'

import { PlaceGames } from './place-games'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let who: AccountState
vi.mock('@/features/owner/account', () => ({ useAccount: () => who }))

const notices: Omit<Notice, 'id'>[] = []
vi.mock('@/features/shell/notices', () => ({
  notify: (notice: Omit<Notice, 'id'>) => {
    notices.push(notice)
    return notices.length
  },
}))

/**
 * Placing what a sync brought in (spec 4.5): the list, the tally, one game
 * placed with Undo, many placed at once, a rating that keeps a game in the
 * list, and the keyboard's way through.
 */

const LAST_PLAYED = Date.UTC(2025, 9, 9)

const game = (
  entryId: string,
  title: string,
  minutes: number,
  extra: Partial<UnsortedGame> = {},
): UnsortedGame => ({
  entryId,
  slug: entryId,
  title,
  addedOn: '2026-10-23',
  minutes,
  platforms: [6],
  played: [{ source: 'steam', minutes, ...(minutes > 0 ? { lastPlayedAt: LAST_PLAYED } : {}) }],
  ...extra,
})

const PLACING: Placing = {
  version: 7,
  games: [
    game('celeste', 'Celeste', 30),
    game('hades', 'Hades', 720, { year: 2020 }),
    game('portal', 'Portal', 0),
  ],
  tally: { playing: 2, backlog: 5, completed: 1, dropped: 0, wishlist: 0, unsorted: 3 },
  platforms: [{ id: 6, key: 'pc', name: 'PC (Microsoft Windows)', short: 'PC' }],
}

const sent: { path: string; method: string; body?: unknown }[] = []
let placing: Placing
let fails: boolean

beforeEach(() => {
  who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true }
  sent.length = 0
  notices.length = 0
  placing = PLACING
  fails = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/api/v1/me/unsorted') return Response.json(placing)
    if (path.startsWith('/api/v1/entries') && method === 'PATCH') {
      if (fails) return new Response(null, { status: 500 })
      return Response.json({ version: 8 })
    }
    return new Response(null, { status: 404 })
  })
})
afterEach(() => vi.restoreAllMocks())

/** The list's own rows: each holds a list of its sources too. */
const rows = (name = 'Unsorted games') => [
  ...screen.getByRole('list', { name }).querySelectorAll<HTMLElement>(':scope > li'),
]
const titles = () => rows().map((row) => within(row).getByRole('heading', { level: 3 }).textContent)
const rowOf = (title: string) =>
  rows().find((row) =>
    within(row).getByRole('heading', { level: 3 }).textContent?.startsWith(title),
  )!
const tally = () => screen.getByRole('complementary', { name: 'Your games by status' })
const patches = () => sent.filter((each) => each.method === 'PATCH')

describe('PlaceGames', () => {
  it('lists the unsorted games, longest played first, with their hours and last play', async () => {
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })
    expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal'])
    expect(within(rowOf('Hades')).getByText('12 h on Steam')).toBeInTheDocument()
    expect(within(rowOf('Hades')).getByText(/last played Oct 9, 2025/)).toBeInTheDocument()
    expect(within(rowOf('Portal')).getByText('Not played on Steam')).toBeInTheDocument()
    expect(within(rowOf('Hades')).getByRole('link', { name: 'Hades' })).toHaveAttribute(
      'href',
      '/en/u/ana/game/hades',
    )
    expect(within(tally()).getByText('3 games left to place.')).toBeInTheDocument()
  })

  it('places a game with one tap: it leaves the list, the tally moves, and Undo puts it back', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(within(rowOf('Hades')).getByRole('button', { name: 'Backlog' }))
    expect(titles()).toEqual(['Celeste', 'Portal'])
    expect(within(tally()).getByText('2 games left to place.')).toBeInTheDocument()
    expect(within(tally()).getByText('6')).toBeInTheDocument()
    await waitFor(() => expect(notices.at(-1)?.message).toBe('Put Hades in Backlog.'))
    expect(patches()).toEqual([
      { path: '/api/v1/entries/hades', method: 'PATCH', body: { status: 'backlog' } },
    ])

    await notices.at(-1)!.actions![0]!.run()
    await waitFor(() => expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal']))
    expect(patches().at(-1)?.body).toEqual({ status: 'unsorted' })
    expect(notices.at(-1)?.message).toBe('Hades is back in the list.')
    expect(within(tally()).getByText('3 games left to place.')).toBeInTheDocument()
  })

  it('puts a game back, saying so, when placing it fails', async () => {
    fails = true
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />, 'pt-BR')
    await screen.findByRole('list', { name: 'Jogos a definir' })
    await user.click(within(rows('Jogos a definir')[0]!).getByRole('button', { name: 'Zerado' }))
    await waitFor(() =>
      expect(notices.at(-1)?.message).toBe('Não deu para mudar o status de Hades. Tente de novo.'),
    )
    expect(rows('Jogos a definir')).toHaveLength(3)
  })

  it('gives many games one status at once: everything under an hour', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(screen.getByRole('button', { name: 'Select the 2 games under an hour' }))
    const bar = screen.getByRole('group', { name: '2 games selected' })
    expect(within(rowOf('Celeste')).getByRole('checkbox')).toBeChecked()
    expect(within(rowOf('Hades')).getByRole('checkbox')).not.toBeChecked()

    await user.click(within(bar).getByRole('button', { name: 'Dropped' }))
    expect(titles()).toEqual(['Hades2020'])
    await waitFor(() => expect(notices.at(-1)?.message).toBe('Put 2 games in Dropped.'))
    expect(patches()).toEqual([
      {
        path: '/api/v1/entries',
        method: 'PATCH',
        body: { entries: ['celeste', 'portal'], status: 'dropped' },
      },
    ])
    expect(screen.queryByRole('group', { name: /selected/ })).not.toBeInTheDocument()
  })

  it('keeps a game I only rated, and saves the rating', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    within(rowOf('Hades')).getByRole('slider').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    await waitFor(() =>
      expect(patches()).toEqual([
        { path: '/api/v1/entries/hades', method: 'PATCH', body: { rating: 1 } },
      ]),
    )
    expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal'])
  })

  it('brings a game back with the rating it was given just before it was placed', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    within(rowOf('Hades')).getByRole('slider').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    // Placed before the rating comes to rest: leaving, the rating is saved at once.
    await user.click(within(rowOf('Hades')).getByRole('button', { name: 'Backlog' }))
    await waitFor(() => expect(notices.at(-1)?.message).toBe('Put Hades in Backlog.'))
    await waitFor(() => expect(patches()).toHaveLength(2))
    expect(patches().map((each) => each.body)).toEqual(
      expect.arrayContaining([{ rating: 1 }, { status: 'backlog' }]),
    )

    await notices.at(-1)!.actions![0]!.run()
    await waitFor(() => expect(titles()).toContain('Hades2020'))
    expect(within(rowOf('Hades')).getByRole('slider')).toHaveAttribute('aria-valuenow', '1')
  })

  it('is one stop for Tab, moved through with the arrows', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })
    const box = (title: string) => within(rowOf(title)).getByRole('checkbox')
    const backlog = (title: string) => within(rowOf(title)).getByRole('button', { name: 'Backlog' })

    expect(box('Hades')).toHaveAttribute('tabindex', '0')
    expect(box('Celeste')).toHaveAttribute('tabindex', '-1')
    expect(backlog('Celeste')).toHaveAttribute('tabindex', '-1')

    box('Hades').focus()
    await user.keyboard('{ArrowDown}')
    expect(box('Celeste')).toHaveFocus()
    expect(box('Celeste')).toHaveAttribute('tabindex', '0')
    expect(backlog('Celeste')).not.toHaveAttribute('tabindex')
    expect(box('Hades')).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{End}')
    expect(box('Portal')).toHaveFocus()
    await user.keyboard(' ')
    expect(box('Portal')).toBeChecked()

    // Placed from the keyboard, the row's place goes to the one after it.
    box('Hades').focus()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(box('Celeste')).toHaveFocus())
    expect(titles()).toEqual(['Celeste', 'Portal'])
  })

  it('says nothing is waiting, beside the tally', async () => {
    placing = { ...PLACING, games: [], tally: { ...PLACING.tally, unsorted: 0 } }
    renderWithIntl(<PlaceGames />)
    expect(
      await screen.findByText('Nothing is waiting: every game on your shelf has a status.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your shelf' })).toHaveAttribute(
      'href',
      '/en/u/ana',
    )
    expect(within(tally()).getByText('Nothing left to place.')).toBeInTheDocument()
  })

  it('asks a visitor to sign in, and comes back here after', async () => {
    who = { status: 'visitor' }
    renderWithIntl(<PlaceGames />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/sign-in?from=%2Fen%2Faccount%2Funsorted',
    )
    expect(sent).toEqual([])
  })
})
