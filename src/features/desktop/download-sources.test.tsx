import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import DownloadSources from './download-sources'
import { DownloadSourcesInApp } from './download-sources-later'
import type { Source } from './sources'
import { setBridgeForTests } from './tauri'

/** Download sources, with the app's commands faked (ADR 007). */

const SOURCE: Source = {
  id: 'one',
  name: 'Made-up source',
  url: 'https://files.example.invalid/source.json',
  addedAt: 1,
  readAt: Date.now(),
  items: 3,
  magnets: 2,
  web: 2,
  leftOut: 5,
}

let kept: Source[]
let refuse: string | undefined

const app = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (refuse && command !== 'download_sources') throw refuse
  if (command === 'download_sources') return kept
  if (command === 'add_source') return { ...SOURCE, url: args?.url }
  if (command === 'read_source_again') return { ...SOURCE, items: 4 }
  return undefined
})

beforeEach(() => {
  kept = []
  refuse = undefined
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
    ['unreachable', /didn’t answer/],
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
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t answer/)
    expect(screen.getByText('4 downloads')).toBeInTheDocument()
    // That was about a source, not about the address in the field.
    expect(field()).toBeValid()
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
  it('draws nothing', () => {
    setBridgeForTests(null)
    const { container } = renderWithIntl(<DownloadSourcesInApp />)
    expect(container).toBeEmptyDOMElement()
  })

  it('in the app, stands apart from what a browser shows', async () => {
    const { container } = renderWithIntl(<DownloadSourcesInApp />)
    await screen.findByRole('heading', { name: 'Download sources' })
    expect(container.querySelector('[data-device]')).not.toBeNull()
  })
})
