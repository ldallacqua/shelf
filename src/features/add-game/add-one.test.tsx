import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AddInput, AddSteamInput, Candidate } from '@/domain/library/adding'
import { renderWithIntl } from '@/test/render'

import type { AddActions } from './actions'
import { AddOne } from './add-one'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
vi.mock('@/features/owner/account', () => ({
  signedInAccount: () => ({ handle: 'sample', name: 'Sample' }),
}))
const client = vi.hoisted(() => ({
  bringBack: vi.fn(async (entryId: string) => ({
    ok: true as const,
    value: { version: 9, slug: entryId, title: 'Tsukihime: A Piece of Blue Glass Moon' },
  })),
}))
vi.mock('@/features/game-detail/edit-client', () => ({ editClient: client }))
vi.mock('@/features/owner/library-change', () => ({ announceChange: vi.fn() }))

/**
 * Adding a game to the wishlist (spec 4.1 and 7.5): it asks where I want it
 * instead of where I own it, and needs neither.
 */

const SWITCH = { id: 130, key: 'switch', name: 'Nintendo Switch', short: 'Switch' }
const PS4 = { id: 48, key: 'ps4', name: 'PlayStation 4', short: 'PS4' }

const actions = (added: AddInput[], archived?: string): AddActions => ({
  search: async () => ({
    ok: true,
    value: {
      results: [
        {
          igdbId: 149215,
          slug: 'tsukihime-a-piece-of-blue-glass-moon',
          title: 'Tsukihime: A Piece of Blue Glass Moon',
          year: 2021,
          kind: 'main',
          platforms: [48, 130],
          alsoOn: [],
          ports: [],
          ...(archived
            ? {
                onShelf: {
                  slug: 'tsukihime-a-piece-of-blue-glass-moon',
                  title: 'Tsukihime: A Piece of Blue Glass Moon',
                  archived,
                },
              }
            : {}),
        },
      ],
      platforms: [PS4, SWITCH],
      habits: { order: [], formats: {} },
    },
  }),
  grouping: async () => ({ ok: true, value: { action: 'new' } }),
  add: async (input) => {
    added.push(input)
    return { ok: false, reason: 'failed' }
  },
  undo: async () => ({ ok: true, value: 1 }),
  steamLink: async () => ({ ok: false, reason: 'not-allowed' }),
  addSteam: async () => ({ ok: false, reason: 'not-allowed' }),
})

const choose = async (added: AddInput[]) => {
  renderWithIntl(<AddOne actions={actions(added)} onAdded={vi.fn()} onOpenOwned={vi.fn()} />)
  await userEvent.type(screen.getByRole('combobox', { name: 'Search IGDB' }), 'tsukihime')
  await userEvent.click(await screen.findByRole('option', { name: /Tsukihime/ }))
  await userEvent.click(screen.getByRole('radio', { name: 'Wishlist' }))
}

