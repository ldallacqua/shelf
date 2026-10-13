import 'server-only'

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from '@/server/db/schema'
import { databaseTarget, type DatabaseTarget } from '@/server/env'

/**
 * One way in to the database. Turso and a SQLite file speak the same SQL
 * through the same client, so there is one schema and one set of migrations.
 */

export const openDatabase = (target: DatabaseTarget) => {
  if (target.kind === 'file') {
    mkdirSync(/* turbopackIgnore: true */ dirname(target.path), { recursive: true })
  }
  const client = createClient(
    target.kind === 'turso'
      ? { url: target.url, authToken: target.authToken }
      : { url: target.kind === 'memory' ? ':memory:' : `file:${target.path}` },
  )
  return drizzle({ client, schema, casing: 'snake_case' })
}

export type Db = ReturnType<typeof openDatabase>

/** A transaction, or the database itself: anything that can run a statement. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

let shared: { db: Db; target: DatabaseTarget } | undefined

const connect = () => {
  if (!shared) {
    const target = databaseTarget()
    if (target.kind === 'file' && !target.durable) {
      console.warn(
        'No database is connected (TURSO_DATABASE_URL is not set). Serving the sample library built with this deployment; nothing written to it is kept.',
      )
    }
    shared = { db: openDatabase(target), target }
  }
  return shared
}

/** The database for this server, opened on first use. */
export const database = (): Db => connect().db

/** False when the database is a throwaway copy. Writes of my own data must refuse then. */
export const databaseIsDurable = (): boolean => {
  const { target } = connect()
  return target.kind === 'turso' || (target.kind === 'file' && target.durable)
}
