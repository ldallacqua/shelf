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
  'game-folder',
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

const namedSchema = z.object({ why: z.string(), folder: z.string() })

/**
 * A folder Windows' picker handed over and the app refused, with the folder named: since 0.17.0, as
 * the picker hides some folders and hands over another than the one meant. Otherwise the word alone.
 */
export const folderRefusalOf = (error: unknown): { why: SaveRefusal; folder?: string } => {
  const named = namedSchema.safeParse(error)
  return named.success
    ? { why: saveRefusalOf(named.data.why), folder: named.data.folder }
    : { why: saveRefusalOf(error) }
}

const progressSchema = z.object({
  step: z.enum(['reading', 'packing', 'sending', 'fetching', 'restoring']),
  done: z.number(),
  total: z.number().nullable(),
})

/** How far a game's backup or restore has got: the step, and how much of it when that can be told. */
export type SaveProgress = z.infer<typeof progressSchema>

const capsSchema = z.object({ mostMb: z.number(), kept: z.number() })

/** The services a computer's snapshots can go to, signed in from Settings (ADR 008, phase 5). */
export const saveServices = ['onedrive', 'google-drive'] as const
const serviceSchema = z.enum(saveServices)
export type SaveService = z.infer<typeof serviceSchema>

/** Their names, as people know them, in every language. */
export const serviceNames: Record<SaveService, string> = {
  onedrive: 'OneDrive',
  'google-drive': 'Google Drive',
}

/** Why the place couldn't be used: out of reach, signed out of, or full. */
const awaySchema = z.enum(['unreachable', 'signed-out', 'full'])
export type SaveAway = z.infer<typeof awaySchema>

/** Why a sign-in ended without one (`desktop/src/saves/sign_in.rs`). */
export const signInEnds = ['unavailable', 'cancelled', 'refused', 'unreachable'] as const
export type SignInEnd = (typeof signInEnds)[number]
export const signInEndOf = (error: unknown): SignInEnd =>
  signInEnds.find((end) => end === error) ?? 'refused'

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
  /** Made here and not yet at the place: it goes as soon as it can. None from an app older than 0.17.0. */
  waiting: z.boolean().optional(),
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
  /** The latest snapshots: one, or several when a choice waits. */
  heads: z.array(z.string()),
  /** When the saves here last changed. */
  changedAt: z.number().nullable(),
  state: z.enum(['nothing', 'in-step', 'changed', 'behind', 'choose']),
  last: z
    .object({
      at: z.number(),
      did: z.enum(['backed-up', 'waiting', 'unchanged', 'restored', 'failed']),
      why: z.enum(saveRefusals).optional(),
    })
    .nullable(),
  busy: z.boolean(),
  caps: capsSchema,
  /** This computer's place: the folder Shelf keeps there, or a service's name; null is this computer alone. */
  place: z.string().nullable(),
  /** Whether the place is a service rather than a folder. None from an app older than 0.17.0. */
  service: z.boolean().optional(),
  /** Whether it can be reached now. */
  reachable: z.boolean(),
  /** Why not, when it can't; none from an app older than 0.15.0. */
  away: awaySchema.nullable().catch(null),
})

const placeSchema = z.object({
  folder: z.string().nullable(),
  reachable: z.boolean(),
  /** The service that is the place, when one is; none from an app older than 0.15.0. */
  cloud: serviceSchema.nullable().catch(null),
  away: awaySchema.nullable().catch(null),
  /** The services this build can sign in to, and who is signed in to each. */
  services: z
    .array(
      z.object({
        service: serviceSchema,
        account: z.string().nullable(),
        signingIn: z.boolean(),
      }),
    )
    .catch([]),
})

/** Where this computer's snapshots go (ADR 008, section 8). */
export type SavePlace = z.infer<typeof placeSchema>

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
  /** How far a backup or restore of the game has got, while one is going. An app older than 0.17.0 refuses. */
  progress: async (entryId: string): Promise<SaveProgress | null> =>
    progressSchema.nullable().parse(await call('save_progress', { entry: entryId })),
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
  /** Settles a choice: this computer's copy (null), or one of the latest snapshots. */
  keep: async (game: SaveGame, keep: string | null): Promise<SavesView> =>
    view(await call('keep_saves', { ...named(game), keep })),
  /** Explorer, at a snapshot's archive. */
  show: async (entryId: string, snapshot: string): Promise<void> => {
    await call('show_save_snapshot', { entry: entryId, snapshot })
  },
  caps: async (): Promise<Caps> => capsSchema.parse(await call('save_caps')),
  place: async (): Promise<SavePlace> => placeSchema.parse(await call('save_place')),
  /** Windows' folder picker, titled `ask`; null when it is closed. */
  choosePlace: async (ask: string): Promise<SavePlace | null> =>
    placeSchema.nullable().parse(await call('choose_save_place', { ask })),
  forgetPlace: async (): Promise<SavePlace> => placeSchema.parse(await call('forget_save_place')),
  /**
   * Signs in on the service's own page, in the default browser, and makes it this computer's place.
   * Answers once the browser comes back; refused with a `SignInEnd` otherwise.
   */
  signIn: async (service: SaveService): Promise<SavePlace> =>
    placeSchema.parse(await call('sign_in_save_cloud', { service })),
  cancelSignIn: async (service: SaveService): Promise<void> => {
    await call('cancel_save_sign_in', { service })
  },
  /** A service already signed in to, as the place again. */
  useCloud: async (service: SaveService): Promise<SavePlace> =>
    placeSchema.parse(await call('use_save_cloud', { service })),
  /** Signed out there and here; this computer alone again when it was the place. */
  signOut: async (service: SaveService): Promise<SavePlace> =>
    placeSchema.parse(await call('sign_out_save_cloud', { service })),
  setCaps: async (caps: Caps): Promise<Caps> => capsSchema.parse(await call('set_save_caps', caps)),
}
