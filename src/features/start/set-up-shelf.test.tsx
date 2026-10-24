import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Standing } from '@/domain/library/placing'
import type { LinkView, SyncStep } from '@/domain/sync/link'
import type { AccountState } from '@/features/owner/account'
import type { PlatformRow } from '@/features/platforms/sync-client'
import { renderWithIntl } from '@/test/render'

import { SetUpShelf } from './set-up-shelf'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let who: AccountState
vi.mock('@/features/owner/account', () => ({
  useAccount: () => who,
  useIsMine: () => true,
}))

/**
 * Setting a new shelf up: the platform cards as the first step, the way to
 * place what came in as the second, each checked off by what the shelf says,
 * and Steam's sign-in coming back here.
 */

const EMPTY = { playing: 0, backlog: 0, completed: 0, dropped: 0, wishlist: 0, unsorted: 0 }

const STEAM: LinkView = {
  source: 'steam',
  externalId: '76561190000000001',
  name: 'Ana on Steam',
  daily: true,
  linkedAt: 1,
  readAt: 2,
  syncedAt: 3,
  problem: null,
  counts: { 'on-shelf': 240, adding: 0, 'needs-you': 0, hidden: 0, notSeen: 0, unsorted: 180 },
}

const NINTENDO: LinkView = {
  ...STEAM,
  source: 'nintendo',
  externalId: 'a0b1c2d3e4f5a6b7',
  name: 'Ana',
  counts: { 'on-shelf': 0, adding: 0, 'needs-you': 3, hidden: 0, notSeen: 0, unsorted: 0 },
}

const rowsOf = (steam: LinkView | null, nintendo: LinkView | null = null): PlatformRow[] => [
  { source: 'steam', ready: true, link: steam },
  { source: 'playstation', ready: false, link: null },
  { source: 'xbox', ready: false, link: null },
  { source: 'nintendo', ready: true, link: nintendo },
]

const sent: { path: string; method: string }[] = []
let platforms: PlatformRow[]
let standing: Standing
let tallyFails: boolean
let steps: SyncStep[]

beforeEach(() => {
  who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true }
  sent.length = 0
  platforms = rowsOf(null)
  standing = { version: 1, tally: EMPTY }
  tallyFails = false
  steps = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    sent.push({ path, method })
    if (path === '/api/v1/me/platforms') return Response.json(platforms)
    if (path === '/api/v1/me/tally') {
      return tallyFails ? new Response(null, { status: 500 }) : Response.json(standing)
    }
    if (path.endsWith('/sync')) return Response.json(steps.shift())
    if (path.includes('/items?list=')) return Response.json([])
    return new Response(null, { status: 404 })
  })
})
afterEach(() => vi.restoreAllMocks())

const listed = () => [
  ...screen.getByRole('list', { name: 'Steps' }).querySelectorAll<HTMLElement>(':scope > li'),
]
const step = (title: string) =>
  listed().find((each) => within(each).queryByRole('heading', { level: 2, name: title }))!
const isDone = (title: string) => within(step(title)).queryByText('Done') !== null
const tallyReads = () => sent.filter((each) => each.path === '/api/v1/me/tally').length

describe('SetUpShelf', () => {
  it('asks someone signed out to sign in, and to come back here', () => {
    who = { status: 'visitor' }
    renderWithIntl(<SetUpShelf />)
    expect(screen.getByText('Sign in to set up your shelf.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/sign-in?from=%2Fen%2Faccount%2Fstart',
    )
  })

  it('opens on a new shelf with both steps to do, and Steam’s sign-in coming back here', async () => {
    renderWithIntl(<SetUpShelf />)
    expect(await screen.findByRole('link', { name: 'Sign in through Steam' })).toHaveAttribute(
      'href',
      '/api/v1/me/platforms/steam/connect?locale=en&back=start',
    )
    await screen.findByText('Games that come in without a status will wait here.')
    expect(listed()).toHaveLength(2)
    expect(isDone('Bring your games in')).toBe(false)
    expect(isDone('Say where each game stands')).toBe(false)
    expect(
      within(step('Bring your games in')).getByRole('link', { name: 'your shelf' }),
    ).toHaveAttribute('href', '/en/u/ana')
    expect(screen.getByRole('link', { name: 'See my shelf' })).toHaveAttribute('href', '/en/u/ana')
  })

  it('holds the first step open while a platform waits for an answer, and leads to placing the rest', async () => {
    platforms = rowsOf(STEAM, NINTENDO)
    standing = { version: 4, tally: { ...EMPTY, playing: 12, backlog: 48, unsorted: 180 } }
    renderWithIntl(<SetUpShelf />)

    await screen.findByText('3 games are waiting for your answer above.')
    expect(isDone('Bring your games in')).toBe(false)

    const place = step('Say where each game stands')
    expect(within(place).getByText('180 of your 240 games have no status yet.')).toBeInTheDocument()
    expect(within(place).getByRole('progressbar', { name: 'Games with a status' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    )
    expect(within(place).getByRole('link', { name: 'Place my games' })).toHaveAttribute(
      'href',
      '/en/account/unsorted',
    )
    // One way there on this page: the Steam card leaves it to the next step.
    expect(screen.queryByRole('link', { name: /to place/ })).not.toBeInTheDocument()
    expect(isDone('Say where each game stands')).toBe(false)
  })

  it('checks both steps off once every game is on the shelf with a status', async () => {
    platforms = rowsOf({ ...STEAM, counts: { ...STEAM.counts, unsorted: 0 } })
    standing = { version: 9, tally: { ...EMPTY, playing: 40, backlog: 200 } }
    renderWithIntl(<SetUpShelf />)

    await screen.findByText('All 240 of your games have a status.')
    expect(screen.getByText('240 games on your shelf.')).toBeInTheDocument()
    // The first step waits for the cards too: a platform may still have a question.
    await waitFor(() => expect(isDone('Bring your games in')).toBe(true))
    expect(isDone('Say where each game stands')).toBe(true)
    expect(screen.queryByRole('link', { name: 'Place my games' })).not.toBeInTheDocument()
  })

  it('reads the tally again as a sync puts games on the shelf', async () => {
    const user = userEvent.setup()
    platforms = rowsOf({ ...STEAM, counts: { ...STEAM.counts, 'on-shelf': 0, unsorted: 0 } })
    renderWithIntl(<SetUpShelf />)
    await screen.findByText('Games that come in without a status will wait here.')
    const before = tallyReads()

    standing = { version: 2, tally: { ...EMPTY, unsorted: 20 } }
    steps = [{ link: STEAM, added: 20, remaining: 0, version: 2 }]
    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    await screen.findByText('20 of your 20 games have no status yet.')
    expect(tallyReads()).toBeGreaterThan(before)
    expect(isDone('Bring your games in')).toBe(true)
  })

  it('says so when the tally cannot be read, and reads it again on Try again', async () => {
    const user = userEvent.setup()
    tallyFails = true
    renderWithIntl(<SetUpShelf />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Shelf could not read your shelf just now.')

    tallyFails = false
    standing = { version: 1, tally: { ...EMPTY, backlog: 3 } }
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await screen.findByText('All 3 of your games have a status.')).toBeInTheDocument()
  })
})
