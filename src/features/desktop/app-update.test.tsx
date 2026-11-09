import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import AppUpdate from './app-update'
import type { Download } from './sources'
import { setBridgeForTests } from './tauri'

/** A newer Shelf for Windows, offered in the header once the app has it, with its commands faked. */

const MOVING: Download = {
  id: 'one',
  entry: null,
  title: 'Made-up Game',
  sourceName: 'Made-up source',
  file: 'made-up.zip',
  folder: 'D:\\Games',
  state: 'downloading',
  why: null,
  done: 25,
  total: 100,
  speed: 10,
  through: 'direct',
  remote: null,
  archives: 0,
  extraction: null,
}

let ready: { version: string } | null
let kept: Download[]
let install: () => Promise<unknown>

const app = vi.fn(async (command: string) => {
  if (command === 'update_ready') return ready
  if (command === 'downloads_now') return kept
  if (command === 'install_update') return install()
  return undefined
})

beforeEach(() => {
  ready = { version: '0.16.0' }
  kept = []
  install = () => Promise.resolve()
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

const opened = async () => {
  const user = userEvent.setup()
  renderWithIntl(<AppUpdate />)
  await user.click(await screen.findByRole('button', { name: 'Update' }))
  return user
}

describe('an update, ready in the app', () => {
  it('draws nothing while none waits', async () => {
    ready = null
    const { container } = renderWithIntl(<AppUpdate />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('update_ready', {}))
    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing in an app too old to say', async () => {
    app.mockImplementationOnce(() => Promise.reject(new Error('unknown command')))
    const { container } = renderWithIntl(<AppUpdate />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('update_ready', {}))
    expect(container).toBeEmptyDOMElement()
  })

  it('names the version, and restarts the app only when asked', async () => {
    const user = await opened()
    expect(screen.getByText('Shelf 0.16.0 is ready')).toBeVisible()
    expect(screen.queryByText(/Downloads under way/)).toBeNull()
    expect(app).not.toHaveBeenCalledWith('install_update', {})
    await user.click(screen.getByRole('button', { name: 'Restart and update' }))
    expect(app).toHaveBeenCalledWith('install_update', {})
  })

  it('says downloads under way pause', async () => {
    kept = [MOVING]
    await opened()
    expect(screen.getByText(/Downloads under way pause/)).toBeVisible()
  })

  it('waits for saves being backed up', async () => {
    install = () => Promise.reject('busy')
    const user = await opened()
    await user.click(screen.getByRole('button', { name: 'Restart and update' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/backing up a game's saves/)
  })

  it('says when it could not, and that it will at the next start', async () => {
    install = () => Promise.reject('failed')
    const user = await opened()
    await user.click(screen.getByRole('button', { name: 'Restart and update' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/next time it opens/)
  })
})
