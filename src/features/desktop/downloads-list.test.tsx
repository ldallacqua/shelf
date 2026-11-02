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
  entry: null,
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
  archives: 0,
  extraction: null,
}

let kept: Download[]
let picked: { name: string; path: string; exists: boolean } | null

const app = vi.fn(async (command: string) => {
  if (command === 'downloads_now') return kept
  if (command === 'choose_launcher') return picked
  return undefined
})

beforeEach(() => {
  kept = [DOWNLOAD]
  picked = null
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

  const finished: Download = { ...DOWNLOAD, state: 'done', done: 12 * GB, speed: 0 }

  it('offers to extract an archive, first, and only when asked does it', async () => {
    kept = [{ ...finished, archives: 1 }]
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    const here = within(await card())
    const names = here.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(['Extract', 'Show in folder', 'Take off the list'])
    expect(app).not.toHaveBeenCalledWith('extract_download', { id: 'one' })
    await user.click(here.getByRole('button', { name: 'Extract' }))
    expect(app).toHaveBeenCalledWith('extract_download', { id: 'one' })
  })

  it('offers nothing to extract when it brought no archive', async () => {
    kept = [finished]
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.queryByRole('button', { name: 'Extract' })).not.toBeInTheDocument()
  })

  it('says how far extracting has got, and goes on asking', async () => {
    kept = [
      {
        ...finished,
        archives: 1,
        extraction: { state: 'working', why: null, done: 3 * GB, total: 12 * GB },
      },
    ]
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByText('Extracting · 3 GB of 12 GB')).toBeInTheDocument()
    expect(
      here.getByRole('progressbar', { name: 'How far along extracting Made-up Game is' }),
    ).toHaveAttribute('aria-valuenow', String(3 * GB))
    expect(here.queryByRole('button', { name: 'Show in folder' })).not.toBeInTheDocument()
    const before = app.mock.calls.filter(([command]) => command === 'downloads_now').length
    await vi.waitFor(
      () =>
        expect(
          app.mock.calls.filter(([command]) => command === 'downloads_now').length,
        ).toBeGreaterThan(before),
      { timeout: 2500 },
    )
  })

  it('says it is reading until it knows how much there is', async () => {
    kept = [
      { ...finished, archives: 1, extraction: { state: 'working', why: null, done: 0, total: 0 } },
    ]
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByText('Reading the archive…')).toBeInTheDocument()
    expect(here.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('asks before stopping, and says the archive stays', async () => {
    kept = [
      {
        ...finished,
        archives: 1,
        extraction: { state: 'working', why: null, done: 3 * GB, total: 12 * GB },
      },
    ]
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    await user.click(within(await card()).getByRole('button', { name: 'Stop extracting' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/The downloaded archive stays/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Stop extracting' }))
    expect(app).toHaveBeenCalledWith('cancel_extraction', { id: 'one' })
  })

  it.each([
    ['interrupted', /closed before it finished/, true],
    ['damaged', /damaged, incomplete/, true],
    ['volume', /part of this archive is missing/, true],
    ['disk', /doesn’t have room for what’s inside/, true],
    ['write', /couldn’t write/, true],
    ['password', /needs a password/, false],
    ['unsafe', /would leave its folder/, false],
  ] as const)('says why it did not extract: %s', async (why, words, again) => {
    kept = [
      { ...finished, archives: 1, extraction: { state: 'failed', why, done: 0, total: 12 * GB } },
    ]
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByRole('alert')).toHaveTextContent(words)
    expect(here.queryAllByRole('button', { name: 'Try again' })).toHaveLength(again ? 1 : 0)
    expect(here.getByRole('button', { name: 'Show in folder' })).toBeInTheDocument()
  })

  it('goes on to the game’s file from what was extracted, through Windows’ picker', async () => {
    kept = [
      {
        ...finished,
        entry: 'an-entry',
        archives: 1,
        extraction: { state: 'done', why: null, done: 31 * GB, total: 31 * GB },
      },
    ]
    picked = { name: 'game.exe', path: 'D:\\Games\\game.exe', exists: true }
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    const here = within(await card())
    expect(here.getByText('Extracted: 31 GB.')).toBeInTheDocument()
    expect(here.getByText(/doesn’t start what it downloads/)).toBeInTheDocument()
    const names = here.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(['Choose the game’s file', 'Show in folder', 'Take off the list'])
    await user.click(here.getByRole('button', { name: 'Choose the game’s file' }))
    expect(app).toHaveBeenCalledWith('choose_launcher', {
      entry: 'an-entry',
      title: 'The file that starts Made-up Game',
      files: 'Games and shortcuts',
    })
    expect(await here.findByRole('status')).toHaveTextContent(/game\.exe is what Play opens now/)
  })

  it('says nothing when the picker is closed', async () => {
    kept = [{ ...finished, entry: 'an-entry' }]
    const user = userEvent.setup()
    renderWithIntl(<Downloads />)
    const here = within(await card())
    await user.click(here.getByRole('button', { name: 'Choose the game’s file' }))
    expect(app).toHaveBeenCalledWith('choose_launcher', expect.anything())
    expect(here.queryByRole('status')).not.toBeInTheDocument()
  })

  it('doesn’t offer the game’s file before an archive is extracted, or with no game', async () => {
    kept = [{ ...finished, entry: 'an-entry', archives: 1 }]
    renderWithIntl(<Downloads />)
    expect(
      within(await card()).queryByRole('button', { name: 'Choose the game’s file' }),
    ).not.toBeInTheDocument()
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
