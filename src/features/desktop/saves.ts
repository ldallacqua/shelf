import { z } from 'zod'

import { call } from './tauri'

/**
 * Shelf for Windows' commands for a game's saves (ADR 008), as Shelf's own pages ask them. Every
 * answer passes a schema first. A page names a game by its entry, its title and its Steam apps, and a
 * snapshot by its id; folders come from Windows' picker alone. Fetched only in the app, with the
 * Saves panel and the Saves page of Settings.
 */

/** Why the app did nothing about a game's saves (`desktop/src/saves/mod.rs`). */
export const saveRefusals = [
  'invalid',
  'unset',
  'running',
  'busy',
  'empty',
  'large',
  'wide',
  'outside',
  'missing',
  'damaged',
  'changed',
  'unreachable',
  'failed',
] as const
export type SaveRefusal = (typeof saveRefusals)[number]

/** A refusal as a word; anything else thrown, or an app too old to know the command, is `failed`. */
export const saveRefusalOf = (error: unknown): SaveRefusal =>
  saveRefusals.find((refusal) => refusal === error) ?? 'failed'

const capsSchema = z.object({ mostMb: z.number(), kept: z.number() })

/** How large a snapshot may be, and how many of a game's are kept: the same for every game. */
export type Caps = z.infer<typeof capsSchema>

const locationSchema = z.object({
  /** As the app keeps it: the list's pattern, or the folder added, from a placeholder. */
  text: z.string(),
  /** Where it is on this computer. */
  shown: z.string(),
  added: z.boolean(),
  files: z.number(),
  bytes: z.number(),
  /** Too wide to be one game's: left out. */
  refused: z.boolean(),
})
export type SaveLocation = z.infer<typeof locationSchema>

const snapshotSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  /** The computer it was made on, by its id; Shelf knows its name. */
  device: z.string().nullable(),
  files: z.number(),
  bytes: z.number(),
  /** It holds what this computer has now. */
  here: z.boolean(),
})
export type Snapshot = z.infer<typeof snapshotSchema>

const viewSchema = z.object({
  on: z.boolean(),
  /** The list's game, when it knows this one, and others that answer to the same name. */
  matched: z.string().nullable(),
  others: z.array(z.string()),
  registry: z.boolean(),
  /** The stores that carry the game's saves themselves. */
  cloud: z.array(z.string()),
  /** Whether the list of save locations could be read at all. */
  manifest: z.boolean(),
  base: z.string().nullable(),
  locations: z.array(locationSchema),
  files: z.number(),
  bytes: z.number(),
  snapshots: z.array(snapshotSchema),
  state: z.enum(['nothing', 'in-step', 'changed', 'behind', 'choose']),
  last: z
    .object({
      at: z.number(),
      did: z.enum(['backed-up', 'unchanged', 'restored', 'failed']),
      why: z.enum(saveRefusals).optional(),
    })
    .nullable(),
  busy: z.boolean(),
  caps: capsSchema,
})

/** A game's saves on this computer, as the app tells them. */
export type SavesView = z.infer<typeof viewSchema>

/** Which game: what every command about its saves is told. */
export type SaveGame = { entryId: string; title: string; apps: readonly string[] }

const named = ({ entryId, title, apps }: SaveGame) => ({ entry: entryId, title, apps })

const view = (answer: unknown) => viewSchema.parse(answer)
const maybeView = (answer: unknown) => viewSchema.nullable().parse(answer)

export const saves = {
  /** Where the game's saves are, where they go, and their history. */
  view: async (game: SaveGame): Promise<SavesView> => view(await call('saves', named(game))),
  /** On makes a first snapshot at once, unless the game is running. */
  turn: async (game: SaveGame, on: boolean): Promise<SavesView> =>
    view(await call('turn_saves', { ...named(game), on })),
  backUp: async (game: SaveGame): Promise<SavesView> =>
    view(await call('back_up_saves', named(game))),
  /** What is here is backed up first. */
  restore: async (game: SaveGame, snapshot: string): Promise<SavesView> =>
    view(await call('restore_saves', { ...named(game), snapshot })),
  /** Windows' folder picker, titled `ask`; null when it is closed. */
  addFolder: async (game: SaveGame, ask: string): Promise<SavesView | null> =>
    maybeView(await call('add_save_folder', { ...named(game), ask })),
  removeLocation: async (game: SaveGame, location: string): Promise<SavesView> =>
    view(await call('remove_save_location', { ...named(game), location })),
  /** Which of the list's games this is; null goes back to the one found first. */
  chooseGame: async (game: SaveGame, chosen: string | null): Promise<SavesView> =>
    view(await call('choose_save_game', { ...named(game), chosen })),
  /** Windows' folder picker for the game's own folder; null when it is closed. */
  chooseGameFolder: async (game: SaveGame, ask: string): Promise<SavesView | null> =>
    maybeView(await call('choose_game_folder', { ...named(game), ask })),
  /** Explorer, at a snapshot's archive. */
  show: async (entryId: string, snapshot: string): Promise<void> => {
    await call('show_save_snapshot', { entry: entryId, snapshot })
  },
  caps: async (): Promise<Caps> => capsSchema.parse(await call('save_caps')),
  setCaps: async (caps: Caps): Promise<Caps> => capsSchema.parse(await call('set_save_caps', caps)),
}
