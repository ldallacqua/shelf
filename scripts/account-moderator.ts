/**
 * Makes an account a moderator, or stops it being one (ADR 006), for a
 * terminal: nothing on the site can.
 *
 *   pnpm account:moderator <handle>
 *   pnpm account:moderator <handle> off
 *
 * Acts on the database the app would use (`databaseTarget`): Turso when its
 * settings are present, otherwise the SQLite file at `.data/shelf.db`.
 */
import { eq } from 'drizzle-orm'

import { openDatabase } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { databaseTarget } from '@/server/env'

const handle = process.argv[2]?.trim().toLowerCase()
const word = process.argv[3]
if (!handle || (word !== undefined && word !== 'off')) {
  console.error('Which account? pnpm account:moderator <handle> [off]')
  process.exit(1)
}

const target = databaseTarget()
const where = target.kind === 'file' ? target.path : 'the Turso database'
const moderator = word !== 'off'

const changed = await openDatabase(target)
  .update(users)
  .set({ moderator })
  .where(eq(users.username, handle))
  .returning({ id: users.id })
if (changed.length === 0) {
  console.error(`No account has the handle "${handle}" in ${where}.`)
  process.exit(1)
}

console.log(`@${handle} ${moderator ? 'is a moderator' : 'is not a moderator'} in ${where}.`)
