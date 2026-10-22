import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setPathname } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'

import { LanguageSwitch } from './language-switch'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const query = vi.hoisted(() => ({ value: '', params: {} as Record<string, string> }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query.value),
  useParams: () => query.params,
}))

describe('LanguageSwitch', () => {
  beforeEach(() => {
    query.value = ''
    query.params = {}
    setPathname('/')
  })

  it('on an English page, links to the same page in Portuguese', () => {
    setPathname('/u/[handle]')
    query.params = { handle: 'sample' }
    renderWithIntl(<LanguageSwitch />, 'en')

    const link = screen.getByRole('link', { name: 'PT: Português (Brasil)' })
    expect(link).toHaveAttribute('href', '/pt-BR/u/sample')
    expect(link).toHaveAttribute('hreflang', 'pt-BR')
    // The link's own text is Portuguese, and says so for screen readers.
    expect(link).toHaveAttribute('lang', 'pt-BR')
    expect(link).toHaveTextContent('PT')
  })

  it('on a Portuguese page, links to the same page in English', () => {
    setPathname('/u/[handle]/trophies', 'pt-BR')
    query.params = { handle: 'sample' }
    renderWithIntl(<LanguageSwitch />, 'pt-BR')

    const link = screen.getByRole('link', { name: 'EN: English' })
    expect(link).toHaveAttribute('href', '/en/u/sample/trophies')
    expect(link).toHaveAttribute('lang', 'en')
  })

  it('carries the filters in the address along', () => {
    setPathname('/u/[handle]')
    query.params = { handle: 'sample' }
    query.value = 'q=status:backlog genre:rpg&sort=-rating'
    renderWithIntl(<LanguageSwitch />, 'en')

    const href = screen.getByRole('link', { name: /Português/ }).getAttribute('href') ?? ''
    const [path, search] = href.split('?')
    expect(path).toBe('/pt-BR/u/sample')
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      q: 'status:backlog genre:rpg',
      sort: '-rating',
    })
  })

  it('keeps a smart shelf, and its changes, in the other language', () => {
    setPathname('/u/[handle]/shelves/[slug]')
    query.params = { handle: 'sample', slug: 'backlog' }
    query.value = 'sort=-added'
    renderWithIntl(<LanguageSwitch />, 'en')
    expect(screen.getByRole('link', { name: /Português/ })).toHaveAttribute(
      'href',
      '/pt-BR/u/sample/shelves/backlog?sort=-added',
    )
  })

  it('keeps the sign-up page, which is no shelf’s', () => {
    setPathname('/sign-up')
    renderWithIntl(<LanguageSwitch />, 'en')
    expect(screen.getByRole('link', { name: /Português/ })).toHaveAttribute(
      'href',
      '/pt-BR/sign-up',
    )
  })

  it('links to the other home page from the home page', () => {
    renderWithIntl(<LanguageSwitch />, 'en')
    expect(screen.getByRole('link', { name: /Português/ })).toHaveAttribute('href', '/pt-BR')
  })
})
