/**
 * Database commands, for a terminal:
 *
 *   pnpm db:migrate          bring the database up to the current schema
 *   pnpm seed [set]          migrate, then replace the library with a data set
 *                            (default, empty or stress; default if not given)
 *   pnpm db:prepare          what a Vercel build runs before `next build`
 *
 * Which database they act on is decided the same way the app decides
 * (`databaseTarget`): Turso when its settings are present, otherwise the
 * SQLite file at `.data/shelf.db`.
 */
import { sql } from 'drizzle-orm'

import { openDatabase } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
import { entries } from '@/server/db/schema'
import { databaseTarget, deployment, onVercel } from '@/server/env'
import { isSeedSet, seedLibrary, type SeedSet } from '@/server/seed/seed'

const [command, argument] = process.argv.slice(2)

const target = databaseTarget()
const where = target.kind === 'file' ? target.path : 'the Turso database'
const db = openDatabase(target)

const migrate = async () => {
  await migrateDatabase(db)
  console.log(`Migrated ${where}.`)
}

const seed = async (set: SeedSet) => {
  const result = await seedLibrary(db, set)
  console.log(`Seeded ${where} with "${set}": ${result.entries} entries, ${result.games} records.`)
}

const count = async (): Promise<number> => {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(entries)
  return Number(row?.total ?? 0)
}

switch (command) {
  case 'migrate': {
    await migrate()
    break
  }

  case 'seed': {
    const set = argument ?? 'default'
    if (!isSeedSet(set)) {
      console.error(`Unknown data set "${set}". Use default, empty or stress.`)
      process.exit(1)
    }
    if (deployment() === 'production') {
      console.error('Refusing to seed production: that would replace the real library.')
      process.exit(1)
    }
    await migrate()
    await seed(set)
    break
  }

  case 'prepare': {
    // Runs first in every Vercel build, against that environment's database.
    await migrate()
    const environment = deployment()
    if (target.kind === 'turso') {
      // A preview shows the sample library; it is loaded once, into an empty database.
      if (environment === 'preview' && (await count()) === 0) await seed('default')
      break
    }
    if (onVercel()) {
      console.warn(
        'No database is connected to this deployment (TURSO_DATABASE_URL is not set). ' +
          'Building a sample database into it instead. See docs/setup.md, session B.',
      )
    }
    // No Turso database: a file built here and shipped with the deployment.
    // Production starts empty; everything else gets the sample library.
    await seed(environment === 'production' ? 'empty' : 'default')
    break
  }

  default: {
    console.error('Usage: tsx scripts/db.ts <migrate | seed [set] | prepare>')
    process.exit(1)
  }
}
