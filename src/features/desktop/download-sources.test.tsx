import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'
import en from '@messages/en.json'
import ptBR from '@messages/pt-BR.json'

import DownloadSources from './download-sources'
import { AppOnly } from '@/features/settings/app-only'
import type { Source } from './sources'
import { setBridgeForTests } from './tauri'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
// This computer's name is its own section, with its own tests (`this-computer.test.tsx`).
vi.mock('./this-computer', () => ({ ThisComputer: () => null }))

/** Download sources, with the app's commands faked (ADR 007). */

const SOURCE: Source = {
  id: 'one',
  name: 'Made-up source',
  url: 'https://files.example.invalid/source.json',
  file: null,
  trouble: null,
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
let going: { done: number; total: number } | null
let tooOld: boolean
let ended: { read: number; failed: number; stopped: boolean }
const WINDOW = 'Shelf is reading a source. If this asks you something, answer here.'

const app = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (refuse && command !== 'download_sources') throw refuse
  if (command === 'download_sources') return kept
  if (command === 'downloads_now') return []
  if (command === 'real_debrid_account') return { state: 'out' }
  if (command === 'add_source') return { ...SOURCE, url: args?.url }
  if (command === 'read_source_again') return { ...SOURCE, items: 4 }
  if (command === 'reading_all_sources') {
    if (tooOld) throw 'not allowed'
    return going
  }
  if (command === 'read_all_sources') return ended
  if (command === 'add_source_file') return picked
  return undefined
})

beforeEach(() => {
  kept = []
  refuse = undefined
  picked = null
  going = null
  tooOld = false
  ended = { read: 1, failed: 0, stopped: false }
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
    expect(app).toHaveBeenCalledWith('add_source', { url: SOURCE.url, ask: WINDOW })
    expect(screen.getByRole('status')).toHaveTextContent(/3 downloads.*Nothing was downloaded/)
    expect(field()).toHaveValue('')
    expect(screen.queryByText('No sources yet.')).not.toBeInTheDocument()
  })

  it.each([
    ['invalid', /https address/],
    ['duplicate', /already here/],
    ['unreachable', /couldn’t connect/],
    ['name', /couldn’t find that address/],
    ['secure', /secure connection/],
    ['slow', /too long to answer/],
    ['refused', /answered without the file/],
    ['closed', /window closed/],
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
    expect(app).toHaveBeenCalledWith('read_source_again', { id: 'one', ask: WINDOW })

    refuse = 'unreachable'
    await user.click(screen.getByRole('button', { name: 'Read again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t connect/)
    expect(screen.getByText('4 downloads')).toBeInTheDocument()
    // That was about a source, not about the address in the field.
    expect(field()).toBeValid()
  })

  it('says on the card that a reading by itself failed, and that the list stays', async () => {
    kept = [{ ...SOURCE, trouble: 'slow' }]
    renderWithIntl(<DownloadSources />)
    expect(
      await screen.findByText(/The last reading failed, and the list it has stays\. .*too long/),
    ).toBeInTheDocument()
  })

  it('reads them all when asked, saying what it will open', async () => {
    kept = [SOURCE]
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    expect(await screen.findByText(/open in a window, one at a time/)).toBeInTheDocument()
    expect(app).not.toHaveBeenCalledWith('read_all_sources', expect.anything())
    await user.click(screen.getByRole('button', { name: 'Read all' }))
    expect(app).toHaveBeenCalledWith('read_all_sources', { ask: WINDOW })
    expect(await screen.findByRole('status')).toHaveTextContent('Read 1.')
  })

  it.each([
    [{ read: 3, failed: 2, stopped: false }, 'Read 3. 2 failed: their cards say why.'],
    [{ read: 1, failed: 1, stopped: false }, 'Read 1. 1 failed: its card says why.'],
    [{ read: 2, failed: 0, stopped: true }, 'Read 2. You closed the window, so the rest stay'],
  ])('says how it ended: %o', async (how, words) => {
    kept = [SOURCE]
    ended = how
    const user = userEvent.setup()
    renderWithIntl(<DownloadSources />)
    await user.click(await screen.findByRole('button', { name: 'Read all' }))
    expect(await screen.findByRole('status')).toHaveTextContent(words)
  })

  it('shows one going when the page opens, and offers nothing else meanwhile', async () => {
    kept = [SOURCE]
    going = { done: 2, total: 12 }
    renderWithIntl(<DownloadSources />)
    const button = await screen.findByRole('button', { name: 'Reading 3 of 12…' })
    expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Read again' })).toBeDisabled()
  })

  it('doesn’t offer it on an app too old to do it', async () => {
    kept = [SOURCE]
    tooOld = true
    renderWithIntl(<DownloadSources />)
    await screen.findByRole('button', { name: 'Read again' })
    expect(screen.queryByRole('button', { name: 'Read all' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('doesn’t offer it when every source is a saved file', async () => {
    kept = [{ ...SOURCE, url: 'file:a.json', file: 'a.json' }]
    renderWithIntl(<DownloadSources />)
    await screen.findByRole('button', { name: 'Choose the file again' })
    expect(screen.queryByRole('button', { name: 'Read all' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: SOURCE.url })).not.toBeInTheDocument()
  })
})

describe('outside the app', () => {
  it('leaves its words out of what the layout hands every visitor', () => {
    expect(en).not.toHaveProperty('DownloadSources')
    expect(ptBR).not.toHaveProperty('DownloadSources')
  })

  it('says whose page it is, and shows nothing of the app’s', () => {
    setBridgeForTests(null)
    const { container } = renderWithIntl(<AppOnly page="download-sources" />)
    expect(screen.getByRole('heading', { name: 'Part of Shelf for Windows' })).toBeInTheDocument()
    // Alive in a browser, nothing holds the app's place: a page is done when its ghosts are gone.
    expect(container.querySelector('.ghost')).toBeNull()
    expect(screen.getByRole('link', { name: 'All settings' })).toHaveAttribute(
      'href',
      '/en/settings',
    )
    expect(screen.queryByRole('heading', { name: 'Your sources' })).not.toBeInTheDocument()
  })

  it('in the app, brings its own words, in the page’s language', async () => {
    const { container } = renderWithIntl(<AppOnly page="download-sources" />, 'pt-BR')
    await screen.findByRole('heading', { level: 1, name: 'Fontes de download' })
    expect(screen.getByRole('heading', { name: 'Suas fontes' })).toBeInTheDocument()
    expect(screen.getByText('Este aparelho')).toBeInTheDocument()
    expect(container.querySelector('[data-device]')).not.toBeNull()
  })
})
