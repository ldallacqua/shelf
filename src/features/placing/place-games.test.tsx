import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyTally, type Placing, type UnsortedGame } from '@/domain/library/placing'
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
 * placed and staying with its status shown, changed and taken back, many
 * placed at once with Undo, a rating beside a status, a game the sync took
 * for the wrong one made the right one, and the keyboard's way through.
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
  tally: { ...emptyTally(), playing: 2, backlog: 5, completed: 1, unsorted: 3 },
  platforms: [{ id: 6, key: 'pc', name: 'PC (Microsoft Windows)', short: 'PC' }],
}

const sent: { path: string; method: string; body?: unknown }[] = []
let placing: Placing
let fails: boolean
/** What saying which game one is answers with; undefined refuses it. */
let rematched: { entryId: string; slug: string; title: string; merged: boolean } | undefined
/** What the list is read again as, after. */
let afterwards: Placing | undefined

const FOUND = [
  { igdbId: 119_133, title: 'Hades II', year: 2024, cover: null },
  { igdbId: 1_942, title: 'Hades', year: 2018, cover: null },
]

beforeEach(() => {
  who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true }
  sent.length = 0
  notices.length = 0
  placing = PLACING
  fails = false
  rematched = undefined
  afterwards = undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/api/v1/me/unsorted') return Response.json(placing)
    if (path.startsWith('/api/v1/igdb/search')) return Response.json({ results: FOUND })
    if (path.endsWith('/game') && method === 'PUT') {
      if (!rematched) return Response.json({ error: { code: 'too-many' } }, { status: 429 })
      if (afterwards) placing = afterwards
      return Response.json({ version: 9, ...rematched })
    }
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
const chip = (title: string, status: string) =>
  within(rowOf(title)).getByRole('button', { name: status })
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

  it('places a game with one tap: it stays, showing its status, and the tally moves', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(chip('Hades', 'Backlog'))
    // It stays where it was, its status shown, until the page is opened again.
    expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal'])
    expect(chip('Hades', 'Backlog')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Hades', 'Playing')).toHaveAttribute('aria-pressed', 'false')
    expect(within(tally()).getByText('2 games left to place.')).toBeInTheDocument()
    expect(within(tally()).getByText('6')).toBeInTheDocument()
    await waitFor(() =>
      expect(patches()).toEqual([
        { path: '/api/v1/entries/hades', method: 'PATCH', body: { status: 'backlog' } },
      ]),
    )
    // What changed is in sight: nothing more is said.
    expect(notices).toEqual([])
  })

  it('changes a wrong status with one tap, and takes it back with its own', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(chip('Hades', 'Backlog'))
    await user.click(chip('Hades', 'Completed'))
    expect(chip('Hades', 'Completed')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Hades', 'Backlog')).toHaveAttribute('aria-pressed', 'false')
    // Out of Backlog and into Completed: Backlog is back to its 5.
    expect(within(tally()).getByText('5')).toBeInTheDocument()
    expect(within(tally()).getByText('2 games left to place.')).toBeInTheDocument()

    await user.click(chip('Hades', 'Completed'))
    expect(chip('Hades', 'Completed')).toHaveAttribute('aria-pressed', 'false')
    expect(within(tally()).getByText('3 games left to place.')).toBeInTheDocument()
    await waitFor(() =>
      expect(patches().map((each) => each.body)).toEqual([
        { status: 'backlog' },
        { status: 'completed' },
        { status: 'unsorted' },
      ]),
    )
  })

  it('takes the status back, saying so, when placing fails', async () => {
    fails = true
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />, 'pt-BR')
    await screen.findByRole('list', { name: 'Jogos a definir' })
    const first = rows('Jogos a definir')[0]!
    await user.click(within(first).getByRole('button', { name: 'Zerado' }))
    await waitFor(() =>
      expect(notices.at(-1)?.message).toBe('Não deu para mudar o status de Hades. Tente de novo.'),
    )
    expect(rows('Jogos a definir')).toHaveLength(3)
    expect(within(first).getByRole('button', { name: 'Zerado' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('Faltam 3 jogos para organizar.')).toBeInTheDocument()
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
    expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal'])
    expect(chip('Celeste', 'Dropped')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Portal', 'Dropped')).toHaveAttribute('aria-pressed', 'true')
    expect(within(tally()).getByText('1 game left to place.')).toBeInTheDocument()
    await waitFor(() => expect(notices.at(-1)?.message).toBe('Put 2 games in Dropped.'))
    expect(patches()).toEqual([
      {
        path: '/api/v1/entries',
        method: 'PATCH',
        body: { entries: ['celeste', 'portal'], status: 'dropped' },
      },
    ])
    expect(screen.queryByRole('group', { name: /selected/ })).not.toBeInTheDocument()
    // What "select" offers now is the one game still waiting.
    expect(screen.queryByRole('button', { name: /under an hour/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select the 1 game' })).toBeInTheDocument()

    await notices.at(-1)!.actions![0]!.run()
    await waitFor(() => expect(chip('Celeste', 'Dropped')).toHaveAttribute('aria-pressed', 'false'))
    expect(patches().at(-1)).toEqual({
      path: '/api/v1/entries',
      method: 'PATCH',
      body: { entries: ['celeste', 'portal'], status: 'unsorted' },
    })
    expect(notices.at(-1)?.message).toBe('2 games are as they were.')
    expect(within(tally()).getByText('3 games left to place.')).toBeInTheDocument()
  })

  it('puts each game back as it was on Undo, one placed alone before included', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(chip('Hades', 'Backlog'))
    await user.click(within(rowOf('Hades')).getByRole('checkbox'))
    await user.click(within(rowOf('Celeste')).getByRole('checkbox'))
    const bar = screen.getByRole('group', { name: '2 games selected' })
    await user.click(within(bar).getByRole('button', { name: 'Wishlist' }))
    await waitFor(() => expect(notices.at(-1)?.message).toBe('Put 2 games in Wishlist.'))

    await notices.at(-1)!.actions![0]!.run()
    await waitFor(() => expect(chip('Hades', 'Backlog')).toHaveAttribute('aria-pressed', 'true'))
    expect(chip('Celeste', 'Wishlist')).toHaveAttribute('aria-pressed', 'false')
    expect(patches().slice(-2)).toEqual([
      { path: '/api/v1/entries', method: 'PATCH', body: { entries: ['hades'], status: 'backlog' } },
      {
        path: '/api/v1/entries',
        method: 'PATCH',
        body: { entries: ['celeste'], status: 'unsorted' },
      },
    ])
    expect(within(tally()).getByText('2 games left to place.')).toBeInTheDocument()
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

  it('keeps a game with its rating and its status, whichever comes first', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(chip('Hades', 'Backlog'))
    within(rowOf('Hades')).getByRole('slider').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    await waitFor(() => expect(patches()).toHaveLength(2))
    expect(patches().map((each) => each.body)).toEqual([{ status: 'backlog' }, { rating: 1 }])
    expect(within(rowOf('Hades')).getByRole('slider')).toHaveAttribute('aria-valuenow', '1')
    expect(chip('Hades', 'Backlog')).toHaveAttribute('aria-pressed', 'true')
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

    // Placed from the keyboard, the row stays, and focus with it: past its title, "Not this
    // game" and its rating, the first status.
    box('Hades').focus()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(chip('Hades', 'Playing')).toHaveFocus()
    expect(chip('Hades', 'Playing')).toHaveAttribute('aria-pressed', 'true')
    expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal'])
  })

  it('makes a game the sync took for the wrong one the game I pick, keeping its place', async () => {
    const user = userEvent.setup()
    rematched = { entryId: 'hades', slug: 'hades-ii', title: 'Hades II', merged: false }
    afterwards = {
      ...PLACING,
      games: PLACING.games.map((each) =>
        each.entryId === 'hades'
          ? { ...each, slug: 'hades-ii', title: 'Hades II', year: 2024 }
          : each,
      ),
    }
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    const open = within(rowOf('Hades')).getByRole('button', { name: 'Not this game' })
    await user.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'true')
    // Searched at once for the title the shelf has.
    expect(
      within(rowOf('Hades')).getByRole('textbox', { name: 'Search IGDB for Hades' }),
    ).toHaveValue('Hades')
    await user.click(
      await within(rowOf('Hades')).findByRole('button', { name: 'This one: Hades II (2024)' }),
    )

    await waitFor(() =>
      expect(notices.at(-1)?.message).toBe('It is Hades II now, with its copy and hours.'),
    )
    expect(sent.find((each) => each.method === 'PUT')).toEqual({
      path: '/api/v1/entries/hades/game',
      method: 'PUT',
      body: { igdbId: 119_133 },
    })
    expect(titles()).toEqual(['Hades II2024', 'Celeste', 'Portal'])
    expect(within(rowOf('Hades II')).getByRole('link', { name: 'Hades II' })).toHaveAttribute(
      'href',
      '/en/u/ana/game/hades-ii',
    )
    expect(within(rowOf('Hades II')).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('takes a game out of the list when it folds into one already on my shelf', async () => {
    const user = userEvent.setup()
    rematched = { entryId: 'elsewhere', slug: 'hades', title: 'Hades', merged: true }
    afterwards = {
      ...PLACING,
      games: PLACING.games.filter((each) => each.entryId !== 'celeste'),
      tally: { ...PLACING.tally, unsorted: 2 },
    }
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })

    await user.click(within(rowOf('Celeste')).getByRole('button', { name: 'Not this game' }))
    await user.click(
      await within(rowOf('Celeste')).findByRole('button', { name: 'This one: Hades (2018)' }),
    )

    await waitFor(() =>
      expect(notices.at(-1)?.message).toBe(
        'Hades was on your shelf already: the copy and its hours joined it.',
      ),
    )
    expect(titles()).toEqual(['Hades2020', 'Portal'])
    expect(within(tally()).getByText('2 games left to place.')).toBeInTheDocument()
  })

  it('keeps the game as it was, saying why, when it cannot be changed', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })
    await user.click(within(rowOf('Hades')).getByRole('button', { name: 'Not this game' }))
    await user.click(
      await within(rowOf('Hades')).findByRole('button', { name: 'This one: Hades II (2024)' }),
    )
    await waitFor(() =>
      expect(notices.at(-1)?.message).toBe(
        'You have done a lot of that this hour. Wait a while, then try again.',
      ),
    )
    expect(titles()).toEqual(['Hades2020', 'Celeste', 'Portal'])
  })

  it('offers no other game for one given a status here: placed, it is what it is', async () => {
    const user = userEvent.setup()
    renderWithIntl(<PlaceGames />)
    await screen.findByRole('list', { name: 'Unsorted games' })
    await user.click(chip('Hades', 'Backlog'))
    expect(within(rowOf('Hades')).queryByRole('button', { name: 'Not this game' })).toBeNull()
    await user.click(chip('Hades', 'Backlog'))
    expect(
      within(rowOf('Hades')).getByRole('button', { name: 'Not this game' }),
    ).toBeInTheDocument()
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
