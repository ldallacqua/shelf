import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountState } from '@/features/owner/account'
import { renderWithIntl } from '@/test/render'

import { OrganizeTabs } from './organize-tabs'
import { StoreHours } from './store-hours'

/**
 * Organize's hours tab (spec 4.7): each game whose stores report far past
 * IGDB's time, its hours beside IGDB's, the time left idle to take out, or
 * the hours kept. And the tabs it shares with placing, each with its count.
 */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let who: AccountState
vi.mock('@/features/owner/account', () => ({ useAccount: () => who }))

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

beforeEach(() => {
  who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true, waiting: 3 }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const tabs = () => within(screen.getByRole('navigation', { name: 'What to organize' }))

describe('StoreHours', () => {
  it('says what the stores count beside IGDB’s time, and takes out the time left idle', async () => {
    answer([HADES])
    renderWithIntl(<StoreHours />)
    const game = within(await screen.findByRole('group', { name: 'Hades' }))
    expect(game.getByText('Steam: 112 h · IGDB: 40 h to see everything')).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Store hours, 1 game' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await userEvent.type(game.getByRole('textbox', { name: 'Time left idle' }), '72{Enter}')
    expect(client.update).toHaveBeenCalledWith('entry-hades', { idle: 4320 })
    expect(await game.findByText('Saved: 40 h count now.')).toBeInTheDocument()
    expect(change.announceChange).toHaveBeenCalledWith({ version: 7 })
    // Answered, it stays in view, and the tab no longer counts it.
    expect(tabs().getByRole('link', { name: 'Store hours' })).toBeInTheDocument()
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

  it('says when there is none, with the way back to the shelf', async () => {
    answer([])
    renderWithIntl(<StoreHours />)
    expect(
      await screen.findByText('No game’s store hours are far past IGDB’s time now.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your shelf' })).toHaveAttribute(
      'href',
      '/en/u/ana',
    )
  })

  it('asks to sign in first, and comes back here after', () => {
    who = { status: 'visitor' }
    renderWithIntl(<StoreHours />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/sign-in?from=%2Fen%2Faccount%2Fhours',
    )
  })
})

describe('OrganizeTabs', () => {
  it('links to each tab, the current one marked, each with how many games it holds', async () => {
    const fetched = answer([HADES, { ...HADES, entryId: 'entry-celeste', title: 'Celeste' }])
    renderWithIntl(<OrganizeTabs current="unsorted" />)
    expect(tabs().getByRole('link', { name: 'Unsorted, 3 games' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await tabs().findByRole('link', { name: 'Store hours, 2 games' })).toHaveAttribute(
      'href',
      '/en/account/hours',
    )
    expect(fetched).toHaveBeenCalledWith('/api/v1/me/hours', { cache: 'no-store' })
  })

  it('says no count for a tab with nothing in it', async () => {
    const fetched = answer([])
    who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true, waiting: 0 }
    renderWithIntl(<OrganizeTabs current="unsorted" />)
    await waitFor(() => expect(fetched).toHaveBeenCalled())
    expect(tabs().getByRole('link', { name: 'Unsorted' })).toHaveTextContent(/^Unsorted$/)
    expect(tabs().getByRole('link', { name: 'Store hours' })).toHaveTextContent(/^Store hours$/)
  })
})
