import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Library } from '@/domain/library/library'
import { emptyTally, type Standing } from '@/domain/library/placing'
import { encodeLibrary } from '@/domain/library/snapshot'
import { testGame, testLibrary } from '@/domain/library/testing'
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
 * Setting a shelf up (spec 4.6): where I play, my games in, my colors, my games sorted, then
 * ready. Each step is an entry in the browser's history, the flow remembers where it stood on
 * this device, and going through it again, from Settings, keeps every choice.
 */

const EMPTY = emptyTally()

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
let library: Library | undefined

const KEY = 'shelf:setup:ana'
const remembered = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown

const at = (address: string) => window.history.replaceState(null, '', address)

beforeEach(() => {
  who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true }
  sent.length = 0
  platforms = rowsOf(null)
  standing = { version: 1, tally: EMPTY }
  tallyFails = false
  steps = []
  library = undefined
  window.localStorage.clear()
  at('/en/account/start')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    sent.push({ path, method })
    if (path === '/api/v1/me/platforms') return Response.json(platforms)
    if (path === '/api/v1/me/tally') {
      return tallyFails ? new Response(null, { status: 500 }) : Response.json(standing)
    }
    if (path === '/api/v1/me/library') {
      return library ? Response.json(encodeLibrary(library)) : new Response(null, { status: 404 })
    }
    if (path.endsWith('/sync')) return Response.json(steps.shift())
    if (path.includes('/items?list=')) return Response.json([])
    return new Response(null, { status: 404 })
  })
})
afterEach(() => vi.restoreAllMocks())

const stepTitle = async (name: string) =>
  screen.findByRole('heading', { level: 2, name }, { timeout: 2000 })
