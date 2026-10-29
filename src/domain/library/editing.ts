import { z } from 'zod'

import type { Palette } from '@/domain/color/palette'
import type { Answer, PlatformLabel } from '@/domain/library/adding'
import {
  formats,
  statuses,
  type Day,
  type Format,
  type Kind,
  type Relation,
  type Status,
  type SyncSource,
} from '@/domain/library/values'

/**
 * Editing a game in place (spec 7.3), for the owner: what the page needs to
 * edit it, which the library file does not carry (ids, private notes, the
 * versions), and the changes it can send.
 */

export type OwnedCopy = {
  id: string
  platformId: number
  format: Format
  /** Hours a sync reports on this copy, by source (ADR 003). */
  synced?: { source: SyncSource; minutes: number }[]
}

export type OwnedVersion = {
  gameId: string
  slug: string
  title: string
  relation: Relation
  kind: Kind
  year?: number
  platforms: number[]
  /** Its own cover, to tell the versions apart at a glance: an IGDB image id. */
  cover?: string
  colors?: Palette
  hash?: string
}

/** A game as its owner edits it. Notes are here whether or not they are public. */
export type OwnerGame = {
  entryId: string
  slug: string
  title: string
  status: Status
  /** On the wishlist, the platforms I want it on (spec 7.5); empty otherwise. */
  wanted: number[]
  /** Only I see it (spec 11.1). */
  private: boolean
  rating?: number
  completedOn?: Day
  /** The day it was last played on any linked platform; absent when none saw it played. */
  lastPlayedOn?: Day
  notes?: string
  notesPublic: boolean
  /** Minutes I typed in. */
  minutes: number
  copies: OwnedCopy[]
  tags: string[]
  versions: OwnedVersion[]
  /** Every platform it was released on, in any version, and any a copy is on. */
  platforms: PlatformLabel[]
  /** Its apps on Steam, to play it there (spec 7.7). Absent when it has none. */
  steam?: SteamApps
}

/**
 * What Ready to play needs of one of my games (spec 7.7): where it is in the
 * library file, its entry (by which the desktop app keeps its file), and
 * every app on Steam it may be, as `SteamApps.known`.
 */
export type PlayableGame = { slug: string; entryId: string; steam: string[] }

/** A game's apps on Steam (spec 7.7), by Steam's app ids. */
export type SteamApps = {
  /** The one the Steam sync found I own, on one of my copies: what Play on Steam opens. */
  owned?: string
  /** Every one I own and every one IGDB lists for its versions, `owned` first: the app looks these up in Steam. */
  known: string[]
}

/** An archived game, as the account page lists it (spec 7.4). */
export type ArchivedGame = {
  entryId: string
  slug: string
  title: string
  year?: number
  /** IGDB image id. */
  cover?: string
  colors?: Palette
  hash?: string
  /** The platforms of its copies, by their short names. */
  platforms: string[]
}

export const MAX_NOTES = 10_000

/** A change to what is mine about a game. Absent: unchanged; null: cleared. */
export const minePatch = z.object({
  status: z.enum(statuses).optional(),
  /** Kept only while the game is on the wishlist; leaving it lets them go. */
  wanted: z.array(z.number().int().positive()).max(20).nullable().optional(),
  rating: z.number().int().min(0).max(100).nullable().optional(),
  completedOn: z.iso.date().nullable().optional(),
  notes: z.string().max(MAX_NOTES).nullable().optional(),
  notesPublic: z.boolean().optional(),
  /** Only its own account sees it (spec 11.1). */
  private: z.boolean().optional(),
})

export type MinePatch = z.infer<typeof minePatch>

export const newCopy = z.object({
  platformId: z.number().int().positive(),
  format: z.enum(formats),
})

/** After a change: the library's new version, which the page fetches. */
export type Changed = { version: number }

export type Removed = Changed & { undo: string; title: string }

export type Restored = Changed & { slug: string }

/** After archiving (spec 7.4): the entry, to bring it back with, and its title, to say so. */
export type Archived = Changed & { entryId: string; title: string }

/** After bringing it back: its address, to land on, and its title. */
export type BroughtBack = Restored & { title: string }

/** After separating a version (spec 7.6): the new game's address, to open it, and its title. */
export type Separated = Restored & { title: string }

/** Changes the editor sends at once: what is mine, and the rest of a game's patch. */
export type EditPatch = MinePatch & { tags?: string[]; minutes?: number; mainVersion?: string }

/** The ways to edit a game. Each is checked on the server: the owner only. */
export type EditActions = {
  read: (slug: string) => Promise<Answer<OwnerGame>>
  update: (entryId: string, patch: EditPatch) => Promise<Answer<Changed>>
  addCopy: (entryId: string, copy: z.infer<typeof newCopy>) => Promise<Answer<Changed>>
  setFormat: (entryId: string, copyId: string, format: Format) => Promise<Answer<Changed>>
  removeCopy: (entryId: string, copyId: string) => Promise<Answer<Changed>>
  remove: (entryId: string) => Promise<Answer<Removed>>
  restore: (undo: string) => Promise<Answer<Restored>>
  archive: (entryId: string) => Promise<Answer<Archived>>
  bringBack: (entryId: string) => Promise<Answer<BroughtBack>>
  separate: (entryId: string, gameId: string) => Promise<Answer<Separated>>
}
