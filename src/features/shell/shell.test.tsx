import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Accounts from '@/features/owner/account'
import { setPathname } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'

import { EmptyLedge } from './empty-ledge'
import { Footer } from './footer'
import { Header } from './header'
import { MobileNav } from './mobile-nav'
import { NavLinks } from './nav-links'
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
