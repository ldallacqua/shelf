import 'server-only'

import { accessSync, constants, copyFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { z } from 'zod'

/**
 * Settings, read from the environment and checked before use. A missing
 * setting stops the caller with a message that names it. Values are never
 * printed, here or anywhere.
 */

export class MissingSettingsError extends Error {
  readonly names: readonly string[]

  constructor(names: readonly string[], why: string) {
    super(`${why} Missing or empty: ${names.join(', ')}.`)
    this.name = 'MissingSettingsError'
    this.names = names
  }
}

const read = <Shape extends z.ZodRawShape>(shape: Shape, why: string) => {
  const result = z.object(shape).safeParse(process.env)
  if (result.success) return result.data
  const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))]
  throw new MissingSettingsError(names, why)
}

const text = z.string().trim().min(1)

/** True on any Vercel build or deployment. */
export const onVercel = (): boolean => process.env.VERCEL === '1'

export type Deployment = 'production' | 'preview' | 'local'

export const deployment = (): Deployment =>
  process.env.VERCEL_ENV === 'production'
    ? 'production'
    : process.env.VERCEL_ENV === 'preview'
      ? 'preview'
      : 'local'

/** The switch that replaces IGDB and Twitch with test doubles. */
export const mocksRequested = (): boolean => process.env.SHELF_MOCKS === '1'

export const igdbEnv = () => {
  const env = read(
    { TWITCH_CLIENT_ID: text, TWITCH_CLIENT_SECRET: text },
    'IGDB needs a Twitch application.',
  )
  return { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET }
}

/**
 * Sign-in (architecture, section 9): the secret sessions are signed with.
 * Accounts are made by signing up (ADR 004); `OWNER_EMAIL` and
 * `OWNER_PASSWORD`, which made the one account before, are no longer read.
 */
export const authEnv = () => {
  const env = read(
    { BETTER_AUTH_SECRET: z.string().trim().min(32) },
    'Sign-in needs a secret of at least 32 characters.',
  )
  return { secret: env.BETTER_AUTH_SECRET }
}

export type DatabaseTarget =
  /** Turso: what a deployment with a database connected uses. */
  | { kind: 'turso'; url: string; authToken: string }
  /** A SQLite file: this machine, CI, and a deployment with no database connected. */
  | { kind: 'file'; path: string; durable: boolean }
  /** Gone when the process ends. Only tests ask for it. */
  | { kind: 'memory' }

// The paths below are worked out while the app runs, so the bundler cannot
// know which files they mean and would ship the whole project to be safe.
// `turbopackIgnore` tells it not to: the one file that matters is named in
// `next.config.ts`.

const canWrite = (folder: string): boolean => {
  try {
    accessSync(/* turbopackIgnore: true */ folder, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** Where the SQLite file lives when no Turso database is set. */
export const databaseFile = (): string =>
  resolve(
    /* turbopackIgnore: true */ process.env.SHELF_DATABASE_FILE?.trim() ||
      join(/* turbopackIgnore: true */ process.cwd(), '.data', 'shelf.db'),
  )

/**
 * Which database to open.
 *
 * With `TURSO_DATABASE_URL` set, Turso. Otherwise the SQLite file. A deployed
 * function cannot write next to its own code, so there the file that was
 * built with the deployment is copied to the temporary folder and opened
 * from that: every instance starts from the same sample, and nothing written
 * to it is kept. `durable: false` says so, and anything that saves my data
 * must refuse to run on it.
 */
export const databaseTarget = (): DatabaseTarget => {
  if (process.env.TURSO_DATABASE_URL?.trim()) {
    const env = read(
      { TURSO_DATABASE_URL: text, TURSO_AUTH_TOKEN: text },
      'A Turso database needs its address and a token.',
    )
    return { kind: 'turso', url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }
  }

  const file = databaseFile()
  if (canWrite(dirname(file)) || !existsSync(/* turbopackIgnore: true */ file)) {
    return { kind: 'file', path: file, durable: !onVercel() }
  }

  // Named after the file it copies, so a newer build never opens an older copy.
  const built = statSync(/* turbopackIgnore: true */ file)
  const copy = join(tmpdir(), `shelf-sample-${Math.round(built.mtimeMs)}-${built.size}.db`)
  if (!existsSync(/* turbopackIgnore: true */ copy)) {
    copyFileSync(/* turbopackIgnore: true */ file, copy)
  }
  return { kind: 'file', path: copy, durable: false }
}
