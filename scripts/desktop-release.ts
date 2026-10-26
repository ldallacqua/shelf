/**
 * pnpm desktop:release
 *
 * Publishes Shelf for Windows' version that `desktop/tauri.conf.json` names
 * as a release of this repository (ADR 005, section 9): builds the installer,
 * signed with the key in `.env.local`, writes `latest.json` (what the
 * installed apps read to learn there is an update), and creates the release
 * `desktop-v{version}` with the installer, its signature and `latest.json`.
 * Every installed app finds it at its next start.
 *
 * From a clean `main` that is what GitHub has, only, and never twice for one
 * version: raise the version (`tauri.conf.json` and `Cargo.toml`) in a pull
 * request first. Run by hand; nothing on GitHub's side starts it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { rustEnv } from './lib/rust-env.ts'

const REPOSITORY = 'ldallacqua/shelf'
const KEYS = ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'] as const

const stop = (problem: string): never => {
  console.error(problem)
  process.exit(1)
}

/** A command's output, or the stop it causes. */
const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) stop(`${command} ${args.join(' ')} failed:\n${result.stderr}`)
  return result.stdout.trim()
}

if (run('git', ['branch', '--show-current']) !== 'main') stop('Release from main only.')
if (run('git', ['status', '--porcelain', '--untracked-files=no']) !== '')
  stop('main has changes not committed: commit or put them away first.')
run('git', ['fetch', '--quiet', 'origin', 'main'])
if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', 'origin/main']))
  stop('main here is not what GitHub has: pull or push first.')

const config = JSON.parse(readFileSync('desktop/tauri.conf.json', 'utf8')) as {
  version: string
  productName: string
}
const { version, productName } = config
const cargo = readFileSync('desktop/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1]
if (cargo !== version)
  stop(`tauri.conf.json says ${version}, Cargo.toml ${cargo}: make them agree.`)
const tag = `desktop-v${version}`
if (spawnSync('gh', ['release', 'view', tag, '--repo', REPOSITORY]).status === 0)
  stop(`${tag} is released already: raise the version first.`)

// The signing key, from .env.local, into the build's environment only; never printed.
const local = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
const env: NodeJS.ProcessEnv = { ...rustEnv() }
for (const name of KEYS) {
  const value = local.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim()
  if (value !== undefined) env[name] = value
}
if (!env.TAURI_SIGNING_PRIVATE_KEY) stop('No TAURI_SIGNING_PRIVATE_KEY in .env.local.')

console.log(`Building ${productName} ${version}, signed…`)
const built = spawnSync(
  process.execPath,
  [
    resolve('node_modules/@tauri-apps/cli/tauri.js'),
    'build',
    // Only a release makes the signature the updater checks.
    '--config',
    JSON.stringify({ bundle: { createUpdaterArtifacts: true } }),
  ],
  { cwd: 'desktop', stdio: 'inherit', env },
)
if (built.status !== 0) process.exit(built.status ?? 1)

const folder = 'desktop/target/release/bundle/nsis'
const installer = `${productName}_${version}_x64-setup.exe`
const signature = readFileSync(join(folder, `${installer}.sig`), 'utf8').trim()
// The apps take only an update whose signature names its version (`requireSignedVersion`).
if (!Buffer.from(signature, 'base64').toString('utf8').includes(`\tversion:${version}`))
  stop(`The signature does not name version ${version}: every installed app would refuse it.`)
const latest = join(folder, 'latest.json')
writeFileSync(
  latest,
  `${JSON.stringify(
    {
      version,
      notes: `${productName} ${version}`,
      pub_date: new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature,
          url: `https://github.com/${REPOSITORY}/releases/download/${tag}/${installer}`,
        },
      },
    },
    null,
    2,
  )}\n`,
)

console.log(`Publishing ${tag}…`)
run('gh', [
  'release',
  'create',
  tag,
  join(folder, installer),
  join(folder, `${installer}.sig`),
  latest,
  '--repo',
  REPOSITORY,
  '--target',
  'main',
  '--title',
  `${productName} for Windows ${version}`,
  '--notes',
  `Download ${installer} and run it: it installs for this Windows account and opens Shelf. ` +
    'Windows warns the first time, since the installer is not signed: More info, then Run anyway. ' +
    'An installed Shelf finds this version by itself at its next start.',
])
console.log(`Released: https://github.com/${REPOSITORY}/releases/tag/${tag}`)
