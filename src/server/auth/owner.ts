import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { getSessionCookie } from 'better-auth/cookies'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

import { auth } from '@/server/auth/auth'
import { database } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { authEnv, MissingSettingsError } from '@/server/env'

/**
 * Who may change things (spec 11): the one account, whose email address is
 * `OWNER_EMAIL`. Nobody can make another account; this is the lock all the
 * same, and every write runs it first. It loads the session and compares the
 * address behind it with the setting again, so a session that somehow
 * exists for anyone else opens nothing.
 */

export type Owner = { name: string; image?: string }

/** What the owner's session answered with: the owner, and any cookie it renewed. */
export type OwnerCheck = { owner?: Owner; headers?: Headers }

/** The owner's email address; none on a deployment without sign-in. */
const ownerEmail = (): string | undefined => {
  try {
    return authEnv().owner.email
  } catch (error) {
    if (error instanceof MissingSettingsError) return undefined
    throw error
  }
}

const asOwnerIf = (
  user: { email: string; name: string; image?: string | null },
  email: string,
): Owner | undefined =>
  user.email.toLowerCase() === email
    ? { name: user.name, ...(user.image ? { image: user.image } : {}) }
    : undefined

export const checkOwner = async (from: Headers): Promise<OwnerCheck> => {
  // No session cookie, nothing to look up: a visitor costs no query.
  if (!getSessionCookie(from, { cookiePrefix: 'shelf' })) return {}
  const email = ownerEmail()
  if (!email) return {}
  const { response: found, headers: renewed } = await auth().api.getSession({
    headers: from,
    returnHeaders: true,
  })
  if (!found) return { headers: renewed }
  const owner = asOwnerIf(found.user, email)
  return owner ? { owner, headers: renewed } : { headers: renewed }
}

/**
 * The owner, if this user is them: whom an assistant's access token names,
 * checked against the setting as a session is.
 */
export const ownerOfUser = async (userId: string): Promise<Owner | undefined> => {
  const email = ownerEmail()
  if (!email) return undefined
  const [found] = await database()
    .select({ email: users.email, name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return found ? asOwnerIf(found, email) : undefined
}

/** An owner proven by something other than the session cookie, for the work done on their behalf. */
const proven = new AsyncLocalStorage<Owner>()

/**
 * Runs `run` as the owner. Only for a request already proven theirs: the
 * owner's MCP endpoint, after checking the assistant's access token and
 * that it names the owner (`ownerOfUser`).
 */
export const asOwner = <T>(owner: Owner, run: () => Promise<T>): Promise<T> =>
  proven.run(owner, run)

/** The owner, when this request is theirs. */
export const currentOwner = async (from?: Headers): Promise<Owner | undefined> =>
  proven.getStore() ?? (await checkOwner(from ?? (await headers()))).owner

export const isOwner = async (from?: Headers): Promise<boolean> =>
  (await currentOwner(from)) !== undefined

export class NotOwnerError extends Error {
  constructor() {
    super('Only the owner can change the library. Sign in first.')
    this.name = 'NotOwnerError'
  }
}

/** The first line of every write. Throws for anyone but the owner. */
export const requireOwner = async (from?: Headers): Promise<Owner> => {
  const owner = await currentOwner(from)
  if (!owner) throw new NotOwnerError()
  return owner
}
