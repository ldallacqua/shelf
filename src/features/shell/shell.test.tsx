import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setPathname } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'

import { EmptyLedge } from './empty-ledge'
import { Footer } from './footer'
import { Header } from './header'
import { MobileNav } from './mobile-nav'
import { NavLinks } from './nav-links'
import { MAIN_ID, SkipLink } from './skip-link'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

describe('Header', () => {
  beforeEach(() => setPathname('/'))

  it('has the name, the main links, theme and language', () => {
    renderWithIntl(<Header />)
    const header = screen.getByRole('banner')

    expect(within(header).getByRole('link', { name: 'Shelf, home' })).toHaveAttribute('href', '/en')
    const nav = within(header).getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/en/library',
    )
    expect(within(nav).getByRole('link', { name: 'Trophies' })).toHaveAttribute(
      'href',
      '/en/trophies',
    )
    expect(within(header).getByRole('button', { name: 'Theme' })).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: /Português/ })).toBeInTheDocument()
  })

  it('is in Portuguese on a Portuguese page', () => {
    setPathname('/', 'pt-BR')
    renderWithIntl(<Header />, 'pt-BR')

    expect(screen.getByRole('link', { name: 'Shelf, início' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Troféus' })).toBeInTheDocument()
  })
})

describe('NavLinks', () => {
  it('marks the current page, and only that one', () => {
    setPathname('/library')
    renderWithIntl(<NavLinks />)

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Trophies' })).not.toHaveAttribute('aria-current')
  })

  it('marks the library on a smart shelf, which is part of it', () => {
    setPathname('/shelves/short-ones')
    renderWithIntl(<NavLinks />)

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Trophies' })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing on the home page', () => {
    setPathname('/')
    renderWithIntl(<NavLinks />)

    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Trophies' })).not.toHaveAttribute('aria-current')
  })
})

describe('MobileNav', () => {
  it('opens a menu with the same links', async () => {
    setPathname('/trophies')
    renderWithIntl(<MobileNav />)

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Library' })).toHaveAttribute(
      'href',
      '/en/library',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Trophies' })).toHaveAttribute(
      'aria-current',
      'page',
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
    setPathname('/trophies')
    renderWithIntl(<Footer />)
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/en/sign-in?from=%2Fen%2Ftrophies')
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
