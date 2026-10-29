import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Accounts from '@/features/owner/account'
import { setPathname } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'

import { EmptyLedge } from './empty-ledge'
import { Footer } from './footer'
import { Header } from './header'
import { MobileNav } from './mobile-nav'
import { NavLinks } from './nav-links'
import { NavigationProgress } from './navigation-progress'
import { MAIN_ID, SkipLink } from './skip-link'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** The page: its real address, and the handle in it when it is a shelf's. */
const page = vi.hoisted(() => ({ path: '/en', params: {} as Record<string, string> }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useParams: () => page.params,
  usePathname: () => page.path,
}))

/** Who the browser has found is here. */
const who = vi.hoisted(() => ({
  account: { status: 'visitor' } as Accounts.AccountState,
}))
vi.mock('@/features/owner/account', async (actual) => ({
  ...(await actual<typeof Accounts>()),
  useAccount: () => who.account,
}))

/** On a page of a shelf: its template, its real address, and its handle. */
const onShelf = (template: string, path: string, handle = 'sample', locale = 'en') => {
  setPathname(template, locale)
  page.path = path
  page.params = { handle }
}

const ANA: Accounts.SignedIn = {
  status: 'signed-in',
  handle: 'ana',
  name: 'Ana',
  shelfPublic: true,
}

beforeEach(() => {
  setPathname('/')
  page.path = '/en'
  page.params = {}
  who.account = { status: 'visitor' }
})

