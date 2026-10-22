import 'server-only'

import { and, eq, ne } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { NAME_MAX } from '@/domain/accounts/account'
import { handleProblem, type HandleProblem } from '@/domain/accounts/handle'
import type { Refusal } from '@/domain/library/adding'
import type { Account } from '@/server/auth/account'
import { database } from '@/server/db/client'
import { libraries, users } from '@/server/db/schema'
import { bumpVersion, newLibraryKey } from '@/server/library/store'
import { forAccount } from '@/server/services/for-account'
import { handleTag, libraryTag, shelvesTag } from '@/server/services/tags'

/**
 * An account's own settings (ADR 004): its name, its handle, and whether its
 * shelf is public. Each change expires every cached page that shows it.
 */

export const accountPatch = z.object({
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  handle: z.string().trim().toLowerCase().optional(),
  shelfPublic: z.boolean().optional(),
})

export type AccountPatch = z.infer<typeof accountPatch>

export type AccountChange =
  | { ok: true; account: Account }
  | Refusal
  | { ok: false; reason: 'handle'; problem: HandleProblem | 'taken' }

/** Every page and file that shows this account's shelf, drawn again on its next visit. */
const expire = (account: Account, ...handles: string[]) => {
  for (const tag of [libraryTag(account.id), shelvesTag(account.id), ...handles.map(handleTag)]) {
    revalidateTag(tag, { expire: 0 })
  }
}

/** Whether another account has this handle. */
const handleTaken = async (handle: string, by: string): Promise<boolean> => {
  const [found] = await database()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, handle), ne(users.id, by)))
    .limit(1)
  return Boolean(found)
}

/**
 * Changes the signed-in account's name, handle or visibility. Going private
 * gives the library a new key and version: the files a visitor could have
 * reached are at addresses that now lead nowhere (ADR 004).
 */
export const changeMyAccount = async (input: unknown): Promise<AccountChange> => {
  const parsed = accountPatch.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  const patch = parsed.data
  if (patch.handle !== undefined) {
    const problem = handleProblem(patch.handle)
    if (problem) return { ok: false, reason: 'handle', problem }
  }

  const done = await forAccount(async (account) => {
    if (patch.handle && patch.handle !== account.handle) {
      if (await handleTaken(patch.handle, account.id)) return 'taken' as const
    }
    const db = database()
    const goingPrivate = patch.shelfPublic === false && account.shelfPublic
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.handle === undefined ? {} : { username: patch.handle }),
          ...(patch.shelfPublic === undefined ? {} : { shelfPublic: patch.shelfPublic }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, account.id))
      if (goingPrivate) {
        await tx
          .update(libraries)
          .set({ key: newLibraryKey() })
          .where(eq(libraries.userId, account.id))
      }
      // The pages built from the account change with it; a new version says so to every open one.
      await bumpVersion(tx, account.id)
    })
    const changed: Account = {
      ...account,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.handle === undefined ? {} : { handle: patch.handle }),
      ...(patch.shelfPublic === undefined ? {} : { shelfPublic: patch.shelfPublic }),
    }
    expire(account, account.handle, changed.handle)
    return changed
  }, true)

  if (!done.ok) return done
  if (done.value === 'taken') return { ok: false, reason: 'handle', problem: 'taken' }
  return { ok: true, account: done.value }
}

/** Whether a handle can be had, for the sign-up form as it is typed. */
export const handleAvailable = async (
  text: unknown,
): Promise<{ available: true } | { available: false; problem: HandleProblem | 'taken' }> => {
  const handle = typeof text === 'string' ? text.trim().toLowerCase() : ''
  const problem = handleProblem(handle)
  if (problem) return { available: false, problem }
  const [found] = await database()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, handle))
    .limit(1)
  return found ? { available: false, problem: 'taken' } : { available: true }
}