describe('AddOne, onto the wishlist (spec 7.5)', () => {
  it('asks where I want it, and sends it with no copy', async () => {
    const added: AddInput[] = []
    await choose(added)
    expect(screen.queryByRole('group', { name: 'Platforms owned' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nintendo Switch' }))
    expect(screen.getByRole('button', { name: 'Nintendo Switch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(added).toEqual([
      expect.objectContaining({ status: 'wishlist', copies: [], wanted: [130] }),
    ])
  })

  it('needs no platform at all', async () => {
    const added: AddInput[] = []
    await choose(added)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(added).toEqual([expect.objectContaining({ status: 'wishlist', copies: [] })])
    expect(added[0]).not.toHaveProperty('wanted')
  })
})

describe('AddOne, finding a game I archived (spec 7.4)', () => {
  it('marks it archived, and offers to bring it back rather than add it again', async () => {
    const added: AddInput[] = []
    const opened = vi.fn()
    renderWithIntl(
      <AddOne actions={actions(added, 'entry-1')} onAdded={vi.fn()} onOpenOwned={opened} />,
    )
    await userEvent.type(screen.getByRole('combobox', { name: 'Search IGDB' }), 'tsukihime')
    const result = await screen.findByRole('option', { name: /Tsukihime/ })
    expect(result).toHaveTextContent('Archived')
    await userEvent.click(result)
    expect(screen.getByText(/is in your archive/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Bring back' }))
    expect(client.bringBack).toHaveBeenCalledWith('entry-1')
    expect(opened).toHaveBeenCalled()
    expect(added).toEqual([])
  })
})

describe('AddOne, while it searches (spec 4.1)', () => {
  it('draws results’ ghosts, not the word, before any have come', async () => {
    const held: AddActions = { ...actions([]), search: () => new Promise(() => {}) }
    const { container } = renderWithIntl(
      <AddOne actions={held} onAdded={vi.fn()} onOpenOwned={vi.fn()} />,
    )
    expect(container.querySelector('.ghost')).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox', { name: 'Search IGDB' }), 'tsukihime')
    expect(await screen.findByText('Searching…')).toHaveClass('sr-only')
    expect(container.querySelector('.ghost')).toBeInTheDocument()
  })
})

describe('AddOne, from a Steam link (ADR 006)', () => {
  const LINK = 'https://store.steampowered.com/app/2000001/A_Game/?curator_clanid=1'
  const PC = { id: 6, key: 'pc', name: 'PC', short: 'PC' }
  const game = (over: Partial<Candidate> = {}): Candidate => ({
    igdbId: 0,
    slug: '',
    title: 'AGame',
    year: 2024,
    kind: 'main',
    platforms: [6],
    alsoOn: [],
    ports: [],
    steam: { appId: '2000001', adult: false, known: false },
    ...over,
  })
  const reading = (candidate: Candidate, added: AddSteamInput[] = []): AddActions => ({
    ...actions([]),
    search: () => {
      throw new Error('A Steam link was searched for on IGDB')
    },
    steamLink: async () => ({
      ok: true,
      value: {
        kind: 'game',
        answer: {
          results: [candidate],
          platforms: [PC],
          habits: { order: [], formats: {} },
        },
      },
    }),
    addSteam: async (input) => {
      added.push(input)
      return { ok: false, reason: 'failed' }
    },
  })
  const paste = async (given: AddActions) => {
    renderWithIntl(<AddOne actions={given} onAdded={vi.fn()} onOpenOwned={vi.fn()} />)
    const field = screen.getByRole('combobox', { name: 'Search IGDB' })
    await userEvent.click(field)
    await userEvent.paste(LINK)
    return field
  }

  it('shows the game as a result, and sends the app with the title as I wrote it', async () => {
    const added: AddSteamInput[] = []
    await paste(reading(game(), added))
    const result = await screen.findByRole('option', { name: /AGame/ })
    expect(result).toHaveTextContent('from Steam')
    await userEvent.click(result)
    const title = screen.getByRole('textbox', { name: 'Title on every shelf' })
    await userEvent.clear(title)
    await userEvent.type(title, 'A Game')
    await userEvent.click(screen.getByRole('radio', { name: 'Wishlist' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(added).toEqual([
      expect.objectContaining({
        appId: '2000001',
        title: 'A Game',
        status: 'wishlist',
        copies: [],
      }),
    ])
  })

  it('offers no title for a game a moderator already added, and sends none', async () => {
    const added: AddSteamInput[] = []
    await paste(reading(game({ steam: { appId: '2000001', adult: false, known: true } }), added))
    await userEvent.click(await screen.findByRole('option', { name: /AGame/ }))
    expect(screen.queryByRole('textbox', { name: 'Title on every shelf' })).not.toBeInTheDocument()
    expect(screen.getByText(/already added/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(added[0]).not.toHaveProperty('title')
  })

  it('says what becomes of a game for adults', async () => {
    await paste(reading(game({ steam: { appId: '2000001', adult: true, known: false } })))
    await userEvent.click(await screen.findByRole('option', { name: /AGame/ }))
    expect(screen.getByText(/keeps only its cover/)).toBeInTheDocument()
  })

  it('tells anyone else only a moderator can', async () => {
    await paste({
      ...actions([]),
      search: () => {
        throw new Error('A Steam link was searched for on IGDB')
      },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a moderator')
  })

  it('searches for a game IGDB has instead', async () => {
    const search = vi.fn(actions([]).search)
    await paste({
      ...actions([]),
      search,
      steamLink: async () => ({ ok: true, value: { kind: 'igdb', title: 'Tsukihime' } }),
    })
    expect(await screen.findByRole('option', { name: /Tsukihime/ })).toBeInTheDocument()
    expect(search).toHaveBeenCalledWith('Tsukihime')
  })

  it('says a page that is no game is not one', async () => {
    await paste({
      ...actions([]),
      steamLink: async () => ({ ok: true, value: { kind: 'not-a-game', title: 'A Soundtrack' } }),
    })
    expect(await screen.findByText(/is not a game/)).toBeInTheDocument()
  })
})
