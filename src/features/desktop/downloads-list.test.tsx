import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { Downloads } from './downloads-list'
import type { Download } from './sources'
import { setBridgeForTests } from './tauri'

/** Downloads on the account page, with the app's commands faked (ADR 007). */

const GB = 1024 ** 3
const DOWNLOAD: Download = {
  id: 'one',
  title: 'Made-up Game',
  sourceName: 'Made-up source',
  file: 'made-up.zip',
  folder: 'D:\\Games',
  state: 'downloading',
  why: null,
  done: 3 * GB,
  total: 12 * GB,
  speed: 10 * 1024 * 1024,
  through: 'direct',
  remote: null,
}

let kept: Download[]

const app = vi.fn(async (command: string) => {
  if (command === 'downloads_now') return kept
  return undefined
})

beforeEach(() => {
  kept = [DOWNLOAD]
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

const card = async () =>
  (await screen.findByRole('heading', { name: 'Made-up Game' })).closest('article')!

describe('downloads', () => {
  it('draws nothing when there are none', async () => {
    kept = []
    const { container } = renderWithIntl(<Downloads />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('downloads_now', {}))
    expect(container).toBeEmptyDOMElement()
  })

  it('says how far, how fast and about how long', async () => {
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByText(/Downloading · 3 GB of 12 GB/)).toBeInTheDocument()
    expect(here.getByText(/10 MB\/s, about 16 min left/)).toBeInTheDocument()
    expect(
      here.getByRole('progressbar', { name: 'How far along Made-up Game is' }),
    ).toHaveAttribute('aria-valuenow', String(3 * GB))
  })

  it('pauses by its id', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    await user.click(within(await card()).getByRole('button', { name: 'Pause' }))
    expect(app).toHaveBeenCalledWith('pause_download', { id: 'one' })
  })

  it('offers to continue one paused', async () => {
    kept = [{ ...DOWNLOAD, state: 'paused', speed: 0 }]
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    await user.click(within(await card()).getByRole('button', { name: 'Resume' }))
    expect(app).toHaveBeenCalledWith('resume_download', { id: 'one' })
  })

  it('asks before cancelling, and cancels only on yes', async () => {
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    await user.click(within(await card()).getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))
    expect(app).not.toHaveBeenCalledWith('remove_download', { id: 'one' })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel the download' }))
    expect(app).toHaveBeenCalledWith('remove_download', { id: 'one' })
  })

  it.each([
    ['page', /web pages, not files/],
    ['unreachable', /stopped answering/],
    ['disk', /doesn’t have room/],
    ['write', /couldn’t write/],
  ] as const)('says why one stopped: %s, and offers to try again', async (why, words) => {
    kept = [{ ...DOWNLOAD, state: 'failed', why, speed: 0 }]
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByRole('alert')).toHaveTextContent(words)
    expect(here.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('says how far Real-Debrid has got, which nothing here can hurry', async () => {
    kept = [
      { ...DOWNLOAD, state: 'remote', remote: 40, through: 'realdebrid', total: null, done: 0 },
    ]
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByText('Real-Debrid is getting it: 40%')).toBeInTheDocument()
    expect(here.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(here.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it.each([
    ['signedout', /isn’t signed in/],
    ['premium', /Premium/],
    ['blocked', /filters/],
    ['dead', /nobody may be sharing/],
    ['virus', /found a virus/],
    ['host', /doesn’t open these links/],
    ['busy', /too much just now/],
    ['declined', /refused/],
  ] as const)('says why Real-Debrid stopped it: %s', async (why, words) => {
    kept = [{ ...DOWNLOAD, state: 'failed', why, through: 'realdebrid', speed: 0 }]
    renderWithIntl(<Downloads />)
    expect(within(await card()).getByRole('alert')).toHaveTextContent(words)
  })

  it('offers to show a finished file, and nothing that starts it', async () => {
    kept = [{ ...DOWNLOAD, state: 'done', done: 12 * GB, speed: 0 }]
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByText(/doesn’t start what it downloads/)).toBeInTheDocument()
    const names = here.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(['Show in folder', 'Take off the list'])

    await user.click(here.getByRole('button', { name: 'Show in folder' }))
    expect(app).toHaveBeenCalledWith('show_download', { id: 'one' })
  })

  it('stops asking when nothing is moving', async () => {
    kept = [{ ...DOWNLOAD, state: 'paused', speed: 0 }]
    renderWithIntl(<Downloads />)
    await card()
    const asked = app.mock.calls.length
    await new Promise((done) => setTimeout(done, 1200))
    expect(app.mock.calls.length).toBe(asked)
  })

  it('goes on asking while one moves', async () => {
    renderWithIntl(<Downloads />)
    await card()
    const asked = app.mock.calls.length
    await vi.waitFor(() => expect(app.mock.calls.length).toBeGreaterThan(asked), { timeout: 2500 })
  })
})
