import { z } from 'zod'

import { call, launchersChanged } from './tauri'

/**
 * Shelf for Windows' commands (ADR 005, section 3) that answer with data, as
 * Shelf's own pages ask them through `tauri.ts`. Every answer passes a schema
 * first, as everything read from outside does. Zod comes with it, so only
 * code that a page fetches when it needs it imports this (Play, in the
 * editor's own chunk): the header's window controls import `tauri.ts` alone.
 */

export { inDesktopApp, refusalOf, refusals, setBridgeForTests, type Refusal } from './tauri'

const launcherSchema = z.object({ name: z.string(), path: z.string(), exists: z.boolean() })

/** A game's file on this computer: its name, where it is, and whether it is still there. */
export type Launcher = z.infer<typeof launcherSchema>

const gameViewSchema = z.object({
  state: z.enum(['stopped', 'starting', 'running', 'stopping', 'unverified']),
  why: z.enum(['steam', 'denied', 'open']).optional(),
  unresponsive: z.boolean(),
})

/**
 * What is running of a game on this computer, as the app can tell (ADR 005, section 11).
 * `unverified`: something may be, and the app can't tell or can't touch it, which `why` says;
 * `unresponsive`: asked to close, and still there.
 */
export type GameView = z.infer<typeof gameViewSchema>

export const desktop = {
  /** The file chosen for a game on this computer, or null. */
  launcher: async (entry: string): Promise<Launcher | null> =>
    launcherSchema.nullable().parse(await call('launcher', { entry })),
  /** Windows' file picker for a game, titled `title`, its files called `files`; null when closed. */
  choose: async (entry: string, title: string, files: string): Promise<Launcher | null> => {
    const chosen = launcherSchema
      .nullable()
      .parse(await call('choose_launcher', { entry, title, files }))
    if (chosen) launchersChanged()
    return chosen
  },
  forget: async (entry: string): Promise<void> => {
    await call('forget_launcher', { entry })
    launchersChanged()
  },
  /** Explorer, at the game's file. */
  show: async (entry: string): Promise<void> => {
    await call('show_launcher', { entry })
  },
  /** Starts a game from its file. */
  play: async (entry: string): Promise<void> => {
    await call('play', { entry })
  },
  /** Of these Steam apps, the ones Steam has installed on this computer. */
  steamInstalled: async (apps: readonly string[]): Promise<string[]> =>
    z.array(z.string()).parse(await call('steam_installed', { apps })),
  /** What is running of a game: its entry, and its Steam apps installed here. */
  gameState: async (entry: string, apps: readonly string[]): Promise<GameView> =>
    gameViewSchema.parse(await call('game_state', { entry, apps })),
  /** Asks a game to close. It has stopped once `gameState` says so. */
  stopGame: async (entry: string, apps: readonly string[]): Promise<void> => {
    await call('stop_game', { entry, apps })
  },
  /** Ends a game at once, what it has not saved lost. Only after the person has said so. */
  forceStopGame: async (entry: string, apps: readonly string[]): Promise<void> => {
    await call('force_stop_game', { entry, apps })
  },
}
