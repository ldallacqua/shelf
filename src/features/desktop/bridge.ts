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
  /** Whether its saves are kept, so Play looks at them first; none from an app older than 0.17.0. */
  kept: z.boolean().optional(),
  /** Its saves being worked on now, and how far once a step has said; none from an app older than 0.17.0. */
  syncing: z
    .object({
      step: z.enum(['reading', 'packing', 'sending', 'fetching', 'restoring']).optional(),
      done: z.number().optional(),
      total: z.number().nullable().optional(),
    })
    .optional()
    .catch(undefined),
})

/**
 * What is running of a game on this computer, as the app can tell (ADR 005, section 11).
 * `unverified`: something may be, and the app can't tell or can't touch it, which `why` says;
 * `unresponsive`: asked to close, and still there. `syncing`: its saves are being backed up, put
 * back or looked at (ADR 008, section 7), which Play waits for.
 */
export type GameView = z.infer<typeof gameViewSchema>

const playSessionSchema = z.object({
  id: z.string(),
  game: z.union([z.object({ entry: z.string() }), z.object({ steam: z.string() })]),
  startedAt: z.number(),
  endedAt: z.number(),
  seconds: z.number(),
  /** The computer it was played on; none from an app older than computers' ids. */
  device: z.string().optional(),
})

const checkedSchema = z.object({
  did: z.enum(['in-step', 'backed-up', 'restored', 'unreachable', 'choose', 'failed']),
  /** Why the look failed: one of the saves' refusals (`saves.ts`). */
  why: z.string().optional(),
})

/**
 * What the look at a game's saves before Play found (ADR 008, section 7). `choose`: two copies
 * differ, and the game waits for the person; `unreachable` and `failed`: it started with what is here.
 */
export type Checked = z.infer<typeof checkedSchema>

const playedSchema = z.object({ started: z.boolean(), saves: checkedSchema.nullable() })

/** What Play did: whether the game started, and what the look at its saves found, when they are kept. */
export type Played = z.infer<typeof playedSchema>

const infoSchema = z.object({ version: z.string(), device: z.string().optional() })

const startingSchema = z.object({ available: z.boolean(), on: z.boolean() })

/** Whether Shelf starts with Windows, and whether this build may change it (a development one may not). */
export type Starting = z.infer<typeof startingSchema>

export const desktop = {
  /** Starting with Windows, in the tray. An app older than 0.12.0 has no such command, and refuses. */
  startWithWindows: async (): Promise<Starting> =>
    startingSchema.parse(await call('start_with_windows')),
  setStartWithWindows: async (on: boolean): Promise<Starting> =>
    startingSchema.parse(await call('set_start_with_windows', { on })),
  /** The app's version, and this computer's id, which an app older than 0.11.0 doesn't give. */
  info: async () => infoSchema.parse(await call('desktop_info')),
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
  /**
   * Starts a game from its file, its saves looked at first when they are kept, unless `check` is
   * false: the person chose to play with what is here. An app older than 0.14.0 answers nothing, as
   * it starts the game and looks at no saves.
   */
  play: async (entry: string, check = true): Promise<Played> =>
    playedSchema.nullable().parse(await call('play', { entry, check })) ?? {
      started: true,
      saves: null,
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
  /** What the app has counted and has ended, for Shelf (ADR 005, section 12). */
  playSessions: async () => z.array(playSessionSchema).parse(await call('play_sessions')),
  /** What Shelf has said it keeps, for the app to let go of. */
  playSessionsKept: async (ids: readonly string[]): Promise<void> => {
    await call('play_sessions_kept', { ids })
  },
}
