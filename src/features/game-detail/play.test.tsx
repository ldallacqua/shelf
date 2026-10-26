import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SteamApps } from '@/domain/library/editing'
import { setBridgeForTests, type Launcher } from '@/features/desktop/bridge'
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
