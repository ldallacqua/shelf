/**
 * A new password for an account, for a terminal, while there is no reset by
 * email (ADR 004):
 *
 *   pnpm account:password <handle>
 *
 * Makes a long random password, sets it, signs the account out everywhere,
 * and prints the password once, for its owner to sign in with and then
 * change on the account page. Acts on the database the app would use
 * (`databaseTarget`): Turso when its settings are present, otherwise the
 * SQLite file at `.data/shelf.db`.
 */
import { randomBytes, randomUUID } from 'node:crypto'

import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'

import { openDatabase } from '@/server/db/client'
import { accounts, sessions, users } from '@/server/db/schema'
import { databaseTarget } from '@/server/env'

const handle = process.argv[2]?.trim().toLowerCase()
if (!handle) {
  console.error('Which account? pnpm account:password <handle>')
  process.exit(1)
}

const target = databaseTarget()
const where = target.kind === 'file' ? target.path : 'the Turso database'
const db = openDatabase(target)

const [user] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.username, handle))
  .limit(1)
if (!user) {
  console.error(`No account has the handle "${handle}" in ${where}.`)
  process.exit(1)
}

// Twenty characters from 120 random bits: well past the shortest a password may be.
const password = randomBytes(15).toString('base64url')
const hash = await hashPassword(password)
const now = new Date()

await db.transaction(async (tx) => {
  const [credential] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
    .limit(1)
  if (credential) {
    await tx
      .update(accounts)
      .set({ password: hash, updatedAt: now })
      .where(eq(accounts.id, credential.id))
  } else {
    await tx.insert(accounts).values({
      id: randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: hash,
      createdAt: now,
      updatedAt: now,
    })
  }
  // Whoever had the old password is out.
  await tx.delete(sessions).where(eq(sessions.userId, user.id))
})

console.log(`New password for @${handle} in ${where}, signed out everywhere:`)
console.log(`\n  ${password}\n`)
console.log('Sign in with it, then change it on the account page.')
