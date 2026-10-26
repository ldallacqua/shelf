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
}
