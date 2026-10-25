import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AddInput } from '@/domain/library/adding'
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
