import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import PlaceTrouble, { troubleOf } from './place-trouble'
import type { SavePlace } from './saves'
import { setBridgeForTests } from './tauri'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** What the saves' place needs from the person, said in the header, with the app's commands faked. */

const fine: SavePlace = {
  folder: null,
  reachable: true,
  cloud: 'google-drive',
  away: null,
  services: [{ service: 'google-drive', account: 'someone@example.com', signingIn: false }],
}

let place: SavePlace | 'refused'

const app = vi.fn(async (command: string) => {
  if (command !== 'save_place') return undefined
  if (place === 'refused') throw 'unset'
  return place
})

beforeEach(() => {
  place = fine
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

describe('troubleOf', () => {
  it('is what the person has to fix, and not a line down', () => {
    expect(troubleOf(fine)).toBeNull()
    expect(troubleOf({ ...fine, away: 'unreachable', reachable: false })).toBeNull()
    expect(troubleOf({ ...fine, away: 'signed-out', reachable: false })).toEqual({
      kind: 'signed-out',
      name: 'Google Drive',
    })
    expect(troubleOf({ ...fine, cloud: 'onedrive', away: 'full' })).toEqual({
      kind: 'full',
      name: 'OneDrive',
    })
    expect(
      troubleOf({ ...fine, cloud: null, folder: 'E:\\Shelf saves', reachable: false }),
    ).toEqual({ kind: 'away', name: 'E:\\Shelf saves' })
    expect(troubleOf({ ...fine, cloud: null, folder: 'E:\\Shelf saves' })).toBeNull()
  })
})

describe('PlaceTrouble', () => {
  it('draws nothing while the place can be used, or the app is too old to say', async () => {
    const { unmount } = renderWithIntl(<PlaceTrouble />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('save_place', {}))
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    place = 'refused'
    app.mockClear()
    renderWithIntl(<PlaceTrouble />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('save_place', {}))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says a service signed out of, and leads to signing in again', async () => {
    place = { ...fine, away: 'signed-out', reachable: false }
    const user = userEvent.setup()
    renderWithIntl(<PlaceTrouble />)
    await user.click(await screen.findByRole('button', { name: 'Google Drive disconnected' }))
    expect(screen.getByText('Shelf is signed out of Google Drive')).toBeInTheDocument()
    expect(
      screen.getByText(/your other computers won’t see what you play here/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/en/settings/saves',
    )
  })

  it('names a folder that can’t be reached', async () => {
    place = { ...fine, cloud: null, folder: 'E:\\Shelf saves', reachable: false }
    const user = userEvent.setup()
    renderWithIntl(<PlaceTrouble />)
    await user.click(await screen.findByRole('button', { name: 'Saves folder unavailable' }))
    expect(screen.getByText(/E:\\Shelf saves isn’t there now/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/en/settings/saves',
    )
  })
})