describe('Header', () => {
  it('on a shelf, has the name, its links, theme, language and a visitor’s ways in', () => {
    onShelf('/u/[handle]', '/en/u/sample')
    renderWithIntl(<Header />)
    const header = screen.getByRole('banner')

    expect(within(header).getByRole('link', { name: 'Shelf, home' })).toHaveAttribute('href', '/en')
    const nav = within(header).getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/en/u/sample',
    )
    expect(within(nav).getByRole('link', { name: 'Trophies' })).toHaveAttribute(
      'href',
      '/en/u/sample/trophies',
    )
    expect(within(header).getByRole('button', { name: 'Theme' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: /Português/ })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/sign-in',
    )
    expect(within(header).getByRole('link', { name: 'Create your shelf' })).toHaveAttribute(
      'href',
      '/en/sign-up',
    )
  })

  it('away from any shelf, gives a visitor no shelf links, only the ways in', () => {
    renderWithIntl(<Header />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).queryAllByRole('link')).toEqual([])
    expect(screen.getByRole('link', { name: 'Create your shelf' })).toBeInTheDocument()
  })

  it('signed in, away from any shelf, links to one’s own, with a menu for the account', async () => {
    who.account = ANA
    setPathname('/account')
    page.path = '/en/account'
    renderWithIntl(<Header />)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/en/u/ana')
    expect(screen.queryByRole('link', { name: 'Create your shelf' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ana, your account' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('@ana')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'My shelf' })).toHaveAttribute(
      'href',
      '/en/u/ana',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Account' })).toHaveAttribute(
      'href',
      '/en/account',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('signed in, on another’s shelf, links to that shelf', () => {
    who.account = ANA
    onShelf('/u/[handle]/trophies', '/en/u/sample/trophies')
    renderWithIntl(<Header />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/en/u/sample',
    )
    // Placing one's own games is no part of another's shelf.
    expect(within(nav).queryByRole('link', { name: /^Organize/ })).not.toBeInTheDocument()
  })

  it('signed in, on one’s own shelf, links on to placing the games that wait, counting them (spec 4.5)', () => {
    who.account = { ...ANA, waiting: 180 }
    onShelf('/u/[handle]', '/en/u/ana', 'ana')
    renderWithIntl(<Header />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const placing = within(nav).getByRole('link', { name: 'Organize, 180 games waiting' })
    expect(placing).toHaveAttribute('href', '/en/account/unsorted')
    expect(placing).not.toHaveAttribute('aria-current')
    expect(within(placing).getByText('180')).toHaveAttribute('aria-hidden', 'true')
  })

  it('counts no further than 999, and says nothing over the link when none wait', () => {
    who.account = { ...ANA, waiting: 1200 }
    onShelf('/u/[handle]', '/en/u/ana', 'ana')
    const { unmount } = renderWithIntl(<Header />)
    expect(screen.getByRole('link', { name: 'Organize, 1,200 games waiting' })).toHaveTextContent(
      '999+',
    )
    unmount()
    who.account = { ...ANA, waiting: 0 }
    renderWithIntl(<Header />)
    expect(screen.getByRole('link', { name: 'Organize' })).toHaveTextContent(/^Organize$/)
  })

  it('marks placing as the current page on it, in Portuguese too', () => {
    who.account = { ...ANA, waiting: 1 }
    setPathname('/account/unsorted', 'pt-BR')
    page.path = '/pt-BR/account/unsorted'
    renderWithIntl(<Header />, 'pt-BR')
    expect(screen.getByRole('link', { name: 'Organizar, 1 jogo esperando' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('marks it as the current page on its hours tab too', () => {
    who.account = { ...ANA, waiting: 0 }
    setPathname('/account/hours')
    page.path = '/en/account/hours'
    renderWithIntl(<Header />)
    expect(screen.getByRole('link', { name: 'Organize' })).toHaveAttribute('aria-current', 'page')
  })

  it('is in Portuguese on a Portuguese page', () => {
    onShelf('/u/[handle]', '/pt-BR/u/sample', 'sample', 'pt-BR')
    renderWithIntl(<Header />, 'pt-BR')

    expect(screen.getByRole('link', { name: 'Shelf, início' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Troféus' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crie sua estante' })).toBeInTheDocument()
  })
})

describe('NavLinks', () => {
  it('marks the current page, and only that one', () => {
    onShelf('/u/[handle]', '/en/u/sample')
    renderWithIntl(<NavLinks />)

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Trophies' })).not.toHaveAttribute('aria-current')
  })

  it('marks the library on a smart shelf and on a game, which are part of it', () => {
    for (const template of ['/u/[handle]/shelves/[slug]', '/u/[handle]/game/[slug]']) {
      onShelf(template, '/en/u/sample/x')
      const { unmount } = renderWithIntl(<NavLinks />)
      expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Trophies' })).not.toHaveAttribute('aria-current')
      unmount()
    }
  })

  it('marks nothing on a page that is no shelf’s', () => {
    who.account = ANA
    setPathname('/account')
    renderWithIntl(<NavLinks />)

    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Trophies' })).not.toHaveAttribute('aria-current')
  })
})

describe('MobileNav', () => {
  it('opens a menu with the same links, and a visitor’s ways in', async () => {
    onShelf('/u/[handle]/trophies', '/en/u/sample/trophies')
    renderWithIntl(<MobileNav />)

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Library' })).toHaveAttribute(
      'href',
      '/en/u/sample',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Trophies' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Create your shelf' })).toHaveAttribute(
      'href',
      '/en/sign-up',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/sign-in',
    )
  })

  it('has the way to placing one’s games on one’s own shelf, counting them', async () => {
    who.account = { ...ANA, waiting: 3 }
    onShelf('/u/[handle]', '/en/u/ana', 'ana')
    renderWithIntl(<MobileNav />)
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(
      within(screen.getByRole('menu')).getByRole('menuitem', {
        name: 'Organize, 3 games waiting',
      }),
    ).toHaveAttribute('href', '/en/account/unsorted')
  })
})

describe('Footer', () => {
  it('credits IGDB with a link, as its terms ask', () => {
    renderWithIntl(<Footer />)
    const footer = screen.getByRole('contentinfo')

    expect(footer).toHaveTextContent('Game data and covers from IGDB.com.')
    expect(within(footer).getByRole('link', { name: 'IGDB.com' })).toHaveAttribute(
      'href',
      'https://www.igdb.com',
    )
  })

  it('credits IGDB in Portuguese too', () => {
    renderWithIntl(<Footer />, 'pt-BR')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Dados e capas dos jogos: IGDB.com.')
  })

  it('offers a visitor the way to sign in, and back to this page afterwards', () => {
    onShelf('/u/[handle]/trophies', '/en/u/sample/trophies')
    renderWithIntl(<Footer />)
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/en/sign-in?from=%2Fen%2Fu%2Fsample%2Ftrophies')
  })
})

describe('SkipLink', () => {
  it('is the first Tab stop and points at the main content', async () => {
    renderWithIntl(
      <>
        <SkipLink />
        <Header />
      </>,
    )

    await userEvent.tab()

    const link = screen.getByRole('link', { name: 'Skip to content' })
    expect(link).toHaveFocus()
    expect(link).toHaveAttribute('href', `#${MAIN_ID}`)
  })
})

describe('EmptyLedge', () => {
  it('shows an empty shelf, a line about it, and an action when given one', () => {
    renderWithIntl(
      <EmptyLedge
        label="Library"
        title="The shelf is being stocked."
        body="Games will stand here soon."
        action={<button type="button">Add your first game</button>}
      />,
    )

    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('The shelf is being stocked.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add your first game' })).toBeInTheDocument()
  })
})

describe('NavigationProgress', () => {
  // A link Next.js opens in place prevents the browser's own move; the router changes the
  // address once the page is drawn. A plain anchor stands for one here, with no router.
  const page = (opened = true) => (
    <>
      <NavigationProgress />
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/en/u/sample/trophies" onClick={(event) => opened && event.preventDefault()}>
        Trophies
      </a>
    </>
  )
  const line = () => document.querySelector<HTMLElement>('.navigation-progress')!
  const arrive = () => act(() => window.history.pushState(null, '', '/en/u/sample/trophies'))

  beforeEach(() => {
    window.history.replaceState(null, '', '/en/u/sample')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, '', '/')
  })

  it('draws a line while a link’s page is slow to open, and ends it as the page opens', () => {
    render(page())
    fireEvent.click(screen.getByRole('link', { name: 'Trophies' }))
    act(() => vi.advanceTimersByTime(100))
    expect(line().dataset.state).toBe('')
    act(() => vi.advanceTimersByTime(100))
    expect(line().dataset.state).toBe('loading')
    expect(line()).toHaveAttribute('aria-hidden', 'true')
    arrive()
    act(() => vi.advanceTimersByTime(50))
    expect(line().dataset.state).toBe('done')
  })

  it('draws nothing for a page that opens at once', () => {
    render(page())
    fireEvent.click(screen.getByRole('link', { name: 'Trophies' }))
    arrive()
    act(() => vi.advanceTimersByTime(500))
    expect(line().dataset.state).toBe('')
  })

  it('leaves the browser’s own moves alone: a link it follows, or one for a new tab', () => {
    const { unmount } = render(page(false))
    fireEvent.click(screen.getByRole('link', { name: 'Trophies' }))
    act(() => vi.advanceTimersByTime(500))
    expect(line().dataset.state).toBeUndefined()
    unmount()
    render(page())
    fireEvent.click(screen.getByRole('link', { name: 'Trophies' }), { ctrlKey: true })
    act(() => vi.advanceTimersByTime(500))
    expect(line().dataset.state).toBeUndefined()
  })
})
