import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { Refusal } from '@/domain/library/adding'
import {
  minePatch,
  newCopy,
  type Archived,
  type ArchivedGame,
  type BroughtBack,
  type Changed,
  type MinePatch,
  type OwnerGame,
  type Removed,
  type Restored,
  type Separated,
  type StoreHoursGame,
} from '@/domain/library/editing'
import { storeList } from '@/domain/library/store-list'
import type { StoreName } from '@/domain/library/stores'
import { formats, type Format } from '@/domain/library/values'
import { database, type Db } from '@/server/db/client'
import { copies, entryVersions, games, removedEntries } from '@/server/db/schema'
import { readArchived, readOwnerGame, readOwnerPlay, readStoreHours } from '@/server/library/read'
import {
  addCopy,
  findEntryIdBySlug,
  LibraryError,
  patchEntry,
  readVersion,
  removeCopy,
  removeEntryForUndo,
  restoreEntry,
  separateVersion,
  setArchived,
  setCopyFormat,
  setCopyStores,
  setPrimary,
} from '@/server/library/store'
import { forAccount } from '@/server/services/for-account'

/**
 * Editing a game in place (spec 7.3), in one library: the signed-in
 * account's own. Each change is one write through the store, and answers
 * with the library's new version, which the page then fetches: the box on
 * the shelf changes with it.
 */

export const createEditing = (db: Db, libraryId: string) => {
  const changed = async (): Promise<Changed> => ({ version: await readVersion(db, libraryId) })

  /** An entry by its id, or by any of its versions' addresses. */
  const entryIdFor = async (idOrSlug: string): Promise<string> => {
    if (/^[0-9a-f-]{36}$/.test(idOrSlug)) return idOrSlug
    const entryId = await findEntryIdBySlug(db, libraryId, idOrSlug)
    if (!entryId) throw new LibraryError('not-found', 'That game is not in the library')
    return entryId
  }

  const read = async (idOrSlug: string): Promise<OwnerGame> => {
    const game = await readOwnerGame(db, libraryId, await entryIdFor(idOrSlug))
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
    const undo = await removeEntryForUndo(db, libraryId, entryId)
    const [row] = await db
      .select({ title: removedEntries.title })
      .from(removedEntries)
      .where(eq(removedEntries.id, undo))
    return { ...(await changed()), undo, title: row?.title ?? '' }
  }

  /** The entry's main address and title, archived or not. */
  const named = async (entryId: string) => {
    const [primary] = await db
      .select({ slug: games.slug, title: games.title })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.relation, 'primary')))
    return { slug: primary?.slug ?? '', title: primary?.title ?? '' }
  }

  const archive = async (idOrSlug: string): Promise<Archived> => {
    const entryId = await entryIdFor(idOrSlug)
    await setArchived(db, libraryId, entryId, true)
    return { ...(await changed()), entryId, title: (await named(entryId)).title }
  }

  const bringBack = async (entryId: string): Promise<BroughtBack> => {
    await setArchived(db, libraryId, entryId, false)
    return { ...(await changed()), ...(await named(entryId)) }
  }

  /** One of its versions made a game of its own (spec 7.6): that game's address and title. */
  const separate = async (idOrSlug: string, gameId: string): Promise<Separated> => {
    const entryId = await separateVersion(db, libraryId, await entryIdFor(idOrSlug), gameId)
    return { ...(await changed()), ...(await named(entryId)) }
  }

  const restore = async (undo: string): Promise<Restored> => {
    const entryId = await restoreEntry(db, libraryId, undo)
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
    /** Several changes at once: what is mine, tags, idle time, and which version names it. */
    patch: async (
      idOrSlug: string,
      patch: {
        mine?: MinePatch
        tags?: string[]
        idle?: number
        mainVersion?: string
      },
    ) => {
      const entryId = await entryIdFor(idOrSlug)
      if (patch.mainVersion) await setPrimary(db, libraryId, entryId, patch.mainVersion)
      const { mainVersion: _, ...rest } = patch
      if (rest.mine || rest.tags || rest.idle !== undefined)
        await patchEntry(db, libraryId, entryId, rest)
      return changed()
    },
    addCopy: async (idOrSlug: string, copy: z.infer<typeof newCopy>) => {
      await addCopy(db, libraryId, await entryIdFor(idOrSlug), copy)
      return changed()
    },
    setFormat: async (idOrSlug: string, copyId: string, format: Format) => {
      await setCopyFormat(db, libraryId, await copyOf(await entryIdFor(idOrSlug), copyId), format)
      return changed()
    },
    setStores: async (idOrSlug: string, copyId: string, stores: readonly StoreName[]) => {
      await setCopyStores(db, libraryId, await copyOf(await entryIdFor(idOrSlug), copyId), stores)
      return changed()
    },
    removeCopy: async (idOrSlug: string, copyId: string) => {
      await removeCopy(db, libraryId, await copyOf(await entryIdFor(idOrSlug), copyId))
      return changed()
    },
    remove: async (idOrSlug: string) => remove(await entryIdFor(idOrSlug)),
    restore,
    archive,
    bringBack,
    separate,
    archived: (): Promise<ArchivedGame[]> => readArchived(db, libraryId),
    storeHours: (): Promise<StoreHoursGame[]> => readStoreHours(db, libraryId),
  }
}

