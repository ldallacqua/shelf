import { z } from 'zod'

/**
 * Shelf for Windows' commands (ADR 005, section 3), as Shelf's own pages ask
 * them: the only code that knows Tauri's global. Outside the app there is no
 * bridge, and a page goes on as it does in any browser. Every answer passes
 * a schema first, as everything read from outside does.
 */

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

const launcherSchema = z.object({ name: z.string(), path: z.string(), exists: z.boolean() })

/** A game's file on this computer: its name, where it is, and whether it is still there. */
export type Launcher = z.infer<typeof launcherSchema>

/** Why the app did nothing, in its own words (`desktop/src/commands.rs`). */
export const refusals = ['invalid', 'unset', 'missing', 'refused', 'failed'] as const
export type Refusal = (typeof refusals)[number]

let standIn: Invoke | null | undefined

/**
 * For tests: the app's commands answered by `invoke`, or no app at all
 * (`null`). `undefined` puts Tauri's own back.
 */
export const setBridgeForTests = (invoke: Invoke | null | undefined) => {
  standIn = invoke
}

const tauri = (): Invoke | undefined => {
  if (standIn !== undefined) return standIn ?? undefined
  if (typeof window === 'undefined') return undefined
  return (window as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke
}

/** Whether this page is inside Shelf for Windows. */
export const inDesktopApp = (): boolean => tauri() !== undefined

/** A command's refusal as a word; anything else it throws is `failed`. */
export const refusalOf = (error: unknown): Refusal =>
  refusals.find((refusal) => refusal === error) ?? 'failed'

const call = async (command: string, args: Record<string, unknown>) => {
  const invoke = tauri()
  if (!invoke) throw 'failed'
  return invoke(command, args)
}

export const desktop = {
  /** The file chosen for a game on this computer, or null. */
  launcher: async (entry: string): Promise<Launcher | null> =>
    launcherSchema.nullable().parse(await call('launcher', { entry })),
  /** Windows' file picker for a game, titled `title`, its files called `files`; null when closed. */
  choose: async (entry: string, title: string, files: string): Promise<Launcher | null> =>
    launcherSchema.nullable().parse(await call('choose_launcher', { entry, title, files })),
  forget: async (entry: string): Promise<void> => {
    await call('forget_launcher', { entry })
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
