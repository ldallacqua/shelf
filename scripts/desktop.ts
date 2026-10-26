/**
 * pnpm desktop:dev, desktop:build, desktop:test
 *
 * Shelf for Windows' build (ADR 005, the desktop guide): the Tauri CLI in
 * desktop/, or cargo's tests, run with PATH tidied (`rust-env.ts`).
 *
 *   dev     the app against the local server, rebuilt when its Rust changes
 *   build   the installer, a release build that opens production
 *   test    the Rust side's tests
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { rustEnv } from './lib/rust-env.ts'

const [command, ...rest] = process.argv.slice(2)
const env = rustEnv()

const run = (program: string, args: string[], cwd = process.cwd()) =>
  spawnSync(program, args, { stdio: 'inherit', env, cwd }).status ?? 1

switch (command) {
  case 'test':
    process.exit(run('cargo', ['test', '--manifest-path', 'desktop/Cargo.toml', ...rest]))
  case 'dev':
  case 'build':
    process.exit(
      run(
        process.execPath,
        [resolve('node_modules/@tauri-apps/cli/tauri.js'), command, ...rest],
        'desktop',
      ),
    )
  default:
    console.error('Use: pnpm desktop:dev, pnpm desktop:build or pnpm desktop:test')
    process.exit(1)
}
