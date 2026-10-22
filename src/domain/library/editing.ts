import { z } from 'zod'

import type { Answer, PlatformLabel } from '@/domain/library/adding'
import {
  formats,
  statuses,
  type Day,
  type Format,
  type Kind,
  type Relation,
  type Status,
} from '@/domain/library/values'

/**
 * Editing a game in place (spec 7.3), for the owner: what the page needs to
 * edit it, which the library file does not carry (ids, private notes, the
 * versions), and the changes it can send.
 */

export type OwnedCopy = { id: string; platformId: number; format: Format }

export type OwnedVersion = {
  gameId: string
  slug: string
  title: string
  relation: Relation
  kind: Kind
  year?: number
  platforms: number[]
}

/** A game as its owner edits it. Notes are here whether or not they are public. */
export type OwnerGame = {
  entryId: string
  slug: string
  title: string
  status: Status
  rating?: number
  completedOn?: Day
  notes?: string
  notesPublic: boolean
  /** Minutes I typed in. */
  minutes: number
  copies: OwnedCopy[]
  tags: string[]
  versions: OwnedVersion[]
  /** Every platform it was released on, in any version, and any a copy is on. */
  platforms: PlatformLabel[]
}

export const MAX_NOTES = 10_000

/** A change to what is mine about a game. Absent: unchanged; null: cleared. */
export const minePatch = z.object({
  status: z.enum(statuses).optional(),
  rating: z.number().int().min(0).max(100).nullable().optional(),
  completedOn: z.iso.date().nullable().optional(),
  notes: z.string().max(MAX_NOTES).nullable().optional(),
  notesPublic: z.boolean().optional(),
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
}
