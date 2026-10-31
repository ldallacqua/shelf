import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArchivedGame } from '@/domain/library/editing'
import type { AccountState } from '@/features/owner/account'
import { renderWithIntl } from '@/test/render'

import { Archived } from './archived'

/**
 * Organize's archived tab (spec 7.4), the one place archived games are
 * listed: each with its platforms and Bring back, a search once there are
 * many, 50 drawn at a time, and a word when there is none.
 */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let who: AccountState
vi.mock('@/features/owner/account', () => ({ useAccount: () => who }))

const client = vi.hoisted(() => ({
  bringBack: vi.fn(async (entryId: string) => ({
    ok: true as const,
    value: { version: 5, slug: entryId, title: 'Hades' },
  })),
}))
vi.mock('@/features/game-detail/edit-client', () => ({ editClient: client }))
vi.mock('@/features/owner/library-change', () => ({
  announceChange: vi.fn(),
  useLibraryChange: () => undefined,
}))

const answer = (games: ArchivedGame[]) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ games }))

const HADES: ArchivedGame = {
  entryId: 'hades',
  slug: 'hades',
  title: 'Hades',
  year: 2020,
  platforms: ['Switch'],
}

/** Many games, each its own: Game 1, Game 2… */
const many = (count: number): ArchivedGame[] =>
  Array.from({ length: count }, (_, at) => ({
    entryId: `game-${at + 1}`,
    slug: `game-${at + 1}`,
    title: `Game ${at + 1}`,
    platforms: [],
  }))

const list = () => within(screen.getByRole('list', { name: 'Archived games' }))
const tabs = () => within(screen.getByRole('navigation', { name: 'What to organize' }))

beforeEach(() => {
  who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true, waiting: 0 }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Archived', () => {
  it('lists each archived game with its platforms, and brings one back', async () => {
    answer([HADES])
    renderWithIntl(<Archived />)
    await screen.findByRole('list', { name: 'Archived games' })
    expect(list().getByText('On Switch')).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Archived, 1 game' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent.click(list().getByRole('button', { name: 'Bring back' }))
    expect(client.bringBack).toHaveBeenCalledWith('hades')
    // Back, it stays in view saying so, and the tab no longer counts it.
    expect(await list().findByText('Hades is back on your shelf.')).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Archived' })).toBeInTheDocument()
  })

  it('offers a search among many, and says when nothing matches', async () => {
    answer([HADES, ...many(11)])
    renderWithIntl(<Archived />)
    const search = await screen.findByRole('searchbox', { name: 'Search the archive' })
    await userEvent.type(search, 'hadés')
    expect(
      list()
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining('Hades2020')])
    await userEvent.clear(search)
    await userEvent.type(search, 'zelda')
    expect(screen.getByText('No archived game matches “zelda”.')).toBeInTheDocument()
  })

  it('draws 50 at first, and 50 more at a time', async () => {
    answer(many(120))
    renderWithIntl(<Archived />)
    await screen.findByRole('list', { name: 'Archived games' })
    expect(list().getAllByRole('listitem')).toHaveLength(50)
    await userEvent.click(screen.getByRole('button', { name: 'Show 50 more' }))
    expect(list().getAllByRole('listitem')).toHaveLength(100)
    await userEvent.click(screen.getByRole('button', { name: 'Show 20 more' }))
    expect(list().getAllByRole('listitem')).toHaveLength(120)
    expect(screen.queryByRole('button', { name: /^Show/ })).not.toBeInTheDocument()
  })

  it('has no search for a few', async () => {
    answer([HADES])
    renderWithIntl(<Archived />)
    await screen.findByRole('list', { name: 'Archived games' })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('says how a game gets here when none is archived', async () => {
    answer([])
    renderWithIntl(<Archived />)
    expect(
      await screen.findByText(/Nothing is archived\. Archive a game you will never play/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your shelf' })).toHaveAttribute(
      'href',
      '/en/u/ana',
    )
  })

  it('asks to sign in first, and comes back here after', () => {
    who = { status: 'visitor' }
    renderWithIntl(<Archived />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/sign-in?from=%2Fen%2Faccount%2Farchived',
    )
  })
})

describe('Archived, on its way', () => {
  it('draws its rows’ shape while it asks whose account this is, and reads nothing yet', () => {
    who = { status: 'checking' }
    const fetching = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const { container } = renderWithIntl(<Archived />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading your games…')
    expect(container.querySelector('[aria-busy="true"] .ghost')).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Archived' })).toHaveAttribute('aria-current', 'page')
    expect(fetching).not.toHaveBeenCalled()
  })

  it('holds each count’s place with a ghost while it is read', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderWithIntl(<Archived />)
    expect(
      tabs().getByRole('link', { name: 'Archived' }).querySelector('.ghost'),
    ).toBeInTheDocument()
    expect(
      tabs().getByRole('link', { name: 'Store hours' }).querySelector('.ghost'),
    ).toBeInTheDocument()
    // How many wait is known with the account.
    expect(tabs().getByRole('link', { name: 'Unsorted' }).querySelector('.ghost')).toBeNull()
  })

  it('leaves no ghost behind a read that failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(null, { status: 500 }),
    )
    const { container } = renderWithIntl(<Archived />)
    await screen.findByRole('alert')
    await waitFor(() => expect(container.querySelector('.ghost')).not.toBeInTheDocument())
  })
})
