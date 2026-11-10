import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import SaveSettings from './save-settings'
import { setBridgeForTests } from './tauri'

/** The limits on every game's snapshots, in Settings, with the app's commands faked (ADR 008). */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let caps: { mostMb: number; kept: number } | 'old'
/** As an app older than the services answers, or with them. */
let place: Record<string, unknown>
/** How the browser's sign-in ends, once the test says. */
let signedIn: { resolve: (value: unknown) => void; reject: (reason: unknown) => void } | undefined

const services = (onedrive: string | null, google: string | null) => [
  { service: 'onedrive', account: onedrive, signingIn: false },
  { service: 'google-drive', account: google, signingIn: false },
]

const app = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (caps === 'old') throw 'command save_caps not found'
  if (command === 'save_place') return place
  if (command === 'sign_in_save_cloud')
    return new Promise((resolve, reject) => {
      signedIn = { resolve, reject }
    })
  if (command === 'cancel_save_sign_in') {
    signedIn?.reject('cancelled')
    return null
  }
  if (command === 'sign_out_save_cloud') {
    place = {
      folder: null,
      reachable: true,
      cloud: null,
      away: null,
      services: services(null, null),
    }
    return place
  }
  if (command === 'choose_save_place') {
    place = { folder: 'D:\\Synced\\Shelf saves', reachable: true }
    return place
  }
  if (command === 'forget_save_place') {
    place = { folder: null, reachable: true }
    return place
  }
  if (command === 'set_save_caps') {
    // The app keeps them within its bounds, whatever it is asked.
    caps = { mostMb: Number(args?.mostMb), kept: Math.max(3, Number(args?.kept)) }
  }
  return caps
})

