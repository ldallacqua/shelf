import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SteamApps } from '@/domain/library/editing'
import { setBridgeForTests, type GameView, type Launcher } from '@/features/desktop/bridge'
import { renderWithIntl } from '@/test/render'

import { Play } from './play'

/**
 * Play (spec 7.7), in Shelf for Windows: the app's commands are answered
 * here, by a stand-in for this computer, which never starts anything.
 */

const notices = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@/features/shell/notices', () => notices)

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
      return null
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
  setBridgeForTests(invoke)
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
    expect(invoke).toHaveBeenCalledWith('play', { entry: 'entry-1' })
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
