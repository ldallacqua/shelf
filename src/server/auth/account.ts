import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { getSessionCookie } from 'better-auth/cookies'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

import { auth } from '@/server/auth/auth'
import { database } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { MissingSettingsError } from '@/server/env'

/**
 * Who is asking (spec 11, ADR 004): an account, signed in with the session
 * cookie or, for an assistant, proven by its access token; or nobody. An
 * account changes its own library and nothing else: its id is the library's
 * id, and every service that changes or privately reads anything starts
 * with `requireAccount()` and works on that library only.
 */

export type Account = {
  /** The account's id, which is its library's id. */
  id: string
  /** The handle in its shelf's address. */
  handle: string
  name: string
  image?: string
  /** Whether anyone may see its shelf. */
  shelfPublic: boolean
}

/** What a session answered with: the account, and any cookie it renewed. */
export type AccountCheck = { account?: Account; headers?: Headers }

type UserRow = {
  id: string
  name: string
  image?: string | null
  username?: string | null
  shelfPublic?: boolean | null
}

const toAccount = (user: UserRow): Account | undefined =>
  user.username
    ? {
        id: user.id,
        handle: user.username,
        name: user.name,
        shelfPublic: user.shelfPublic !== false,
        ...(user.image ? { image: user.image } : {}),
      }
    : undefined

export const checkAccount = async (from: Headers): Promise<AccountCheck> => {
  // No session cookie, nothing to look up: a visitor costs no query.
  if (!getSessionCookie(from, { cookiePrefix: 'shelf' })) return {}
  try {
    const { response: found, headers: renewed } = await auth().api.getSession({
      headers: from,
      returnHeaders: true,
    })
    const account = found ? toAccount(found.user as UserRow) : undefined
    return account ? { account, headers: renewed } : { headers: renewed }
  } catch (error) {
    // A deployment without sign-in's settings has no accounts to check.
    if (error instanceof MissingSettingsError) return {}
    throw error
  }
}

/** The account a user id names: whom an assistant's access token is for. */
export const accountOfUser = async (userId: string): Promise<Account | undefined> => {
  const [found] = await database()
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      username: users.username,
      shelfPublic: users.shelfPublic,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return found ? toAccount(found) : undefined
}

/** An account proven by something other than the session cookie, for the work done on its behalf. */
const proven = new AsyncLocalStorage<Account>()

/**
 * Runs `run` as this account. Only for a request already proven theirs: the
 * MCP endpoint for one's own library, after checking the assistant's access
 * token (`accountOfUser`).
 */
export const asAccount = <T>(account: Account, run: () => Promise<T>): Promise<T> =>
  proven.run(account, run)

/** The account this request is from, if any. */
export const currentAccount = async (from?: Headers): Promise<Account | undefined> =>
  proven.getStore() ?? (await checkAccount(from ?? (await headers()))).account

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in first: only an account changes its own library.')
    this.name = 'NotSignedInError'
  }
}

/** The first line of every write. Throws for anyone not signed in. */
export const requireAccount = async (from?: Headers): Promise<Account> => {
  const account = await currentAccount(from)
  if (!account) throw new NotSignedInError()
  return account
}
