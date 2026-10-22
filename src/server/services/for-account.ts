import 'server-only'

import type { Answer, Refusal } from '@/domain/library/adding'
import { NotSignedInError, requireAccount, type Account } from '@/server/auth/account'
import { databaseIsDurable } from '@/server/db/client'
import { IgdbError } from '@/server/igdb/client'
import { LibraryError } from '@/server/library/store'
import { TooManyError } from '@/server/services/fair-use'

/** Why something failed, in words the interface has a sentence for. */
export const refusalFor = (error: unknown): Refusal => {
  if (error instanceof NotSignedInError) return { ok: false, reason: 'not-signed-in' }
  if (error instanceof TooManyError) return { ok: false, reason: 'too-many' }
  if (error instanceof IgdbError) return { ok: false, reason: 'igdb' }
  if (error instanceof LibraryError) {
    return { ok: false, reason: error.code === 'invalid' ? 'invalid' : error.code }
  }
  console.error('A request for an account failed', error)
  return { ok: false, reason: 'failed' }
}

/**
 * A request carried out: its answer, and the library it was carried out in,
 * whose cached pages the route or action then expires.
 */
export type Done<T> = (Answer<T> & { ok: true; libraryId: string }) | Refusal

/**
 * Runs a request for the signed-in account, on its own library, or refuses
 * it with a reason the interface has a sentence for. The account is checked
 * first, every time, on the server, and `run` is given it: the library it
 * may read and change is that account's and no other (ADR 004).
 * `writes`: refused at once on a database that keeps nothing, rather than
 * saved and silently forgotten.
 */
export const forAccount = async <T>(
  run: (account: Account) => Promise<T>,
  writes = false,
): Promise<Done<T>> => {
  try {
    const account = await requireAccount()
    if (writes && !databaseIsDurable()) return { ok: false, reason: 'not-kept' }
    return { ok: true, value: await run(account), libraryId: account.id }
  } catch (error) {
    return refusalFor(error)
  }
}
