import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { testGame, testLibrary } from '@/domain/library/testing'
import { Arriving, PageDrawn, SOON_MS } from '@/features/game-detail/hand-off'
import type { ShelfInfo } from '@/features/library/shelf-address'
import { messages, renderWithIntl } from '@/test/render'

import { LibraryList } from './library-list'
import { forgetAll, type HandedOver } from './store'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  state: {} as Record<string, unknown>,
  params: {} as Record<string, string>,
}))
vi.mock('next/navigation', async (actual) => ({
  ...(await actual<object>()),
  useParams: () => mocks.params,
}))
vi.mock('@/i18n/navigation', async () => ({
  ...(await import('@/test/navigation')),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('@/features/library/use-library', () => ({ useLibrary: () => mocks.state }))
vi.mock('@/features/owner/account', () => ({ useIsMine: () => false }))
vi.mock('@/features/library/use-ready', () => ({ useReadySlugs: () => null }))
vi.mock('@/features/game-detail/drawn-page', () => ({
  drawPage: ({ game }: { game: { title: string } }) => <h1>{`${game.title}, drawn`}</h1>,
  loadEditor: vi.fn(),
}))

const shelf: ShelfInfo = {
  handle: 'sample',
  name: 'Sample',
  public: true,
  files: { kind: 'public', key: 'example' },
}
const whole = testLibrary([testGame('Ember', { status: 'playing' }), testGame('Tide')])
const hand = (q = ''): HandedOver => ({
  id: 1,
  handle: 'sample',
  shelf,
  version: 1,
  library: whole,
  arrangement: { group: 'status', sort: { key: 'title', descending: false }, seed: '1', q },
})
const list = (handed = hand(), slug = 'ember') => (
  <LibraryList handle="sample" slug={slug} shelf={shelf} version={1} handed={handed} shown />
)

beforeEach(() => {
  mocks.state = { status: 'ready', library: whole }
  mocks.params = { handle: 'sample', slug: 'ember' }
  mocks.push.mockReset()
})
afterEach(forgetAll)

describe('the list beside the page', () => {
  it('draws a bounded window of a large library', () => {
    mocks.state = {
      status: 'ready',
      library: testLibrary(Array.from({ length: 1280 }, (_, i) => testGame(`Game ${i}`))),
    }
    renderWithIntl(list())
    expect(document.querySelectorAll('.beside-game').length).toBeLessThanOrEqual(24)
  })

  it('offers a retry when the library cannot be read', () => {
    const retry = vi.fn()
    mocks.state = { status: 'failed', retry }
    renderWithIntl(list({ ...hand(), library: undefined }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('marks the current game and opens another at its plain address', () => {
    renderWithIntl(list())
    expect(screen.getByRole('link', { name: 'Ember' })).toHaveAttribute('aria-current', 'page')
    const tide = screen.getByRole('link', { name: 'Tide' })
    expect(tide).toHaveAttribute('href', '/en/u/sample/game/tide')
    fireEvent.click(tide, { ctrlKey: true })
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.click(tide)
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/u/[handle]/game/[slug]',
      params: { handle: 'sample', slug: 'tide' },
    })
  })

  it('searches within the carried filter, which can be cleared', async () => {
    renderWithIntl(list(hand('status:playing')))
    expect(screen.queryByRole('link', { name: 'Tide' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Show every game/ }))
    expect(screen.getByRole('link', { name: 'Tide' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'), 'Tide')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Ember' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: 'Tide' })).toBeInTheDocument()
  })

  it('folds a group and lets the keyboard reach the next heading', () => {
    renderWithIntl(list())
    const playing = screen.getByRole('button', { name: /Playing, / })
    fireEvent.click(playing)
    expect(playing).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Ember' })).not.toBeInTheDocument()
    fireEvent.keyDown(playing, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: /Backlog, / })).toHaveFocus()
  })

  it('keeps search between games but resets it on a fresh library handover', async () => {
    const handed = hand()
    const { rerender } = renderWithIntl(list(handed))
    await userEvent.type(screen.getByRole('searchbox'), 'Tide')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        {list(handed, 'tide')}
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('searchbox')).toHaveValue('Tide')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        {list({ ...handed, id: 2 }, 'ember')}
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
})

/** The layout around the games: the list beside the page the router shows. */
const layout = (slug: string, page: string, drawn?: boolean) => (
  <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
    {list(hand(), slug)}
    <Arriving>
      <h1>{page}</h1>
      {drawn ? <PageDrawn /> : null}
    </Arriving>
  </NextIntlClientProvider>
)

describe('a game opened from the list', () => {
  it('is drawn at once while the router waits for the server, until the router lands', async () => {
    const { rerender } = renderWithIntl(layout('ember', 'Ember, from the server'))
    // The router has forgotten what a game's page looks like: it waits for the whole page.
    fireEvent.click(screen.getByRole('link', { name: 'Tide' }))
    expect(await screen.findByRole('heading', { name: 'Tide, drawn' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Ember, from the server' })).toBeNull()

    mocks.params = { handle: 'sample', slug: 'tide' }
    rerender(layout('tide', 'Tide, from the server'))
    expect(screen.getByRole('heading', { name: 'Tide, from the server' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Tide, drawn' })).toBeNull()
  })

  it('leaves the page to the router when the router draws it in time', async () => {
    const { rerender } = renderWithIntl(layout('ember', 'Ember, from the server'))
    fireEvent.click(screen.getByRole('link', { name: 'Tide' }))
    mocks.params = { handle: 'sample', slug: 'tide' }
    rerender(layout('tide', 'Tide, from the library', true))
    await act(() => new Promise((done) => setTimeout(done, SOON_MS * 2)))
    expect(screen.getByRole('heading', { name: 'Tide, from the library' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Tide, drawn' })).toBeNull()
  })

  it('gives the page back when Back cancels the move', async () => {
    renderWithIntl(layout('ember', 'Ember, from the server'))
    fireEvent.click(screen.getByRole('link', { name: 'Tide' }))
    expect(await screen.findByRole('heading', { name: 'Tide, drawn' })).toBeVisible()
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('heading', { name: 'Ember, from the server' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Tide, drawn' })).toBeNull()
  })
})
