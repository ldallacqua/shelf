import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import FindDownload from './find-download'
import { FindDownloadLater } from './find-download-later'
import type { Found } from './sources'
import { setBridgeForTests } from './tauri'

/** Finding a download from a game's page, with the app's commands faked (ADR 007). */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const FOUND: Found = {
  source: 'one',
  sourceName: 'Made-up source',
  place: 3,
  title: 'Made-up Game v1.2',
  fileSize: '12.4 GB',
  uploadDate: '2026-10-20T12:00:00.000Z',
  web: 1,
  magnets: 1,
  inParts: false,
}

let sources: unknown[]
let found: Found[]
let started: unknown
let account: unknown

const app = vi.fn(async (command: string) => {
  if (command === 'download_sources') return sources
  if (command === 'search_sources') return found
  if (command === 'real_debrid_account') return account
  if (command === 'start_download') {
    if (typeof started === 'string') throw started
    return started
  }
  return undefined
})

beforeEach(() => {
  sources = [{ id: 'one' }].map((source) => ({
    ...source,
    name: 'Made-up source',
    url: 'https://files.example.invalid/source.json',
    addedAt: 1,
    readAt: 1,
    items: 1,
    magnets: 0,
    web: 1,
    leftOut: 0,
  }))
  found = [FOUND]
  started = true
  account = { state: 'out' }
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

const opened = async () => {
  const user = userEvent.setup()
  renderWithIntl(<FindDownload title="Made-up Game" />)
  await user.click(await screen.findByRole('button', { name: 'Find a download' }))
  return user
}

describe('finding a download', () => {
  it('draws nothing with no source to search', async () => {
    sources = []
    renderWithIntl(<FindDownload title="Made-up Game" />)
    await vi.waitFor(() => expect(app).toHaveBeenCalledWith('download_sources', {}))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('draws nothing outside the app, and asks nothing', () => {
    setBridgeForTests(null)
    const { container } = renderWithIntl(<FindDownloadLater title="Made-up Game" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('searches for the game’s name, and says what a person chooses by', async () => {
    await opened()
    const row = (await screen.findByText('Made-up Game v1.2')).closest('li')!
    expect(app).toHaveBeenCalledWith('search_sources', { words: 'Made-up Game' })
    expect(within(row).getByText(/12.4 GB · Made-up source · Oct 20, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Download only what you have the right to/)).toBeInTheDocument()
  })

  it('searches for other words when asked', async () => {
    const user = await opened()
    await screen.findByText('Made-up Game v1.2')
    const field = screen.getByLabelText('Every one of these words')
    await user.clear(field)
    await user.type(field, 'Made-up{Enter}')
    expect(app).toHaveBeenCalledWith('search_sources', { words: 'Made-up' })
  })

  it('names a download by its place and what was shown there, with no link', async () => {
    const user = await opened()
    await user.click(await screen.findByRole('button', { name: 'Download Made-up Game v1.2' }))
    expect(app).toHaveBeenCalledWith('start_download', {
      source: 'one',
      place: 3,
      title: 'Made-up Game v1.2',
      ask: 'Where to save Made-up Game v1.2',
      through: 'direct',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/On its way/)
    expect(
      screen.getByRole('button', { name: 'In your downloads: Made-up Game v1.2' }),
    ).toBeDisabled()
  })

  it('changes nothing when the folder picker is closed', async () => {
    started = false
    const user = await opened()
    await user.click(await screen.findByRole('button', { name: 'Download Made-up Game v1.2' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Download Made-up Game v1.2' })).toBeEnabled(),
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([
    ['duplicate', /already in your downloads/],
    ['missing', /has changed/],
    ['signedout', /isn’t signed in/],
    ['failed', /couldn’t do that/],
  ])('says why it did not start: %s', async (refusal, words) => {
    started = refusal
    const user = await opened()
    await user.click(await screen.findByRole('button', { name: 'Download Made-up Game v1.2' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(words)
  })

  it('has no button for what it can’t download, and says why', async () => {
    found = [
      { ...FOUND, place: 1, title: 'Magnet only', web: 0 },
      { ...FOUND, place: 2, title: 'In parts', web: 0, magnets: 0, inParts: true },
    ]
    await opened()
    const magnet = (await screen.findByText('Magnet only')).closest('li')!
    expect(magnet).toHaveTextContent(/needs Real-Debrid/)
    expect(within(magnet).getByRole('link', { name: 'Real-Debrid' })).toHaveAttribute(
      'href',
      '/en/account',
    )
    expect(within(magnet).queryByRole('button')).not.toBeInTheDocument()
    const parts = screen.getByText('In parts').closest('li')!
    expect(parts).toHaveTextContent(/several parts/)
    expect(within(parts).queryByRole('button')).not.toBeInTheDocument()
  })

  it('signed in to Real-Debrid, offers it for what has any link at all', async () => {
    account = { state: 'in', username: 'made-up', premium: true, until: null }
    found = [
      { ...FOUND, place: 1, title: 'Magnet only', web: 0 },
      { ...FOUND, place: 2, title: 'Both' },
      { ...FOUND, place: 3, title: 'In parts', web: 0, magnets: 0, inParts: true },
    ]
    const user = await opened()
    const magnet = (await screen.findByText('Magnet only')).closest('li')!
    expect(within(magnet).getAllByRole('button')).toHaveLength(1)
    expect(within(screen.getByText('Both').closest('li')!).getAllByRole('button')).toHaveLength(2)
    expect(within(screen.getByText('In parts').closest('li')!).getAllByRole('button')).toHaveLength(
      1,
    )

    await user.click(screen.getByRole('button', { name: 'Through Real-Debrid: Magnet only' }))
    expect(app).toHaveBeenCalledWith('start_download', {
      source: 'one',
      place: 1,
      title: 'Magnet only',
      ask: 'Where to save Magnet only',
      through: 'realdebrid',
    })
  })

  it('says when nothing has every word', async () => {
    found = []
    await opened()
    expect(await screen.findByText(/has every one of those words/)).toBeInTheDocument()
  })
})
