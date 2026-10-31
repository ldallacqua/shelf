import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import type { AccountState } from './account'
import { AccountMenu } from './account-menu'
import { AccountSettings } from './account-settings'
import { Consent } from './consent'
import { HandleField } from './handle-field'

/**
 * What the pages for one's own account draw while they wait (spec 3.10):
 * ghosts, with the words for assistive technology alone, and nothing that
 * tells someone signed in to sign in.
 */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('client_id=https://ai.example/app&sig=s&scope=read'),
}))

let who: AccountState
vi.mock('./account', async (actual) => ({
  ...(await actual<object>()),
  useAccount: () => who,
}))

beforeEach(() => {
  who = { status: 'checking' }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the account, on its way', () => {
  it('draws the page’s shape, and asks nobody to sign in', () => {
    const { container } = renderWithIntl(<AccountSettings />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Checking who you are…')
    expect(status).toHaveClass('sr-only')
    expect(container.querySelector('[aria-busy="true"] .ghost')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('holds the menu’s place in the header with a ghost', () => {
    const { container } = renderWithIntl(<AccountMenu />)
    expect(container.querySelector('.ghost')).toHaveClass('size-10')
  })

  it('built ahead for a visitor, keeps a ghost for a browser that has signed in', () => {
    who = { status: 'visitor' }
    const { container } = renderWithIntl(<AccountMenu />)
    expect(container.querySelector('.ghost')).toHaveClass('hidden', 'hinted:block')
    expect(screen.getByRole('link', { name: 'Sign in' }).parentElement).toHaveClass('hinted:hidden')
  })

  it('checks a handle with a ghost, saying so to a screen reader alone', () => {
    const { container } = renderWithIntl(
      <HandleField value="ana" onChange={vi.fn()} status={{ state: 'checking' }} />,
    )
    expect(screen.getByText('Checking…')).toHaveClass('sr-only')
    expect(container.querySelector('.ghost')).toBeInTheDocument()
    expect(container.querySelector('.animate-spin, [class*="animate-spin"]')).toBeNull()
  })
})

describe('letting an assistant in, on its way', () => {
  it('draws the question’s shape until it knows who is asking', async () => {
    who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true }
    let answer!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    )
    const { container } = renderWithIntl(<Consent />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking who you are…')
    expect(container.querySelector('.ghost')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument()

    answer(Response.json({ client_id: 'https://ai.example/app', client_name: 'Some Assistant' }))
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByText(/Some Assistant/)).toBeInTheDocument()
    expect(container.querySelector('.ghost')).not.toBeInTheDocument()
  })

  it('goes on with the assistant’s address when its name cannot be read', async () => {
    who = { status: 'signed-in', handle: 'ana', name: 'Ana', shelfPublic: true }
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(null, { status: 500 }),
    )
    renderWithIntl(<Consent />)
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByText(/ai\.example/)).toBeInTheDocument()
  })
})
