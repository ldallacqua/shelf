import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { getSessionCookie } from 'better-auth/cookies'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

import { auth } from '@/server/auth/auth'
import { database } from '@/server/db/client'
import { accounts, users } from '@/server/db/schema'
import { authEnv, MissingSettingsError } from '@/server/env'

/**
 * Who may change things (spec 11): the one GitHub account named by
 * `OWNER_GITHUB_ID`. Sign-in already turns everyone else away; this is the
 * lock, and every write runs it first. It loads the session and compares the
 * GitHub id behind it with the setting again, so a session that somehow
 * exists for anyone else opens nothing.
 */

export type Owner = { name: string; image?: string }

/** What the owner's session answered with: the owner, and any cookie it renewed. */
export type OwnerCheck = { owner?: Owner; headers?: Headers }

export const checkOwner = async (from: Headers): Promise<OwnerCheck> => {
  // No session cookie, nothing to look up: a visitor costs no query.
  if (!getSessionCookie(from, { cookiePrefix: 'shelf' })) return {}
  let ownerId: string
  try {
    ownerId = authEnv().ownerGithubId
  } catch (error) {
    // A deployment without sign-in has no owner.
    if (error instanceof MissingSettingsError) return {}
    throw error
  }
  const { response: found, headers: renewed } = await auth().api.getSession({
    headers: from,
    returnHeaders: true,
  })
  if (!found) return { headers: renewed }
  const [account] = await database()
    .select({ githubId: accounts.accountId })
    .from(accounts)
    .where(and(eq(accounts.userId, found.user.id), eq(accounts.providerId, 'github')))
    .limit(1)
  if (account?.githubId !== ownerId) return { headers: renewed }
  return {
    owner: { name: found.user.name, ...(found.user.image ? { image: found.user.image } : {}) },
    headers: renewed,
  }
}

/**
 * The owner, if this user is them: whom an assistant's access token names,
 * checked against the setting as a session is.
 */
export const ownerOfUser = async (userId: string): Promise<Owner | undefined> => {
  let ownerId: string
  try {
    ownerId = authEnv().ownerGithubId
  } catch (error) {
    if (error instanceof MissingSettingsError) return undefined
    throw error
  }
  const [found] = await database()
    .select({ githubId: accounts.accountId, name: users.name, image: users.image })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'github')))
    .limit(1)
  if (!found || found.githubId !== ownerId) return undefined
  return { name: found.name, ...(found.image ? { image: found.image } : {}) }
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
