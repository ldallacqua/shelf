/**
 * pnpm serve:test
 *
 * Serves the production build the way the browser tests need it: with the
 * test doubles for IGDB and Twitch and a made-up owner (`SHELF_MOCKS=1`), and on a fresh
 * copy of the database. Tests that add, change and remove games write to the
 * copy, so `.data/shelf.db` is never changed by a test, and every run starts
 * from the same library.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve(process.env.SHELF_DATABASE_FILE?.trim() || '.data/shelf.db')
const copy = resolve('.data/e2e.db')
if (!existsSync(source)) {
  console.error(`No database at ${source}. Run pnpm seed first.`)
  process.exit(1)
}
for (const leftover of [copy, `${copy}-wal`, `${copy}-shm`, `${copy}-journal`]) {
  rmSync(leftover, { force: true })
}
copyFileSync(source, copy)

// The copy gets any migration this checkout adds, so a test never meets an older schema.
const migrated = spawnSync(
  process.execPath,
  [
    resolve('node_modules/tsx/dist/cli.mjs'),
    '--conditions=react-server',
    'scripts/db.ts',
    'migrate',
  ],
  { env: { ...process.env, SHELF_DATABASE_FILE: copy }, stdio: 'inherit' },
)
if (migrated.status !== 0) process.exit(migrated.status ?? 1)

const server = spawn(
  process.execPath,
  [resolve('node_modules/next/dist/bin/next'), 'start', '-p', '3300'],
  {
    env: { ...process.env, SHELF_MOCKS: '1', SHELF_DATABASE_FILE: copy },
    stdio: 'inherit',
  },
)
const stop = () => server.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
server.on('exit', (code) => process.exit(code ?? 0))
