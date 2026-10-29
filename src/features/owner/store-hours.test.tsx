import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { StoreHours } from './store-hours'

/**
 * The account page's games whose stores report far past IGDB's time (ADR
 * 003): each one's hours beside IGDB's, the time left idle to take out, or
 * the hours kept. There only while there is one.
 */

const client = vi.hoisted(() => ({
  update: vi.fn(async () => ({ ok: true as const, value: { version: 7 } })),
}))
const change = vi.hoisted(() => ({ announceChange: vi.fn() }))
vi.mock('@/features/game-detail/edit-client', () => ({ editClient: client }))
vi.mock('@/features/owner/library-change', () => change)

const answer = (games: unknown[]) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ games }))

const HADES = {
  entryId: 'entry-hades',
  slug: 'hades',
  title: 'Hades',
  year: 2020,
  hoursReported: 112,
  sources: ['steam'],
  igdb: { hours: 40, of: 'completely' },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StoreHours', () => {
  it('says what the stores count beside IGDB’s time, and takes out the time left idle', async () => {
    answer([HADES])
    renderWithIntl(<StoreHours />)
    expect(await screen.findByRole('heading', { name: 'Hours from your stores' })).toBeVisible()
    const game = within(screen.getByRole('group', { name: 'Hades' }))
    expect(game.getByText('Steam: 112 h · IGDB: 40 h to see everything')).toBeInTheDocument()

    await userEvent.type(game.getByRole('textbox', { name: 'Time left idle' }), '72{Enter}')
    expect(client.update).toHaveBeenCalledWith('entry-hades', { idle: 4320 })
    expect(await game.findByText('Saved: 40 h count now.')).toBeInTheDocument()
    expect(change.announceChange).toHaveBeenCalledWith({ version: 7 })
  })

  it('keeps the hours as they are when asked to', async () => {
    answer([{ ...HADES, sources: ['steam', 'nintendo'], igdb: { hours: 20, of: 'normally' } }])
    renderWithIntl(<StoreHours />)
    const game = within(await screen.findByRole('group', { name: 'Hades' }))
    expect(game.getByText('Steam and Nintendo: 112 h · IGDB: 20 h to finish')).toBeInTheDocument()
    await userEvent.click(game.getByRole('button', { name: 'Keep the hours' }))
    expect(client.update).toHaveBeenCalledWith('entry-hades', { idle: 0 })
    expect(await game.findByText('Kept as they are.')).toBeInTheDocument()
    expect(game.queryByRole('button', { name: 'Keep the hours' })).not.toBeInTheDocument()
  })

  it('says why when a change is refused, and keeps the game to try again', async () => {
    answer([HADES])
    client.update.mockResolvedValueOnce({ ok: false, reason: 'failed' } as never)
    renderWithIntl(<StoreHours />)
    const game = within(await screen.findByRole('group', { name: 'Hades' }))
    await userEvent.click(game.getByRole('button', { name: 'Keep the hours' }))
    expect(await game.findByRole('alert')).toBeInTheDocument()
    expect(game.getByRole('button', { name: 'Keep the hours' })).toBeInTheDocument()
  })

  it('is not there at all while there is none', async () => {
    const fetched = answer([])
    renderWithIntl(<StoreHours />)
    await waitFor(() => expect(fetched).toHaveBeenCalled())
    expect(
      screen.queryByRole('heading', { name: 'Hours from your stores' }),
    ).not.toBeInTheDocument()
  })
})
