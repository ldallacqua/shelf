import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SteamApps } from '@/domain/library/editing'
import { setBridgeForTests, type GameView, type Launcher } from '@/features/desktop/bridge'
import type { SavesView } from '@/features/desktop/saves'
import type * as SavesLater from '@/features/desktop/saves-later'
import { renderWithIntl } from '@/test/render'

import { Play } from './play'

/**
 * Play (spec 7.7), in Shelf for Windows: the app's commands are answered
 * here, by a stand-in for this computer, which never starts anything.
 */

const notices = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@/features/shell/notices', () => notices)
vi.mock('@/i18n/navigation', () => import('@/test/navigation'))
// The menu's Saves item and the panel, at once rather than as the app fetches them.
vi.mock('@/features/desktop/saves-later', async (original) => ({
  ...(await original<typeof SavesLater>()),
  SavesItem: (await import('@/features/desktop/saves-panel')).SavesItem,
  SavesLater: (await import('@/features/desktop/saves-panel')).default,
  SavesStatusLater: (await import('@/features/desktop/saves-panel')).SavesStatus,
}))
vi.mock('@/features/owner/call-api', () => ({ callApi: vi.fn(async () => ({ ok: false })) }))

const GRIM_DAWN: Launcher = {
  name: 'Grim Dawn.exe',
  path: 'D:\\Games\\Grim Dawn\\x64\\Grim Dawn.exe',
  exists: true,
}

/** This computer, as the app sees it: the files chosen, Steam's installed apps, and what a command answers. */
const computer = {
  launchers: new Map<string, Launcher>(),
  installed: [] as string[],
  picked: null as Launcher | null,
  playAnswer: undefined as string | undefined,
  /** What `game_state` answers; left out, the app is one older than the command. */
  game: undefined as GameView | undefined,
  stopAnswer: undefined as string | undefined,
  forceAnswer: undefined as string | undefined,
  /** Whether the app keeps saves (ADR 008): one older than them has no such command. */
  saves: false,
  /** What Play answers: what it did and what the look at the game's saves found; none from an old app. */
  played: null as unknown,
}

const HEAD = '20261106T120000Z-deviceot-aaaaaaaaaaaa'

/** A made-up game's saves, two copies differing: this computer's, and another's latest snapshot. */
const differing: SavesView = {
  on: true,
  matched: 'Grim Dawn',
  others: [],
  registry: false,
  cloud: [],
  manifest: true,
  base: 'D:\\Games\\Grim Dawn',
  locations: [],
  files: 1,
  bytes: 2048,
  snapshots: [
    { id: HEAD, createdAt: 1_794_000_000_000, device: 'other', files: 1, bytes: 1024, here: false },
  ],
  heads: [HEAD],
  changedAt: 1_794_100_000_000,
  state: 'choose',
  last: null,
  busy: false,
  caps: { mostMb: 500, kept: 20 },
  place: 'D:\\Synced\\Shelf saves',
  reachable: true,
  away: null,
}
const invoke = vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
  const entry = args.entry as string
  switch (command) {
    case 'launcher':
      return computer.launchers.get(entry) ?? null
    case 'steam_installed':
      return (args.apps as string[]).filter((app) => computer.installed.includes(app))
    case 'choose_launcher':
      if (computer.picked) computer.launchers.set(entry, computer.picked)
      return computer.picked
    case 'forget_launcher':
      computer.launchers.delete(entry)
      return null
    case 'play':
      if (computer.playAnswer) throw computer.playAnswer
      return computer.played
    case 'desktop_info':
      return { version: '0.14.0', device: 'here' }
    case 'saves':
      return differing
    case 'keep_saves':
      return { ...differing, state: 'in-step', heads: [] }
    case 'game_state':
      // As Tauri answers a command an app doesn't have: not one of the app's own words.
      if (!computer.game) throw 'Command game_state not found'
      return computer.game
    case 'stop_game':
      if (computer.stopAnswer) throw computer.stopAnswer
      return null
    case 'force_stop_game':
      if (computer.forceAnswer) throw computer.forceAnswer
      return null
    case 'save_caps':
      if (!computer.saves) throw 'Command save_caps not found'
      return { mostMb: 500, kept: 20 }
    default:
      throw 'invalid'
  }
})

const play = (steam?: SteamApps) =>
  renderWithIntl(<Play entryId="entry-1" title="Grim Dawn" {...(steam ? { steam } : {})} />)