/* For routes and actions: the signed-in account, on its own library. */

type Editing = ReturnType<typeof createEditing>

const id = z.string().min(1).max(100)
const slug = z.string().min(1).max(200)
const tagList = z.array(z.string().trim().min(1).max(40)).max(20)
const minutes = z.number().int().min(0).max(1_000_000)

const refuse = (): Promise<Refusal> => Promise.resolve({ ok: false, reason: 'invalid' })

/** Parses what the request sent, then runs it on the signed-in account's library. */
const checked =
  <Shape extends z.ZodTuple, T>(
    shape: Shape,
    run: (editing: Editing, ...args: z.infer<Shape>) => Promise<T>,
    writes = true,
  ) =>
  (...args: unknown[]) => {
    const parsed = shape.safeParse(args)
    if (!parsed.success) return refuse()
    return forAccount(
      (account) => run(createEditing(database(), account.id), ...(parsed.data as z.infer<Shape>)),
      writes,
    )
  }

export const myGame = checked(z.tuple([slug]), (editing, s) => editing.read(s), false)

export const patchMine = checked(
  z.tuple([
    slug,
    z.object({
      mine: minePatch.optional(),
      tags: tagList.optional(),
      idle: minutes.optional(),
      mainVersion: id.optional(),
    }),
  ]),
  (editing, s, patch) => editing.patch(s, patch),
)

export const addMyCopy = checked(z.tuple([slug, newCopy]), (editing, s, copy) =>
  editing.addCopy(s, copy),
)

export const setMyCopyFormat = checked(
  z.tuple([slug, id, z.enum(formats)]),
  (editing, s, copy, format) => editing.setFormat(s, copy, format),
)

export const setMyCopyStores = checked(z.tuple([slug, id, storeList]), (editing, s, copy, stores) =>
  editing.setStores(s, copy, stores),
)

export const removeMyCopy = checked(z.tuple([slug, id]), (editing, s, copy) =>
  editing.removeCopy(s, copy),
)

export const removeMine = checked(z.tuple([slug]), (editing, s) => editing.remove(s))

export const restoreMine = checked(z.tuple([id]), (editing, undo) => editing.restore(undo))

export const archiveMine = checked(z.tuple([slug]), (editing, s) => editing.archive(s))

export const bringBackMine = checked(z.tuple([id]), (editing, entryId) =>
  editing.bringBack(entryId),
)

export const separateMine = checked(z.tuple([slug, id]), (editing, s, gameId) =>
  editing.separate(s, gameId),
)

export const myArchived = checked(z.tuple([]), (editing) => editing.archived(), false)

/** My games whose stores report far past IGDB's time, not yet looked at: for Organize's hours tab. */
export const myStoreHours = checked(z.tuple([]), (editing) => editing.storeHours(), false)

/** Each of my games' entry and apps on Steam: what Ready to play in the desktop app reads (spec 7.7). */
export const myPlayable = () =>
  forAccount(async (account) => ({ games: await readOwnerPlay(database(), account.id) }), false)
