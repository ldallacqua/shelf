import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { Activity, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { testGame, testLibrary } from '@/domain/library/testing'
import { buildFirstScreen, parseLibraryQuery } from '@/domain/library/view'
import { Arriving, PageDrawn, SOON_MS } from '@/features/game-detail/hand-off'
import { Link } from '@/test/navigation'
import { messages } from '@/test/render'

import { LibraryView } from './library-view'
import { ShelfProvider } from './shelf'
import type { ShelfInfo } from './shelf-address'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  prefetch: vi.fn(),
  state: {} as Record<string, unknown>,
}))
vi.mock('@/i18n/navigation', async () => ({
  ...(await import('@/test/navigation')),
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    prefetch: mocks.prefetch,
    refresh: vi.fn(),
  }),
}))
vi.mock('@/features/library/use-library', () => ({ useLibrary: () => mocks.state }))
vi.mock('@/features/library/use-ready', () => ({ useReadySlugs: () => null }))
vi.mock('@/features/library-beside/list-code', () => ({
  loadList: () => Promise.resolve({}),
  listCode: () => undefined,
}))
vi.mock('@/features/game-detail/drawn-page', () => ({
  drawPage: ({ game }: { game: { title: string } }) => <h1>{`${game.title}, drawn`}</h1>,
  withList: (page: ReactElement) => (
    <div className="game-layout">
      <aside aria-label="The library beside it" />
      {page}
    </div>
  ),
  loadEditor: vi.fn(),
}))

const shelf: ShelfInfo = {
  handle: 'sample',
  name: 'Sample',
  public: true,
  files: { kind: 'public', key: 'example' },
}
const library = testLibrary([testGame('Ember', { status: 'playing' }), testGame('Tide')])
const first = buildFirstScreen(library, parseLibraryQuery({ view: 'wall' }), 'en', 48)

/**
 * The router, as far as a shelf's page can tell: the page it shows, and the
 * one it keeps hidden behind. A shelf's page is the library in `Arriving`, as
 * the route draws it; a game's, what the server sent.
 */
const routed = (at: 'shelf' | 'game', drawn = false) => (
  <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
    <NuqsTestingAdapter>
      <Activity mode={at === 'shelf' ? 'visible' : 'hidden'}>
        <Arriving around="shelf">
          <ShelfProvider shelf={shelf}>
            <LibraryView first={first} stats={null} shelves={[]} />
          </ShelfProvider>
        </Arriving>
      </Activity>
      {at === 'game' ? (
        <>
          <h1>Tide, from the server</h1>
          {drawn ? <PageDrawn /> : null}
        </>
      ) : null}
      {/* As Next.js takes a link: the browser does not follow it. */}
      <Link href="/u/sample/trophies" onClick={(event) => event.preventDefault()}>
        Trophies
      </Link>
    </NuqsTestingAdapter>
  </NextIntlClientProvider>
)

const chooseTide = () => fireEvent.click(screen.getByRole('button', { name: /^Tide/ }))

beforeEach(() => {
  mocks.state = { status: 'ready', library }
  mocks.push.mockReset()
  mocks.prefetch.mockReset()
})
afterEach(() => {
  // History moving ends any game still on its way, so none outlives its test.
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})

describe('a game chosen on the shelf or the wall (spec 7.2, at once)', () => {
  it('is drawn in the shelf’s place while the router waits for the server, the shelf kept behind', async () => {
    render(routed('shelf'))
    // The router has forgotten what a game's page looks like: it waits for the whole page.
    chooseTide()
    expect(await screen.findByRole('heading', { name: 'Tide, drawn' })).toBeVisible()
    expect(mocks.push).toHaveBeenCalledOnce()
    // With the list beside it, as the layout around the games draws a game.
    expect(screen.getByRole('complementary', { name: 'The library beside it' })).toBeVisible()
    // The shelf is kept as it was, out of sight, as the router keeps a page left behind.
    expect(screen.getByRole('button', { name: /^Ember/, hidden: true })).not.toBeVisible()
  })

  it('is drawn where the window stands, so the shelf keeps its scroll for Back', async () => {
    // How far down the shelf was as the router puts the game's address up is where Back returns.
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    Object.defineProperty(window, 'scrollY', { value: 1500, configurable: true })
    try {
      render(routed('shelf'))
      chooseTide()
      const drawn = await screen.findByRole('heading', { name: 'Tide, drawn' })
      expect(drawn.closest('div[style]')).toHaveStyle({ marginTop: '1500px' })
      expect(scrollTo).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
      scrollTo.mockRestore()
    }
  })

  it('gives way to the server’s page as the router lands, and Back finds the shelf', async () => {
    const { rerender } = render(routed('shelf'))
    chooseTide()
    expect(await screen.findByRole('heading', { name: 'Tide, drawn' })).toBeVisible()

    rerender(routed('game'))
    expect(screen.getByRole('heading', { name: 'Tide, from the server' })).toBeVisible()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Tide, drawn', hidden: true })).toBeNull(),
    )

    rerender(routed('shelf'))
    expect(screen.getByRole('button', { name: /^Ember/ })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Tide, drawn', hidden: true })).toBeNull()
  })

  it('gives the shelf back when a link is followed meanwhile', async () => {
    render(routed('shelf'))
    chooseTide()
    expect(await screen.findByRole('heading', { name: 'Tide, drawn' })).toBeVisible()
    // A link Next.js takes, to the page shown or any other: the router drops the game's move.
    fireEvent.click(screen.getByRole('link', { name: 'Trophies' }))
    expect(screen.queryByRole('heading', { name: 'Tide, drawn' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Ember/ })).toBeVisible()
  })

  it('is left to the router when it draws the game in time', async () => {
    const { rerender } = render(routed('shelf'))
    chooseTide()
    await waitFor(() => expect(mocks.push).toHaveBeenCalledOnce())
    rerender(routed('game', true))
    await act(() => new Promise((done) => setTimeout(done, SOON_MS * 2)))
    expect(screen.getByRole('heading', { name: 'Tide, from the server' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Tide, drawn', hidden: true })).toBeNull()
  })

  it('teaches the router the game page’s route again as a game is reached for', () => {
    render(routed('shelf'))
    fireEvent.pointerOver(screen.getByRole('button', { name: /^Tide/ }))
    expect(mocks.prefetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/u/[handle]/game/[slug]' }),
    )
  })
})
