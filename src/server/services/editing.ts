import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { Refusal } from '@/domain/library/adding'
import {
  minePatch,
  newCopy,
  type Changed,
  type MinePatch,
  type OwnerGame,
  type Removed,
  type Restored,
} from '@/domain/library/editing'
import { formats, type Format } from '@/domain/library/values'
import { database, type Db } from '@/server/db/client'
import { copies, entryVersions, games, removedEntries } from '@/server/db/schema'
import { readOwnerGame } from '@/server/library/read'
import {
  addCopy,
  findEntryIdBySlug,
  LibraryError,
  patchEntry,
  readVersion,
  removeCopy,
  removeEntryForUndo,
  restoreEntry,
  setCopyFormat,
  setPrimary,
} from '@/server/library/store'
import { forOwner } from '@/server/services/for-owner'

/**
 * Editing a game in place (spec 7.3), for the owner only. Each change is one
 * write through the store, and answers with the library's new version, which
 * the page then fetches: the box on the shelf changes with it.
 */

export const createEditing = (db: Db) => {
  const changed = async (): Promise<Changed> => ({ version: await readVersion(db) })

  /** An entry by its id, or by any of its versions' addresses. */
  const entryIdFor = async (idOrSlug: string): Promise<string> => {
    if (/^[0-9a-f-]{36}$/.test(idOrSlug)) return idOrSlug
    const entryId = await findEntryIdBySlug(db, idOrSlug)
    if (!entryId) throw new LibraryError('not-found', 'That game is not in the library')
    return entryId
  }

  const read = async (idOrSlug: string): Promise<OwnerGame> => {
    const game = await readOwnerGame(db, await entryIdFor(idOrSlug))
    if (!game) throw new LibraryError('not-found', 'That game is not in the library')
    return game
  }

  /** A copy of this entry's, refused if it is another's. */
  const copyOf = async (entryId: string, copyId: string) => {
    const [copy] = await db
      .select({ id: copies.id })
      .from(copies)
      .where(and(eq(copies.id, copyId), eq(copies.entryId, entryId)))
    if (!copy) throw new LibraryError('not-found', 'That copy is not on this game')
    return copy.id
  }

  const remove = async (entryId: string): Promise<Removed> => {
    const undo = await removeEntryForUndo(db, entryId)
    const [row] = await db
      .select({ title: removedEntries.title })
      .from(removedEntries)
      .where(eq(removedEntries.id, undo))
    return { ...(await changed()), undo, title: row?.title ?? '' }
  }

  const restore = async (undo: string): Promise<Restored> => {
    const entryId = await restoreEntry(db, undo)
    const [primary] = await db
      .select({ slug: games.slug })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.relation, 'primary')))
    return { ...(await changed()), slug: primary?.slug ?? '' }
  }

  return {
    read,
    entryIdFor,
    /** Several changes at once: what is mine, tags, minutes, and which version names it. */
    patch: async (
      idOrSlug: string,
      patch: { mine?: MinePatch; tags?: string[]; minutes?: number; mainVersion?: string },
    ) => {
      const entryId = await entryIdFor(idOrSlug)
      if (patch.mainVersion) await setPrimary(db, entryId, patch.mainVersion)
      const { mainVersion: _, ...rest } = patch
      if (rest.mine || rest.tags || rest.minutes !== undefined) await patchEntry(db, entryId, rest)
      return changed()
    },
    addCopy: async (idOrSlug: string, copy: z.infer<typeof newCopy>) => {
      await addCopy(db, await entryIdFor(idOrSlug), copy)
      return changed()
    },
    setFormat: async (idOrSlug: string, copyId: string, format: Format) => {
      await setCopyFormat(db, await copyOf(await entryIdFor(idOrSlug), copyId), format)
      return changed()
    },
    removeCopy: async (idOrSlug: string, copyId: string) => {
      await removeCopy(db, await copyOf(await entryIdFor(idOrSlug), copyId))
      return changed()
    },
    remove: async (idOrSlug: string) => remove(await entryIdFor(idOrSlug)),
    restore,
  }
}

/* For routes and actions: the owner only, on this server's database. */

let shared: ReturnType<typeof createEditing> | undefined
const editing = () => (shared ??= createEditing(database()))

const id = z.string().min(1).max(100)
const slug = z.string().min(1).max(200)
const tagList = z.array(z.string().trim().min(1).max(40)).max(20)
const minutes = z.number().int().min(0).max(1_000_000)

const refuse = (): Promise<Refusal> => Promise.resolve({ ok: false, reason: 'invalid' })

/** Parses what the request sent, then runs it for the owner. */
const checked =
  <Shape extends z.ZodTuple, T>(
    shape: Shape,
    run: (...args: z.infer<Shape>) => Promise<T>,
    writes = true,
  ) =>
  (...args: unknown[]) => {
    const parsed = shape.safeParse(args)
    if (!parsed.success) return refuse()
    return forOwner(() => run(...(parsed.data as z.infer<Shape>)), writes)
  }

export const ownerGame = checked(z.tuple([slug]), (s) => editing().read(s), false)

export const patchForOwner = checked(
  z.tuple([
    slug,
    z.object({
      mine: minePatch.optional(),
      tags: tagList.optional(),
      minutes: minutes.optional(),
      mainVersion: id.optional(),
    }),
  ]),
  (s, patch) => editing().patch(s, patch),
)

export const addCopyForOwner = checked(z.tuple([slug, newCopy]), (s, copy) =>
  editing().addCopy(s, copy),
)

export const setFormatForOwner = checked(z.tuple([slug, id, z.enum(formats)]), (s, copy, format) =>
  editing().setFormat(s, copy, format),
)

export const removeCopyForOwner = checked(z.tuple([slug, id]), (s, copy) =>
  editing().removeCopy(s, copy),
)

export const removeForOwner = checked(z.tuple([slug]), (s) => editing().remove(s))

export const restoreForOwner = checked(z.tuple([id]), (undo) => editing().restore(undo))
