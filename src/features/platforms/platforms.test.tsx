import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LinkView, SyncStep } from '@/domain/sync/link'
import { renderWithIntl } from '@/test/render'

import { Platforms } from './platforms'
import type { PlatformRow } from './sync-client'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** The account page's Platforms (ADR 003): Steam unlinked and linked, and a sync's steps. */

const LINK: LinkView = {
  source: 'steam',
  externalId: '76561190000000001',
  name: 'Ana on Steam',
  daily: true,
  linkedAt: 1,
  readAt: 2,
  syncedAt: 3,
  problem: null,
  counts: { 'on-shelf': 25, adding: 0, 'needs-you': 2, hidden: 0, notSeen: 0 },
}

const rows = (link: LinkView | null): PlatformRow[] => [
  { source: 'steam', ready: true, link },
  { source: 'playstation', ready: false, link: null },
  { source: 'xbox', ready: false, link: null },
  { source: 'nintendo', ready: false, link: null },
]

const sent: { path: string; method: string; body?: unknown }[] = []
let platforms: PlatformRow[]
let steps: SyncStep[]

beforeEach(() => {
  sent.length = 0
  steps = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/api/v1/me/platforms') return Response.json(platforms)
    if (path === '/api/v1/me/platforms/steam/sync') return Response.json(steps.shift())
    return new Response(null, { status: 404 })
  })
})
afterEach(() => vi.restoreAllMocks())

describe('Platforms', () => {
  it('offers Steam’s own sign-in, and names what comes next', async () => {
    platforms = rows(null)
    renderWithIntl(<Platforms handle="ana" />, 'pt-BR')
    const signIn = await screen.findByRole('link', { name: 'Entrar pela Steam' })
    expect(signIn).toHaveAttribute('href', '/api/v1/me/platforms/steam/connect?locale=pt-BR')
    expect(screen.getByText('PlayStation, Xbox e Nintendo vêm a seguir.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'PlayStation' })).not.toBeInTheDocument()
  })

  it('shows a linked account’s games, and what needs an answer', async () => {
    platforms = rows(LINK)
    renderWithIntl(<Platforms handle="ana" />)
    expect(await screen.findByText('25 games on your shelf from Steam')).toBeInTheDocument()
    expect(screen.getByText('Linked to Ana on Steam')).toBeInTheDocument()
    expect(screen.getByText('2 games need you')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Sync once a day' })).toBeChecked()
  })

  it('says how to fix an account that hides its games', async () => {
    platforms = rows({ ...LINK, problem: 'private' })
    renderWithIntl(<Platforms handle="ana" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Set Game details to Public/)
  })

  it('reads Steam first, then asks for steps until nothing is left', async () => {
    platforms = rows(LINK)
    const after = (added: number, remaining: number, adding: number): SyncStep => ({
      link: { ...LINK, counts: { ...LINK.counts, adding } },
      added,
      remaining,
      version: 9,
    })
    steps = [after(20, 5, 5), after(5, 0, 0)]
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('25 games came in from Steam.'),
    )
    const asked = sent.filter((each) => each.path.endsWith('/sync'))
    expect(asked.map((each) => each.body)).toEqual([{ read: true }, { read: false }])
  })

  it('asks before disconnecting, and says the games stay', async () => {
    platforms = rows(LINK)
    renderWithIntl(<Platforms handle="ana" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    const card = screen.getByRole('article')
    expect(within(card).getByText(/Your games stay on your shelf, with their hours/)).toBeVisible()
    expect(sent.some((each) => each.method === 'DELETE')).toBe(false)
  })
})
