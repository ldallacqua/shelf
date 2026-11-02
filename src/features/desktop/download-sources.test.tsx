import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'
import en from '@messages/en.json'
import ptBR from '@messages/pt-BR.json'

import DownloadSources from './download-sources'
import { DownloadSourcesInApp } from './download-sources-later'
import type { Source } from './sources'
import { setBridgeForTests } from './tauri'

/** Download sources, with the app's commands faked (ADR 007). */

const SOURCE: Source = {
  id: 'one',
  name: 'Made-up source',
  url: 'https://files.example.invalid/source.json',
  file: null,
  addedAt: 1,
  readAt: Date.now(),
  items: 3,
  magnets: 2,
  web: 2,
  leftOut: 5,
}

let kept: Source[]
let refuse: string | undefined
let picked: Source | null

const app = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (refuse && command !== 'download_sources') throw refuse
  if (command === 'download_sources') return kept
  if (command === 'downloads_now') return []
  if (command === 'real_debrid_account') return { state: 'out' }
  if (command === 'add_source') return { ...SOURCE, url: args?.url }
  if (command === 'read_source_again') return { ...SOURCE, items: 4 }
  if (command === 'add_source_file') return picked
  return undefined
})

beforeEach(() => {
  kept = []
  refuse = undefined
  picked = null
  app.mockClear()
  setBridgeForTests(app)
})

afterEach(() => {
  setBridgeForTests(undefined)
})

const field = () => screen.getByLabelText('Source address')

describe('download sources', () => {
  it('says there are none, and warns beside the field', async () => {
    renderWithIntl(<DownloadSources />)
    expect(await screen.findByText('No sources yet.')).toBeInTheDocument()
    expect(field()).toHaveAccessibleDescription(/can’t check where its links lead/)
    expect(screen.getByRole('button', { name: 'Add source' })).toBeDisabled()
  })

  it('adds what was pasted, says nothing was downloaded, and clears the field', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await screen.findByText('No sources yet.')
    await user.type(field(), SOURCE.url)
    await user.click(screen.getByRole('button', { name: 'Add source' }))

    expect(await screen.findByRole('heading', { name: 'Made-up source' })).toBeInTheDocument()
    expect(app).toHaveBeenCalledWith('add_source', { url: SOURCE.url })
    expect(screen.getByRole('status')).toHaveTextContent(/3 downloads.*Nothing was downloaded/)
    expect(field()).toHaveValue('')
    expect(screen.queryByText('No sources yet.')).not.toBeInTheDocument()
  })

  it.each([
    ['invalid', /https address/],
    ['duplicate', /already here/],
    ['unreachable', /couldn’t connect/],
    ['refused', /only answer browsers/],
    ['large', /too large/],
    ['unsupported', /no source/],
    ['failed', /couldn’t keep/],
    ['something the app never says', /couldn’t keep/],
  ])('says why when it refuses: %s, keeping the address', async (refusal, words) => {
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await screen.findByText('No sources yet.')
    refuse = refusal
    await user.type(field(), SOURCE.url)
    await user.click(screen.getByRole('button', { name: 'Add source' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(words)
    expect(field()).toHaveValue(SOURCE.url)
    expect(field()).toBeInvalid()
    await user.type(field(), 'x')
    expect(field()).toBeValid()
  })

  it('shows what a source has, and what was left out', async () => {
    kept = [SOURCE]
    renderWithIntl(<DownloadSources />)
    const card = (await screen.findByRole('heading', { name: 'Made-up source' })).closest(
      'article',
    )!
    expect(within(card).getByText(SOURCE.url)).toBeInTheDocument()
    expect(within(card).getByText('3 downloads')).toBeInTheDocument()
    expect(within(card).getByText('2 by magnet link, 2 by web link')).toBeInTheDocument()
    expect(within(card).getByText(/5 left out/)).toBeInTheDocument()
  })

  it('reads a source again, and keeps it when that fails', async () => {
    kept = [SOURCE]
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await user.click(await screen.findByRole('button', { name: 'Read again' }))
    expect(await screen.findByText('4 downloads')).toBeInTheDocument()
    expect(app).toHaveBeenCalledWith('read_source_again', { id: 'one' })

    refuse = 'unreachable'
    await user.click(screen.getByRole('button', { name: 'Read again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t connect/)
    expect(screen.getByText('4 downloads')).toBeInTheDocument()
    // That was about a source, not about the address in the field.
    expect(field()).toBeValid()
  })

  const FROM_FILE: Source = { ...SOURCE, url: 'file:saved.json', file: 'saved.json' }
  const ASKED = { ask: 'A source you saved', files: 'Sources (JSON or text)' }

  it('adds a source from a saved file, through Windows’ picker, with no address', async () => {
    picked = FROM_FILE
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await user.click(await screen.findByRole('button', { name: 'From a saved file' }))
    expect(app).toHaveBeenCalledWith('add_source_file', { ...ASKED, replacing: null })
    const card = (await screen.findByRole('heading', { name: SOURCE.name })).closest('article')!
    expect(within(card).getByText('From a file: saved.json')).toBeInTheDocument()
    expect(within(card).queryByText('file:saved.json')).not.toBeInTheDocument()
  })

  it('changes nothing when the picker is closed', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await user.click(await screen.findByRole('button', { name: 'From a saved file' }))
    expect(screen.getByText('No sources yet.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says a file that isn’t a source is the file’s fault, not an address’s', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    const button = await screen.findByRole('button', { name: 'From a saved file' })
    refuse = 'unsupported'
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(/That file isn’t a source/)
  })

  it('reads one from a file again by choosing the file, not by an address', async () => {
    kept = [FROM_FILE]
    picked = { ...FROM_FILE, items: 9 }
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await user.click(await screen.findByRole('button', { name: 'Choose the file again' }))
    expect(app).toHaveBeenCalledWith('add_source_file', { ...ASKED, replacing: 'one' })
    expect(app).not.toHaveBeenCalledWith('read_source_again', expect.anything())
    expect(await screen.findByText('9 downloads')).toBeInTheDocument()
  })

  it('asks before removing, and removes only on yes', async () => {
    kept = [SOURCE]
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await user.click(await screen.findByRole('button', { name: 'Keep it' }))
    expect(app).not.toHaveBeenCalledWith('remove_source', { id: 'one' })

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(await screen.findByRole('button', { name: 'Remove source' }))
    await waitFor(() => expect(screen.getByText('No sources yet.')).toBeInTheDocument())
    expect(app).toHaveBeenCalledWith('remove_source', { id: 'one' })
  })

  it('says so when the app cannot be asked', async () => {
    app.mockRejectedValueOnce('failed')
    renderWithIntl(<DownloadSources />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t keep/)
  })

  it('never draws a link from a source as one to follow', async () => {
    kept = [SOURCE]
    renderWithIntl(<DownloadSources />)
    await screen.findByRole('heading', { name: 'Made-up source' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('outside the app', () => {
  it('leaves its words out of what the layout hands every visitor', () => {
    expect(en).not.toHaveProperty('DownloadSources')
    expect(ptBR).not.toHaveProperty('DownloadSources')
  })

  it('draws nothing', () => {
    setBridgeForTests(null)
    const { container } = renderWithIntl(<DownloadSourcesInApp />)
    expect(container).toBeEmptyDOMElement()
  })

  it('in the app, brings its own words, in the page’s language', async () => {
    const { container } = renderWithIntl(<DownloadSourcesInApp />, 'pt-BR')
    await screen.findByRole('heading', { name: 'Fontes de download' })
    expect(container.querySelector('[data-device]')).not.toBeNull()
  })
})