const progress = () => screen.getByRole('navigation', { name: 'Setup steps' })
const stepButton = (name: RegExp) => within(progress()).getByRole('button', { name })
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

  it('opens a new shelf on where I play, with four steps ahead and the way out', async () => {
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Where do you play?')
    expect(window.location.hash).toBe('#play')
    expect(within(progress()).getAllByRole('button')).toHaveLength(4)
    expect(stepButton(/Where you play/)).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('link', { name: 'Finish later' })).toHaveAttribute('href', '/en/u/ana')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('offers only the platforms where I play, and adding by title first when no sync reaches them', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Where do you play?')

    await user.click(screen.getByRole('checkbox', { name: 'PC' }))
    expect(screen.getByRole('checkbox', { name: 'PC' })).toBeChecked()
    expect(stepButton(/Where you play, done/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await stepTitle('Bring your games in')).toHaveFocus()
    expect(window.location.hash).toBe('#bring')
    expect(await screen.findByRole('link', { name: 'Sign in through Steam' })).toHaveAttribute(
      'href',
      '/api/v1/me/platforms/steam/connect?locale=en&back=start',
    )
    expect(screen.queryByText('Link Nintendo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search for a game' })).toBeInTheDocument()

    // Only PlayStation: no sync reaches it, so adding by title leads, and both platforms show.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await stepTitle('Where do you play?')
    await user.click(screen.getByRole('checkbox', { name: 'PC' }))
    await user.click(screen.getByRole('checkbox', { name: 'PlayStation' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await stepTitle('Bring your games in')
    expect(
      screen.getByText(/PlayStation, Xbox and games on a real shelf come in by title/),
    ).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Sign in through Steam' })).toBeInTheDocument()
  })

  it('remembers where it stood and where I play, for this account on this device', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithIntl(<SetUpShelf />)
    await stepTitle('Where do you play?')
    await user.click(screen.getByRole('checkbox', { name: 'Nintendo Switch' }))
    // Done once a place is chosen: no Skip, only Continue.
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await stepTitle('Bring your games in')
    expect(remembered()).toEqual({ step: 'bring', places: ['switch'], looked: false })
    unmount()

    at('/en/account/start')
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Bring your games in')
  })

  it('starts again from where I play when Settings asks, keeping every choice', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ step: 'ready', places: ['pc', 'xbox'], looked: true }),
    )
    platforms = rowsOf(STEAM)
    at('/en/account/start#play')
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Where do you play?')
    expect(screen.getByRole('checkbox', { name: 'PC' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Xbox' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Nintendo Switch' })).not.toBeChecked()
    expect(stepButton(/Your colors, done/)).toBeInTheDocument()
    await waitFor(() =>
      expect(remembered()).toEqual({ step: 'play', places: ['pc', 'xbox'], looked: true }),
    )
  })

  it('takes where I play from a platform already linked', async () => {
    platforms = rowsOf(null, NINTENDO)
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Where do you play?')
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Nintendo Switch' })).toBeChecked(),
    )
  })

  it('comes back from Steam’s sign-in to bringing games in', async () => {
    platforms = rowsOf(STEAM)
    standing = { version: 2, tally: { ...EMPTY, unsorted: 240 } }
    at('/en/account/start?steam=linked')
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Bring your games in')
    expect(await screen.findByText('240 games on your shelf.')).toBeInTheDocument()
  })

  it('holds bringing games in open while a platform waits for an answer', async () => {
    platforms = rowsOf(STEAM, NINTENDO)
    standing = { version: 4, tally: { ...EMPTY, playing: 12, backlog: 48, unsorted: 180 } }
    at('/en/account/start#bring')
    renderWithIntl(<SetUpShelf />)
    await screen.findByText('3 games are waiting for your answer above.')
    // Not done: its name alone.
    expect(stepButton(/^Your games$/)).toBeInTheDocument()
  })

  it('leads to placing the games with no status, and on to ready', async () => {
    const user = userEvent.setup()
    platforms = rowsOf(STEAM)
    standing = { version: 4, tally: { ...EMPTY, playing: 12, backlog: 48, unsorted: 180 } }
    at('/en/account/start#sort')
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Say where each game stands')
    expect(await screen.findByText('180 of your 240 games have no status yet.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Games with a status' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    )
    expect(screen.getByRole('link', { name: 'Place my games' })).toHaveAttribute(
      'href',
      '/en/account/unsorted',
    )

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await stepTitle('Your shelf is ready.')
    expect(screen.getByText('240 games are on it, lit and in their cases.')).toBeInTheDocument()
    expect(
      screen.getByText('240 games on your shelf, 180 waiting for a status'),
    ).toBeInTheDocument()
    expect(screen.getByText('Linked: Steam')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See my shelf' })).toHaveAttribute('href', '/en/u/ana')
    expect(screen.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      '/api/desktop/windows',
    )
    expect(screen.getByRole('link', { name: 'Try it on my shelf' })).toHaveAttribute(
      'href',
      '/en/u/ana?q=status%3Abacklog+length%3A%3C10',
    )
  })

  it('stands my own games on its shelves, the ones most played first, never an empty ledge', async () => {
    platforms = rowsOf(STEAM)
    standing = { version: 4, tally: { ...EMPTY, playing: 2, backlog: 1 } }
    library = testLibrary([
      testGame('Celeste', { cover: 'celeste', minutes: 300 }),
      testGame('Hades', { cover: 'hades', minutes: 4000 }),
      testGame('Wished', { cover: 'wished', status: 'wishlist' }),
    ])
    at('/en/account/start#ready')
    const { container } = renderWithIntl(<SetUpShelf />)
    await stepTitle('Your shelf is ready.')
    await waitFor(() =>
      expect(
        [...container.querySelectorAll('.setup-ready-shelf img')].map((image) =>
          image.getAttribute('alt'),
        ),
      ).toEqual(['Hades', 'Celeste']),
    )
    // The shelf is a picture: the summary says the same in words.
    expect(container.querySelector('.setup-ready-shelf')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('3 games on your shelf')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back' }))
    await stepTitle('Say where each game stands')
    await waitFor(() =>
      expect(
        [...container.querySelectorAll('.setup-preview img')].map((image) =>
          image.getAttribute('alt'),
        ),
      ).toEqual(['Hades', 'Celeste']),
    )
  })

  it('checks bringing in and sorting off once every game is on the shelf with a status', async () => {
    platforms = rowsOf({ ...STEAM, counts: { ...STEAM.counts, unsorted: 0 } })
    standing = { version: 9, tally: { ...EMPTY, playing: 40, backlog: 200 } }
    at('/en/account/start#sort')
    renderWithIntl(<SetUpShelf />)
    await screen.findByText('All 240 of your games have a status.')
    await waitFor(() => expect(stepButton(/Your games, done/)).toBeInTheDocument())
    expect(stepButton(/Statuses, done/)).toBeInTheDocument()
  })

  it('goes back a step with the browser’s Back', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SetUpShelf />)
    await stepTitle('Where do you play?')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await stepTitle('Bring your games in')

    act(() => {
      window.history.replaceState(null, '', '#play')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await stepTitle('Where do you play?')
  })

  it('reads the tally again as a sync puts games on the shelf', async () => {
    const user = userEvent.setup()
    platforms = rowsOf({ ...STEAM, counts: { ...STEAM.counts, 'on-shelf': 0, unsorted: 0 } })
    at('/en/account/start#bring')
    renderWithIntl(<SetUpShelf />)
    await screen.findByText('No games on your shelf yet.')
    const before = tallyReads()

    standing = { version: 2, tally: { ...EMPTY, unsorted: 20 } }
    steps = [{ link: STEAM, added: 20, remaining: 0, version: 2 }]
    await user.click(await screen.findByRole('button', { name: 'Sync now' }))

    await screen.findByText('20 games on your shelf.')
    expect(tallyReads()).toBeGreaterThan(before)
  })

  it('says so when the tally cannot be read, and reads it again on Try again', async () => {
    const user = userEvent.setup()
    tallyFails = true
    at('/en/account/start#sort')
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

describe('SetUpShelf, on its way', () => {
  it('draws the first step’s words while it asks whose account this is, and reads nothing yet', () => {
    who = { status: 'checking' }
    const { container } = renderWithIntl(<SetUpShelf />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking who you are…')
    expect(screen.getByText('Where do you play?')).toBeInTheDocument()
    expect(container.querySelectorAll('.ghost').length).toBeGreaterThan(0)
    expect(sent).toEqual([])
  })
})
