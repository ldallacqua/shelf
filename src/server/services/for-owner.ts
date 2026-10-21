import 'server-only'

import type { Answer, Refusal } from '@/domain/library/adding'
import { NotOwnerError, requireOwner } from '@/server/auth/owner'
import { databaseIsDurable } from '@/server/db/client'
import { IgdbError } from '@/server/igdb/client'
import { LibraryError } from '@/server/library/store'

/** Why something failed, in words the interface has a sentence for. */
export const refusalFor = (error: unknown): Refusal => {
  if (error instanceof NotOwnerError) return { ok: false, reason: 'not-signed-in' }
  if (error instanceof IgdbError) return { ok: false, reason: 'igdb' }
  if (error instanceof LibraryError) {
    return { ok: false, reason: error.code === 'invalid' ? 'invalid' : error.code }
  }
  console.error('The owner’s request failed', error)
  return { ok: false, reason: 'failed' }
}

/**
 * Runs the owner's request, or refuses it with a reason the interface has a
 * sentence for. The owner is checked first, every time, on the server.
 * `writes`: refused at once on a database that keeps nothing, rather than
 * saved and silently forgotten.
 */
export const forOwner = async <T>(run: () => Promise<T>, writes = false): Promise<Answer<T>> => {
  try {
    await requireOwner()
    if (writes && !databaseIsDurable()) return { ok: false, reason: 'not-kept' }
    return { ok: true, value: await run() }
  } catch (error) {
    return refusalFor(error)
  }
}
