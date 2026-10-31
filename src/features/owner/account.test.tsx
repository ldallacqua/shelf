import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { forgetAccount, useAccount } from './account'
import { HINT, hintScript } from './account-hint'

/**
 * What a page built ahead of time is built as. A public page is drawn for a
 * visitor, which most who see it are. A page only for an account is drawn as
 * its ghosts, or it would first tell someone signed in to sign in.
 */

const Asks = ({ ahead }: { ahead?: 'checking' }) => useAccount(ahead).status

describe('the hint on <html>', () => {
  const run = new Function(hintScript)
  const page = document.documentElement

  afterEach(() => {
    delete page.dataset.hinted
    document.cookie = `${HINT}=; Max-Age=0`
    document.cookie = 'NEXT_LOCALE=; Max-Age=0'
  })

  it('is there before the first paint where the browser has signed in', () => {
    // After another cookie, as it stands in a real browser.
    document.cookie = 'NEXT_LOCALE=pt-BR'
    document.cookie = `${HINT}=1`
    run()
    expect(page).toHaveAttribute('data-hinted')
  })

  it('is not there for anyone else', () => {
    run()
    expect(page).not.toHaveAttribute('data-hinted')
  })

  it('goes once the account is known to be nobody, so no ghost stays for good', () => {
    page.dataset.hinted = ''
    forgetAccount()
    expect(page).not.toHaveAttribute('data-hinted')
  })
})

describe('useAccount, on the server', () => {
  it('answers a visitor for a public page', () => {
    expect(renderToString(<Asks />)).toBe('visitor')
  })

  it('answers checking for a page only for an account', () => {
    expect(renderToString(<Asks ahead="checking" />)).toBe('checking')
  })
})