beforeEach(() => {
  vi.clearAllMocks()
  computer.launchers.clear()
  computer.installed = []
  computer.picked = null
  computer.playAnswer = undefined
  computer.game = undefined
  computer.stopAnswer = undefined
  computer.forceAnswer = undefined
  computer.saves = false
  computer.played = null
  setBridgeForTests(invoke)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => setBridgeForTests(undefined))

describe('Play in a browser (spec 7.7)', () => {
  beforeEach(() => setBridgeForTests(null))

  it('opens Steam on a game the Steam sync found I own, and offers nothing else', async () => {
    const { unmount } = play({ owned: '219990', known: ['219990'] })
    expect(await screen.findByRole('link', { name: 'Play on Steam' })).toHaveAttribute(
      'href',
      'steam://rungameid/219990',
    )
    unmount()
    play({ known: ['219990'] })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Play in Shelf for Windows (spec 7.7)', () => {
  it('starts a game from the file chosen for it, whatever Steam has', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.installed = ['219990']
    play({ owned: '219990', known: ['219990'] })
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }))
    expect(invoke).toHaveBeenCalledWith('play', { entry: 'entry-1', check: true })
    expect(notices.notify).toHaveBeenCalledWith({ message: 'Starting Grim Dawn…' })
    expect(screen.queryByRole('link', { name: 'Play' })).not.toBeInTheDocument()
  })

  it('plays through Steam a game Steam has installed: the one I own, or one IGDB lists', async () => {
    computer.installed = ['219990']
    const { unmount } = play({ owned: '219990', known: ['219990'] })
    expect(await screen.findByRole('link', { name: 'Play' })).toHaveAttribute(
      'href',
      'steam://rungameid/219990',
    )
    unmount()
    play({ known: ['111', '219990'] })
    expect(await screen.findByRole('link', { name: 'Play' })).toHaveAttribute(
      'href',
      'steam://rungameid/219990',
    )
  })

  it('offers to install a game I own on Steam that is not installed here', async () => {
    play({ owned: '219990', known: ['219990'] })
    expect(await screen.findByRole('link', { name: 'Install on Steam' })).toHaveAttribute(
      'href',
      'steam://install/219990',
    )
  })

  it('asks for the game’s file when there is nothing else, and plays from it once chosen', async () => {
    computer.picked = GRIM_DAWN
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Choose the game’s file' }))
    expect(invoke).toHaveBeenCalledWith('choose_launcher', {
      entry: 'entry-1',
      title: 'The file that starts Grim Dawn',
      files: 'Games and shortcuts',
    })
    expect(await screen.findByRole('button', { name: 'Play' })).toBeEnabled()
  })

  it('keeps what was there when the picker is closed without a file', async () => {
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Choose the game’s file' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('choose_launcher', expect.anything()))
    expect(screen.getByRole('button', { name: 'Choose the game’s file' })).toBeEnabled()
  })

  it('says when the file is gone, and offers to choose it again', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.playAnswer = 'missing'
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }))
    expect(notices.notify).toHaveBeenCalledWith({
      message: 'Grim Dawn.exe is not there any more. Choose the game’s file again.',
    })
    expect(await screen.findByRole('button', { name: 'Choose the file again' })).toBeEnabled()
  })

  it('names the file in its menu, and forgets it there', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Ways to play' }))
    expect(screen.getByText('Grim Dawn.exe')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Forget the file' }))
    expect(invoke).toHaveBeenCalledWith('forget_launcher', { entry: 'entry-1' })
    expect(await screen.findByRole('button', { name: 'Choose the game’s file' })).toBeEnabled()
  })

  it('offers a game’s saves beside its file, in an app that keeps them', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    play()
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_caps', {}))
    await userEvent.click(await screen.findByRole('button', { name: 'Ways to play' }))
    expect(await screen.findByRole('menuitem', { name: 'Saves' })).toBeInTheDocument()
  })

  it('shows the saves’ state beside Play once they are on, and comes back to it from Saves', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    computer.game = { state: 'stopped', unresponsive: false, kept: true }
    const user = userEvent.setup()
    play()
    // Two copies differ: said in words, as a warning, beside Play.
    const status = await screen.findByRole('button', { name: 'Saves: Choose which to keep' })
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    await user.click(status)
    const dialog = await screen.findByRole('dialog', { name: 'Saves for Grim Dawn' })
    await within(dialog).findByRole('region', { name: 'Two copies differ' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(status).toHaveFocus()
  })

  it('shows no state beside Play while the saves are off, or in an app that can’t say', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    computer.game = { state: 'stopped', unresponsive: false, kept: false }
    const { unmount } = play()
    await screen.findByRole('button', { name: 'Play' })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_caps', {}))
    expect(screen.queryByRole('button', { name: /saves/i })).toBeNull()
    unmount()
    computer.game = { state: 'stopped', unresponsive: false }
    play()
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByRole('button', { name: /saves/i })).toBeNull()
    expect(invoke).not.toHaveBeenCalledWith('saves', expect.anything())
  })

  it('closes the menu for the Saves dialog, and Escape goes back to the menu’s button', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    const user = userEvent.setup()
    play()
    const more = await screen.findByRole('button', { name: 'Ways to play' })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('save_caps', {}))
    await user.click(more)
    await user.click(await screen.findByRole('menuitem', { name: 'Saves' }))
    const dialog = await screen.findByRole('dialog', { name: 'Saves for Grim Dawn' })
    expect(screen.queryByRole('menu')).toBeNull()
    // The menu, closing, neither took focus back nor closed what it opened.
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(more).toHaveFocus()
  })

  it('says when the game started with this computer’s saves, and how to reach them', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    computer.played = { started: true, saves: { did: 'unreachable', why: 'unreachable' } }
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }))
    await waitFor(() =>
      expect(notices.notify).toHaveBeenCalledWith({
        message:
          'Where your saves go can’t be reached, so Grim Dawn started with this computer’s saves.',
        actions: [expect.objectContaining({ label: 'Saves' })],
      }),
    )
    computer.played = { started: true, saves: { did: 'failed', why: 'damaged' } }
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() =>
      expect(notices.notify).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message:
            'The latest backup of Grim Dawn’s saves is damaged, so the game started with this computer’s saves.',
        }),
      ),
    )
  })

  it('says nothing more when the saves were in step, brought from another computer or backed up', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = { state: 'stopped', unresponsive: false }
    play()
    for (const did of ['in-step', 'restored', 'backed-up']) {
      computer.played = { started: true, saves: { did } }
      await userEvent.click(await screen.findByRole('button', { name: 'Play' }))
    }
    expect(notices.notify).not.toHaveBeenCalled()
  })

  it('waits for a choice when two copies of the saves differ, and plays the one kept', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    computer.played = { started: false, saves: { did: 'choose' } }
    const user = userEvent.setup()
    play()
    await user.click(await screen.findByRole('button', { name: 'Play' }))
    const panel = await screen.findByRole('dialog', { name: 'Saves for Grim Dawn' })
    const choice = await within(panel).findByRole('region', {
      name: 'Choose which saves to play with',
    })
    computer.played = { started: true, saves: { did: 'in-step' } }
    const cards = within(choice).getAllByRole('listitem')
    await user.click(within(cards[1]!).getByRole('button', { name: 'Keep and play' }))
    expect(invoke).toHaveBeenCalledWith('keep_saves', {
      entry: 'entry-1',
      title: 'Grim Dawn',
      apps: [],
      keep: HEAD,
    })
    await waitFor(() =>
      expect(invoke.mock.calls.filter(([command]) => command === 'play')).toHaveLength(2),
    )
    expect(invoke.mock.calls.filter(([command]) => command === 'play').at(-1)).toEqual([
      'play',
      { entry: 'entry-1', check: true },
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('plays with this computer’s saves when the choice is left for later', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.saves = true
    computer.played = { started: false, saves: { did: 'choose' } }
    const user = userEvent.setup()
    play()
    await user.click(await screen.findByRole('button', { name: 'Play' }))
    const panel = await screen.findByRole('dialog', { name: 'Saves for Grim Dawn' })
    computer.played = { started: true, saves: null }
    await user.click(await within(panel).findByRole('button', { name: 'Decide later' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('play', { entry: 'entry-1', check: false }),
    )
    expect(invoke).not.toHaveBeenCalledWith('keep_saves', expect.anything())
  })

  it('says when the saves are still being backed up or put back, and starts nothing', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.playAnswer = 'busy'
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }))
    await waitFor(() =>
      expect(notices.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Grim Dawn’s saves are still being backed up or put back. Press Play again in a moment.',
        }),
      ),
    )
  })

  it('offers no saves in an app older than them', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Ways to play' }))
    expect(screen.getByRole('menuitem', { name: 'Forget the file' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Saves' })).toBeNull()
  })

  it('lets a file be chosen in place of Steam', async () => {
    computer.installed = ['219990']
    computer.picked = GRIM_DAWN
    play({ owned: '219990', known: ['219990'] })
    await userEvent.click(await screen.findByRole('button', { name: 'Ways to play' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose a file instead…' }))
    expect(await screen.findByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: 'Play' })).not.toBeInTheDocument()
  })
})

describe('Whether the game is running, in Shelf for Windows (issue 102)', () => {
  const stopped: GameView = { state: 'stopped', unresponsive: false }
  const starting: GameView = { state: 'starting', unresponsive: false }
  const running: GameView = { state: 'running', unresponsive: false }
  const stopping: GameView = { state: 'stopping', unresponsive: false }
  const hanging: GameView = { state: 'stopping', unresponsive: true }

  /** The window comes back to the front: the state is looked at again, without waiting. */
  const lookAgain = () => act(() => void window.dispatchEvent(new Event('focus')))

  it('turns Play to Stop when the game runs, whoever started it, and back when it closes', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = stopped
    play()
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()

    computer.game = running
    lookAgain()
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Grim Dawn is running')

    // Closed from the game: looked for once more before anyone is told, so a hand-over between
    // two programs doesn't flicker.
    computer.game = stopped
    lookAgain()
    expect(await screen.findByRole('button', { name: 'Play' }, { timeout: 3_000 })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('Grim Dawn has closed')
  })

  it('never offers Play for a moment on a game already running', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = running
    play()
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
    const names = invoke.mock.calls.map(([command]) => command)
    expect(names).toContain('game_state')
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })

  it('says Starting after Play and starts nothing twice, keeping keyboard focus', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = stopped
    play()
    const button = await screen.findByRole('button', { name: 'Play' })
    computer.game = starting
    await userEvent.click(button)
    const pressed = await screen.findByRole('button', { name: 'Starting…' })
    expect(pressed).toHaveAttribute('aria-disabled', 'true')
    expect(pressed).toHaveFocus()
    await userEvent.click(pressed)
    expect(invoke.mock.calls.filter(([command]) => command === 'play')).toHaveLength(1)
    // The button says it: no notice as well.
    expect(notices.notify).not.toHaveBeenCalled()
  })

  it('says Syncing while a closed game’s saves are backed up, and starts nothing until Play is back', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = { ...stopped, kept: true, syncing: { step: 'sending', done: 1, total: 4 } }
    play()
    const syncing = await screen.findByRole('button', { name: 'Syncing… 25%' })
    expect(syncing).toHaveAttribute('aria-disabled', 'true')
    await userEvent.tab()
    expect(syncing).toHaveFocus()
    // How long it waits, said where it waits.
    expect((await screen.findAllByRole('tooltip'))[0]).toHaveTextContent(
      'If the connection stalls for 30 seconds, Shelf stops waiting',
    )
    await userEvent.click(syncing)
    expect(invoke).not.toHaveBeenCalledWith('play', expect.anything())
    // A step that can't say how far: no percent.
    computer.game = { ...stopped, kept: true, syncing: { step: 'reading' } }
    lookAgain()
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeInTheDocument()
    computer.game = { ...stopped, kept: true }
    lookAgain()
    expect(await screen.findByRole('button', { name: 'Play' })).toBeEnabled()
  })

  it('says Syncing after Play while a kept game’s saves are looked at, then Starting', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = { ...stopped, kept: true }
    let started = () => {}
    computer.played = new Promise((resolve) => {
      started = () => resolve({ started: true, saves: { did: 'restored' } })
    })
    play()
    const button = await screen.findByRole('button', { name: 'Play' })
    computer.game = { ...stopped, kept: true, syncing: { step: 'fetching', done: 3, total: 4 } }
    await userEvent.click(button)
    const pressed = await screen.findByRole('button', { name: 'Syncing… 75%' })
    expect(pressed).toHaveAttribute('aria-disabled', 'true')
    // The same button: keyboard focus stays on it.
    expect(pressed).toHaveFocus()
    computer.game = { ...starting, kept: true }
    await act(async () => started())
    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeInTheDocument()
  })

  it('names the game and its Steam apps, and never a process or a path', async () => {
    computer.installed = ['219990']
    computer.game = running
    play({ owned: '219990', known: ['219990', '111'] })
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(invoke).toHaveBeenCalledWith('game_state', { entry: 'entry-1', apps: ['219990'] })
    expect(invoke).toHaveBeenCalledWith('stop_game', { entry: 'entry-1', apps: ['219990'] })
  })

  it('says Stopping until the app says the game has gone', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = running
    play()
    const stop = await screen.findByRole('button', { name: 'Stop' })
    computer.game = stopping
    await userEvent.click(stop)
    const asked = await screen.findByRole('button', { name: 'Stopping…' })
    expect(asked).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(asked)
    expect(invoke.mock.calls.filter(([command]) => command === 'stop_game')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()

    computer.game = stopped
    expect(await screen.findByRole('button', { name: 'Play' }, { timeout: 4_000 })).toBeEnabled()
  })

  it('keeps it running and says why when Windows refuses to ask it', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = running
    computer.stopAnswer = 'refused'
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(notices.notify).toHaveBeenCalledWith({
      message: 'Windows did not let Shelf close Grim Dawn. Close it from the game.',
    })
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('offers Force stop only when the game doesn’t answer, and only after asking', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = hanging
    play()
    const force = await screen.findByRole('button', { name: 'Force stop' })
    expect(notices.notify).toHaveBeenCalledWith({
      message: 'Grim Dawn isn’t answering. You can try again, or force it to stop.',
    })
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

    await userEvent.click(force)
    const question = await screen.findByRole('alertdialog', { name: 'Force Grim Dawn to stop?' })
    expect(question).toHaveTextContent('Anything not saved will be lost')
    expect(invoke).not.toHaveBeenCalledWith('force_stop_game', expect.anything())
    // What changes nothing is where focus starts, and Escape answers it.
    expect(within(question).getByRole('button', { name: 'Keep it open' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(invoke).not.toHaveBeenCalledWith('force_stop_game', expect.anything())
    // Back on the control that asked, so the keyboard keeps its place.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Force stop' })).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Force stop' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Force stop' }),
    )
    expect(invoke).toHaveBeenCalledWith('force_stop_game', { entry: 'entry-1', apps: [] })
  })

  it('takes the question away when the game closes by itself meanwhile', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = hanging
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Force stop' }))
    await screen.findByRole('alertdialog')
    computer.game = stopped
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(), {
      timeout: 4_000,
    })
    expect(invoke).not.toHaveBeenCalledWith('force_stop_game', expect.anything())
  })

  it('stays as it is and says so when even Force stop is refused', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = hanging
    computer.forceAnswer = 'refused'
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Force stop' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Force stop' }),
    )
    await waitFor(() =>
      expect(notices.notify).toHaveBeenCalledWith({
        message: 'Windows did not let Shelf close Grim Dawn. Close it from the game.',
      }),
    )
    expect(screen.getByRole('button', { name: 'Force stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })

  it.each([
    ['steam', 'Running', 'Steam says this game is running'],
    ['denied', 'Running', 'Windows won’t let Shelf check'],
    ['open', 'Open', 'still open'],
  ] as const)(
    'explains what it can’t tell (%s), with no Stop and no Play',
    async (why, label, words) => {
      computer.launchers.set('entry-1', GRIM_DAWN)
      computer.game = { state: 'unverified', why, unresponsive: false }
      play()
      const shown = await screen.findByRole('button', { name: label })
      expect(shown).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
      await userEvent.tab()
      expect(shown).toHaveFocus()
      expect((await screen.findAllByRole('tooltip'))[0]).toHaveTextContent(words)
      await userEvent.click(shown)
      expect(invoke).not.toHaveBeenCalledWith('stop_game', expect.anything())
    },
  )

  it('says Starting after a game is sent to Steam, which can’t say so itself', async () => {
    computer.installed = ['219990']
    computer.game = stopped
    play({ owned: '219990', known: ['219990'] })
    const link = await screen.findByRole('link', { name: 'Play' })
    // The window hands this link to Steam; here it goes nowhere.
    link.addEventListener('click', (event) => event.preventDefault())
    await userEvent.click(link)
    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeInTheDocument()

    computer.game = running
    lookAgain()
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('asks nothing while the window is hidden, and looks as soon as it is back', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = stopped
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    play()
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('launcher', expect.anything()))
    lookAgain()
    expect(invoke).not.toHaveBeenCalledWith('game_state', expect.anything())

    visibility.mockReturnValue('visible')
    computer.game = running
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
    visibility.mockRestore()
  })

  it('looks again at once when the file changes', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    computer.game = stopped
    computer.picked = { ...GRIM_DAWN, name: 'Other.exe', path: 'D:\\Other\\Other.exe' }
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Ways to play' }))
    computer.game = running
    await userEvent.click(screen.getByRole('menuitem', { name: 'Change the file…' }))
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('leaves Play as it was in an app older than the command', async () => {
    computer.launchers.set('entry-1', GRIM_DAWN)
    play()
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }))
    expect(notices.notify).toHaveBeenCalledWith({ message: 'Starting Grim Dawn…' })
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it('asks nothing of the kind in a browser', async () => {
    setBridgeForTests(null)
    play({ owned: '219990', known: ['219990'] })
    expect(await screen.findByRole('link', { name: 'Play on Steam' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })
})
