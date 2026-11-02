import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { RealDebrid } from './real-debrid'
import type { RealDebridAccount } from './sources'
import { setBridgeForTests } from './tauri'

/** Real-Debrid's sign-in, with the app's commands faked (ADR 007, phase 3). */

const WAITING: RealDebridAccount = {
  state: 'waiting',
  code: 'MADEUP12',
  url: 'https://real-debrid.com/device',
}

let account: RealDebridAccount

const app = vi.fn(async (command: string) => {
  if (command === 'real_debrid_account') return account
  if (command === 'real_debrid_sign_in') return WAITING
  return undefined
})

beforeEach(() => {
  account = { state: 'out' }
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

describe('Real-Debrid', () => {
  it('shows the code, and sends to its own page in a tab of its own', async () => {
    const user = userEvent.setup()
    renderWithIntl(<RealDebrid />)
    await user.click(await screen.findByRole('button', { name: 'Sign in to Real-Debrid' }))
    expect(await screen.findByText('MADEUP12')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open Real-Debrid’s page' })
    expect(link).toHaveAttribute('href', 'https://real-debrid.com/device')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('stops waiting when asked', async () => {
    account = WAITING
    const user = userEvent.setup()
    renderWithIntl(<RealDebrid />)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(app).toHaveBeenCalledWith('real_debrid_cancel_sign_in', {})
    expect(
      await screen.findByRole('button', { name: 'Sign in to Real-Debrid' }),
    ).toBeInTheDocument()
  })

  it('moves on by itself once the code is entered', async () => {
    account = WAITING
    renderWithIntl(<RealDebrid />)
    await screen.findByText('MADEUP12')
    account = { state: 'in', username: 'made-up', premium: true, until: '2027-01-01T00:00:00.000Z' }
    expect(
      await screen.findByText('Signed in as made-up', {}, { timeout: 3500 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Premium until Jan 1, 2027/)).toBeInTheDocument()
  })

  it('says when a code ran out', async () => {
    account = WAITING
    renderWithIntl(<RealDebrid />)
    await screen.findByText('MADEUP12')
    account = { state: 'out' }
    expect(await screen.findByRole('alert', {}, { timeout: 3500 })).toHaveTextContent(/ran out/)
  })

  it('says when the account isn’t Premium', async () => {
    account = { state: 'in', username: 'made-up', premium: false, until: null }
    renderWithIntl(<RealDebrid />)
    expect(await screen.findByText(/isn’t Premium/)).toBeInTheDocument()
  })

  it('asks before signing out', async () => {
    account = { state: 'in', username: 'made-up', premium: true, until: null }
    const user = userEvent.setup()
    renderWithIntl(<RealDebrid />)
    await user.click(await screen.findByRole('button', { name: 'Sign out of Real-Debrid' }))
    await user.click(await screen.findByRole('button', { name: 'Stay signed in' }))
    expect(app).not.toHaveBeenCalledWith('real_debrid_sign_out', {})

    await user.click(screen.getByRole('button', { name: 'Sign out of Real-Debrid' }))
    await user.click(await screen.findByRole('button', { name: 'Sign out of Real-Debrid' }))
    await waitFor(() => expect(app).toHaveBeenCalledWith('real_debrid_sign_out', {}))
    expect(
      await screen.findByRole('button', { name: 'Sign in to Real-Debrid' }),
    ).toBeInTheDocument()
  })
})