beforeEach(() => {
  caps = { mostMb: 500, kept: 20 }
  place = { folder: null, reachable: true }
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

describe('where games’ backups go', () => {
  it('start on this computer alone, and go to a folder once one is chosen', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    expect(await screen.findByText('This computer only')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose a folder' }))
    expect(app).toHaveBeenCalledWith('choose_save_place', {
      ask: 'Choose where your games’ backups go',
    })
    expect(await screen.findByText('D:\\Synced\\Shelf saves')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('copied there too')
  })

  it('go back to this computer alone, leaving the folder as it is', async () => {
    place = { folder: 'D:\\Synced\\Shelf saves', reachable: true }
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    await user.click(await screen.findByRole('button', { name: 'Keep them on this computer only' }))
    expect(app).toHaveBeenCalledWith('forget_save_place', {})
    expect(await screen.findByText('This computer only')).toBeInTheDocument()
  })

  it('say when the folder can’t be reached', async () => {
    place = { folder: 'E:\\Shelf saves', reachable: false }
    renderWithIntl(<SaveSettings />)
    expect(await screen.findByText(/Can’t be reached now/)).toBeInTheDocument()
  })
})

describe('a service of mine as the place (phase 5)', () => {
  const offered = () => ({
    folder: null,
    reachable: true,
    cloud: null,
    away: null,
    services: services(null, null),
  })

  it('offers OneDrive and Google Drive, and signs in on the service’s own page', async () => {
    place = offered()
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    await user.click(await screen.findByRole('button', { name: 'Sign in to OneDrive' }))
    expect(app).toHaveBeenCalledWith('sign_in_save_cloud', { service: 'onedrive' })
    expect(await screen.findByText(/Sign in on Microsoft’s page/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to Google Drive' })).toBeDisabled()
    place = { ...offered(), cloud: 'onedrive', services: services('someone@example.com', null) }
    signedIn?.resolve(place)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Signed in. Backups go to OneDrive now',
    )
    const inUse = screen.getByText('In use').closest('li')!
    expect(within(inUse).getByText('OneDrive')).toBeInTheDocument()
    expect(within(inUse).getByText(/someone@example\.com/)).toBeInTheDocument()
    expect(within(inUse).getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  it('stops waiting on Cancel, and says nothing', async () => {
    place = offered()
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    await user.click(await screen.findByRole('button', { name: 'Sign in to Google Drive' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(app).toHaveBeenCalledWith('cancel_save_sign_in', { service: 'google-drive' })
    expect(await screen.findByRole('button', { name: 'Sign in to Google Drive' })).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says when the service didn’t sign in, or couldn’t be reached', async () => {
    place = offered()
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    await user.click(await screen.findByRole('button', { name: 'Sign in to OneDrive' }))
    signedIn?.reject('refused')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'OneDrive didn’t sign you in. Try again.',
    )
    await user.click(screen.getByRole('button', { name: 'Sign in to OneDrive' }))
    signedIn?.reject('unreachable')
    expect(await screen.findByRole('alert')).toHaveTextContent('OneDrive couldn’t be reached.')
  })

  it('says when the service in use took the sign-in back, and offers it again', async () => {
    place = {
      ...offered(),
      cloud: 'google-drive',
      reachable: false,
      away: 'signed-out',
      services: services(null, 'someone@example.com'),
    }
    renderWithIntl(<SaveSettings />)
    expect(await screen.findByText(/Signed out\. New backups wait/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeEnabled()
  })

  it('signs out of the service in use, leaving what is there', async () => {
    place = { ...offered(), cloud: 'onedrive', services: services('someone@example.com', null) }
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(app).toHaveBeenCalledWith('sign_out_save_cloud', { service: 'onedrive' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Signed out of OneDrive on this computer. Your other computers stay signed in, and what’s there stays there.',
    )
    expect(screen.getByText('In use').closest('li')).toHaveTextContent('This computer only')
  })

  it('says when the service in use forgot the sign-in, and offers it again', async () => {
    place = {
      ...offered(),
      cloud: 'onedrive',
      reachable: false,
      away: 'signed-out',
      services: services(null, null),
    }
    renderWithIntl(<SaveSettings />)
    const inUse = (await screen.findByText('In use')).closest('li')!
    expect(inUse).toHaveTextContent('OneDrive')
    expect(inUse).toHaveTextContent('Signed out. New backups wait on this computer')
    expect(within(inUse).getByRole('button', { name: 'Sign in again' })).toBeEnabled()
  })

  it('offers no service in an app that can’t sign in to one', async () => {
    place = { folder: null, reachable: true }
    renderWithIntl(<SaveSettings />)
    expect(await screen.findByText('This computer only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign in to/ })).toBeNull()
  })
})

describe('the limits on games’ backups', () => {
  it('show what the app keeps', async () => {
    renderWithIntl(<SaveSettings />)
    expect(await screen.findByRole('textbox', { name: 'Backups kept per game' })).toHaveValue('20')
    expect(screen.getByRole('textbox', { name: 'Largest backup' })).toHaveValue('500')
  })

  it('save a change, and say so', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    const kept = await screen.findByRole('textbox', { name: 'Backups kept per game' })
    await user.clear(kept)
    await user.type(kept, '30{Enter}')
    await vi.waitFor(() =>
      expect(app).toHaveBeenCalledWith('set_save_caps', { mostMb: 500, kept: 30 }),
    )
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('never ask for fewer than three', async () => {
    const user = userEvent.setup()
    renderWithIntl(<SaveSettings />)
    const kept = await screen.findByRole('textbox', { name: 'Backups kept per game' })
    await user.clear(kept)
    await user.type(kept, '1{Enter}')
    await vi.waitFor(() =>
      expect(app).toHaveBeenCalledWith('set_save_caps', { mostMb: 500, kept: 3 }),
    )
  })

  it('ask an app too old to keep saves to be updated', async () => {
    caps = 'old'
    renderWithIntl(<SaveSettings />)
    expect(
      await screen.findAllByText('Update Shelf for Windows to keep games’ saves.'),
    ).toHaveLength(2)
  })
})
