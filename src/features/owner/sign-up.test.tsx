import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import type * as Accounts from './account'
import { SignUp } from './sign-up'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const opened = vi.hoisted(() => vi.fn<(path: string) => void>())
vi.mock('./account', async (actual) => ({
  ...(await actual<typeof Accounts>()),
  openAfresh: opened,
}))

/** Creating a shelf (ADR 004): the form, its handle checked as typed, and what it sends. */

const taken = new Set(['ana'])
const sent: { path: string; body?: unknown }[] = []
let signUpAnswer: Response

beforeEach(() => {
  sent.length = 0
  signUpAnswer = Response.json({ token: 't', user: { username: 'new-shelf' } })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const handle = /^\/api\/v1\/handles\/(.+)$/.exec(path)?.[1]
    if (handle) {
      return Response.json(
        taken.has(handle) ? { available: false, problem: 'taken' } : { available: true },
      )
    }
    if (path === '/api/auth/sign-up/email') return signUpAnswer
    return new Response(null, { status: 404 })
  })
  opened.mockReset()
})
afterEach(() => vi.restoreAllMocks())

const handleField = () => screen.getByRole('textbox', { name: 'Handle' })
const handleAsked = () => sent.filter((each) => each.path.startsWith('/api/v1/handles/'))

describe('SignUp', () => {
  it('picks Public for you, and says plainly what each choice means', () => {
    renderWithIntl(<SignUp />)
    expect(screen.getByRole('radio', { name: /^Public/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Private/ })).not.toBeChecked()
    expect(screen.getByText(/Anyone with the address can see your games/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be reset by email yet/)).toBeInTheDocument()
  })

  it('suggests a handle from the name, until one is typed', async () => {
    renderWithIntl(<SignUp />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Zoë Ng')
    expect(handleField()).toHaveValue('zoe-ng')
    await userEvent.clear(handleField())
    await userEvent.type(handleField(), 'ZOE')
    expect(handleField()).toHaveValue('zoe')
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), '!')
    expect(handleField()).toHaveValue('zoe')
  })

  it('says why a handle cannot be, at once, without asking the server', async () => {
    renderWithIntl(<SignUp />)
    await userEvent.type(handleField(), 'a--b')
    expect(screen.getByText(/single hyphens between them/)).toBeInTheDocument()
    expect(handleField()).toHaveAttribute('aria-invalid', 'true')
    await userEvent.clear(handleField())
    await userEvent.type(handleField(), 'library')
    expect(screen.getByText(/kept for the site/)).toBeInTheDocument()
    expect(handleAsked()).toEqual([])
    expect(screen.getByRole('button', { name: 'Create my shelf' })).toBeDisabled()
  })

  it('asks the server whether another shelf has it, after a pause', async () => {
    renderWithIntl(<SignUp />)
    await userEvent.type(handleField(), 'ana')
    expect(await screen.findByText(/Another shelf has that one/)).toBeInTheDocument()
    await userEvent.type(handleField(), '-b')
    expect(await screen.findByText('Free to take.')).toBeInTheDocument()
    // Only what was typed last was asked about once the typing paused.
    expect(handleAsked().map((each) => each.path)).toEqual([
      '/api/v1/handles/ana',
      '/api/v1/handles/ana-b',
    ])
  })

  it('sends the account with its handle and choice, then opens the new shelf', async () => {
    renderWithIntl(<SignUp />, 'pt-BR')
    await userEvent.type(screen.getByRole('textbox', { name: 'Seu nome' }), 'New Shelf')
    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail' }), 'new@shelf.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'long enough password')
    await userEvent.click(screen.getByRole('radio', { name: /^Privada/ }))
    await screen.findByText('Disponível.')
    await userEvent.click(screen.getByRole('button', { name: 'Criar minha estante' }))

    await waitFor(() => expect(opened).toHaveBeenCalledWith('/pt-BR/u/new-shelf'))
    expect(sent.find((each) => each.path === '/api/auth/sign-up/email')?.body).toEqual({
      name: 'New Shelf',
      username: 'new-shelf',
      email: 'new@shelf.test',
      password: 'long enough password',
      shelfPublic: false,
      rememberMe: true,
    })
  })

  it('says what went wrong when the server refuses', async () => {
    signUpAnswer = Response.json(
      { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists.' },
      { status: 422 },
    )
    renderWithIntl(<SignUp />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Bea')
    await userEvent.type(screen.getByRole('textbox', { name: 'Email address' }), 'bea@shelf.test')
    await userEvent.type(screen.getByLabelText('Password'), 'long enough password')
    await screen.findByText('Free to take.')
    await userEvent.click(screen.getByRole('button', { name: 'Create my shelf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account already uses that email address. Sign in instead.',
    )
    expect(opened).not.toHaveBeenCalled()
  })
})
