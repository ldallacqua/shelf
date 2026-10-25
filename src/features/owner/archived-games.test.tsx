import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ArchivedGame } from '@/domain/library/editing'
import { renderWithIntl } from '@/test/render'

import { ArchivedGames } from './archived-games'

/**
 * The account page's list of archived games (spec 7.4): the one place they
 * are listed, there only while one is, each with Bring back.
 */

const client = vi.hoisted(() => ({
  bringBack: vi.fn(async (entryId: string) => ({
    ok: true as const,
    value: { version: 5, slug: entryId, title: 'Hades' },
  })),
}))
vi.mock('@/features/game-detail/edit-client', () => ({ editClient: client }))
vi.mock('@/features/owner/library-change', () => ({ announceChange: vi.fn() }))

const answer = (games: ArchivedGame[]) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ games }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ArchivedGames', () => {
  it('lists each archived game with its platforms, and brings one back', async () => {
    answer([{ entryId: 'hades', slug: 'hades', title: 'Hades', year: 2020, platforms: ['Switch'] }])
    renderWithIntl(<ArchivedGames />)
    expect(await screen.findByRole('heading', { name: 'Archived games' })).toBeInTheDocument()
    expect(screen.getByText('On Switch')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Bring back' }))
    expect(client.bringBack).toHaveBeenCalledWith('hades')
    expect(await screen.findAllByText('Hades is back on your shelf.')).not.toHaveLength(0)
  })

  it('is not there at all while nothing is archived', async () => {
    const fetched = answer([])
    renderWithIntl(<ArchivedGames />)
    await waitFor(() => expect(fetched).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Archived games' })).not.toBeInTheDocument()
  })
})
