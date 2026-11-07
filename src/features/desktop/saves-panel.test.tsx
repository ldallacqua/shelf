import { renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { callApi } from '@/features/owner/call-api'
import { renderWithIntl } from '@/test/render'

import type { SavesView } from './saves'
import SavesPanel from './saves-panel'
import { SavesLater, useSavesAvailable } from './saves-later'
import { setBridgeForTests } from './tauri'

/** A game's saves, from its page, with the app's commands faked (ADR 008). Made-up games only. */

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
vi.mock('@/features/owner/call-api', () => ({ callApi: vi.fn() }))

const HERE = 'device-here'
const OTHER = 'device-other'
const DAY = 24 * 60 * 60 * 1000

const view = (changes: Partial<SavesView> = {}): SavesView => ({
  on: true,
  matched: 'Made-up Game',
  others: [],
  registry: false,
  cloud: [],
  manifest: true,
  base: 'D:\\Games\\Made-up Game',
  locations: [
    {
      text: '<winAppData>/Made-up Game/saves',
      shown: 'C:\\Users\\Someone\\AppData\\Roaming\\Made-up Game\\saves',
      added: false,
      files: 2,
      bytes: 2048,
      refused: false,
    },
    {
      text: '<winDocuments>/Made-up Game',
      shown: 'C:\\Users\\Someone\\Documents\\Made-up Game',
      added: false,
      files: 0,
      bytes: 0,
      refused: false,
    },
  ],
  files: 2,
  bytes: 2048,
  snapshots: [
    {
      id: '20261107T193000Z-devicehe-0f1e2d3c4b5a',
      createdAt: Date.now() - DAY,
      device: HERE,
      files: 2,
      bytes: 2048,
      here: true,
    },
    {
      id: '20261106T120000Z-deviceot-aaaaaaaaaaaa',
      createdAt: Date.now() - 2 * DAY,
      device: OTHER,
      files: 1,
      bytes: 1024,
      here: false,
    },
    {
      id: '20261105T120000Z-computer-bbbbbbbbbbbb',
      createdAt: Date.now() - 3 * DAY,
      device: 'device-gone',
      files: 1,
      bytes: 1024,
      here: false,
    },
  ],
  state: 'in-step',
  last: null,
  busy: false,
  caps: { mostMb: 500, kept: 20 },
  ...changes,
})

let answer: SavesView
let refusal: string | undefined

const app = vi.fn(async (command: string) => {
  if (command === 'desktop_info') return { version: '0.13.0', device: HERE }
  if (command === 'save_caps') return { mostMb: 500, kept: 20 }
  if (refusal && command !== 'saves') throw refusal
  if (command === 'back_up_saves') return { ...answer, last: { at: 1, did: 'backed-up' } }
  if (command === 'add_save_folder') return null
  return answer
})

beforeEach(() => {
  answer = view()
  refusal = undefined
  app.mockClear()
  setBridgeForTests(app)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.mocked(callApi).mockResolvedValue({
    ok: true,
    value: {
      devices: [
        { id: HERE, number: 1 },
        { id: OTHER, number: 2, name: 'Living room' },
      ],
    },
  })
})

afterEach(() => {
  setBridgeForTests(undefined)
})

const GAME = { entryId: 'made-up-entry', title: 'Made-up Game', apps: ['1000001'] }
const named = { entry: GAME.entryId, title: GAME.title, apps: GAME.apps }

const opened = async () => {
  const user = userEvent.setup()
  renderWithIntl(
    <SavesPanel {...GAME} open onOpenChange={() => undefined} anchor={{ current: null }} />,
  )
  const panel = await screen.findByRole('dialog', { name: 'Saves for Made-up Game' })
  await within(panel).findByText('Snapshots')
  return { user, panel }
}

describe('a game’s saves', () => {
  it('are offered only by an app that keeps them', async () => {
    const { result } = renderHook(() => useSavesAvailable())
    await vi.waitFor(() => expect(result.current).toBe(true))
  })

  it('are not offered by an app older than them', async () => {
    setBridgeForTests(async () => {
      throw 'command save_caps not found'
    })
    const { result } = renderHook(() => useSavesAvailable())
    await new Promise((settle) => setTimeout(settle, 10))
    expect(result.current).toBe(false)
  })

  it('draw nothing outside the app, and ask nothing', () => {
    setBridgeForTests(null)
    const { container } = renderWithIntl(
      <SavesLater {...GAME} open onOpenChange={() => undefined} anchor={{ current: null }} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(app).not.toHaveBeenCalled()
  })

  it('say where they were found, and count the places with nothing there', async () => {
    const { panel } = await opened()
    expect(app).toHaveBeenCalledWith('saves', named)
    expect(
      within(panel).getByText('C:\\Users\\Someone\\AppData\\Roaming\\Made-up Game\\saves'),
    ).toBeInTheDocument()
    expect(within(panel).queryByText('C:\\Users\\Someone\\Documents\\Made-up Game')).toBeNull()
    expect(within(panel).getByText(/1 more place in the list/)).toBeInTheDocument()
    expect(within(panel).getByText('Found in PCGamingWiki’s list as Made-up Game.')).toBeVisible()
    expect(within(panel).getByRole('link', { name: 'PCGamingWiki' })).toHaveAttribute(
      'href',
      'https://www.pcgamingwiki.com/',
    )
  })

  it('name the computer each snapshot was made on', async () => {
    const { panel } = await opened()
    const rows = within(panel)
      .getAllByRole('listitem')
      .filter((row) => row.closest('ol'))
    await vi.waitFor(() => expect(rows[0]).toHaveTextContent('this computer'))
    expect(rows[1]).toHaveTextContent('Living room')
    expect(rows[2]).toHaveTextContent('another computer')
    // What is here now is said in words, and has nothing to restore.
    expect(rows[0]).toHaveTextContent('On this computer now')
    expect(within(rows[0]!).queryByRole('button', { name: 'Restore' })).toBeNull()
    expect(within(rows[1]!).getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })

  it('turn on and off', async () => {
    answer = view({ on: false, snapshots: [], state: 'changed' })
    const { user, panel } = await opened()
    await user.click(within(panel).getByRole('switch', { name: 'Back up this game’s saves' }))
    expect(app).toHaveBeenCalledWith('turn_saves', { ...named, on: true })
  })

  it('back up now, and say so', async () => {
    const { user, panel } = await opened()
    await user.click(within(panel).getByRole('button', { name: 'Back up now' }))
    expect(app).toHaveBeenCalledWith('back_up_saves', named)
    expect(await within(panel).findByRole('status')).toHaveTextContent('Backed up.')
  })

  it('say why when the game is running', async () => {
    refusal = 'running'
    const { user, panel } = await opened()
    await user.click(within(panel).getByRole('button', { name: 'Back up now' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Close Made-up Game first: Shelf never touches its saves while it runs.',
    )
  })

  it('restore only once asked, what is here kept first', async () => {
    const { user, panel } = await opened()
    const row = within(panel)
      .getAllByRole('listitem')
      .filter((each) => each.closest('ol'))[1]!
    await user.click(within(row).getByRole('button', { name: 'Restore' }))
    const question = await screen.findByRole('alertdialog')
    expect(question).toHaveTextContent('kept as a backup first')
    expect(app).not.toHaveBeenCalledWith('restore_saves', expect.anything())
    await user.click(within(question).getByRole('button', { name: 'Restore' }))
    expect(app).toHaveBeenCalledWith('restore_saves', {
      ...named,
      snapshot: '20261106T120000Z-deviceot-aaaaaaaaaaaa',
    })
    expect(await within(panel).findByRole('status')).toHaveTextContent('Put back the saves from')
  })

  it('leave a place out', async () => {
    const { user, panel } = await opened()
    await user.click(
      within(panel).getByRole('button', {
        name: 'Leave out C:\\Users\\Someone\\AppData\\Roaming\\Made-up Game\\saves',
      }),
    )
    expect(app).toHaveBeenCalledWith('remove_save_location', {
      ...named,
      location: '<winAppData>/Made-up Game/saves',
    })
  })

  it('change nothing when the folder picker is closed', async () => {
    const { user, panel } = await opened()
    await user.click(within(panel).getByRole('button', { name: 'Add a folder' }))
    expect(app).toHaveBeenCalledWith('add_save_folder', {
      ...named,
      ask: 'Choose the folder where Made-up Game saves',
    })
    expect(within(panel).queryByRole('alert')).toBeNull()
  })

  it('say when the list doesn’t know the game, or couldn’t be read', async () => {
    answer = view({ matched: null, locations: [], files: 0, bytes: 0 })
    const { panel } = await opened()
    expect(within(panel).getByText(/doesn’t say where this game saves/)).toBeInTheDocument()
    // Nothing to back up: the button can't be pressed.
    expect(within(panel).getByRole('button', { name: 'Back up now' })).toBeDisabled()
  })

  it('say which stores carry the game’s saves themselves', async () => {
    answer = view({ cloud: ['steam', 'gog', 'somewhere-new'] })
    const { panel } = await opened()
    expect(within(panel).getByText(/Steam and GOG keep this game’s saves/)).toBeInTheDocument()
  })
})
