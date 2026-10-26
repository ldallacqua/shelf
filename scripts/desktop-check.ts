/**
 * pnpm desktop:check
 *
 * Checks Shelf for Windows against the local server (the desktop guide,
 * section 5): starts the app's development build on `BASE_URL` with its web
 * view's debugging port open, connects to it as to any Chromium, signs in as
 * the made-up owner, and reads each page beside the same page read in a plain
 * Chromium the same size, Play left out (the app's and a browser's differ by
 * design). Then Play: a file is chosen (a development build takes it from
 * `SHELF_PICK`, since no script can answer Windows' picker) and started,
 * and must start in its own folder. The file is a batch file that only
 * writes that folder down; no game is started, and Steam's link is read,
 * never followed. Fails if a page reads differently, if the bridge does not
 * answer Shelf's page, if the header is not the window's bar (ADR 005,
 * section 8), if linking Steam (the test double) does not come back to the
 * app, if Play does not start the file where it should, or if the console
 * has an error. `DESKTOP_CHECK_SHOTS=<folder>` keeps a picture of the window
 * at each step, for a person to look at.
 *
 * Start the server first: pnpm build && pnpm serve:test. Never against
 * production: it signs in with the test doubles' made-up password.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium, type Browser, type Page } from '@playwright/test'

import { BASE_URL } from './lib/budgets.ts'
import { rustEnv } from './lib/rust-env.ts'

const PORT = 9333
const SHOTS = process.env.DESKTOP_CHECK_SHOTS
const OWNER = { email: 'owner@shelf.test', password: 'test-doubles-only-owner-password' }

/** The pages the owner reads most, as the made-up owner has them. */
const PAGES = [
  '/en/u/sample',
  '/en/u/sample?view=wall',
  '/en/u/sample?view=list',
  '/en/u/sample/game/the-elder-scrolls-v-skyrim',
  '/en/u/sample/trophies',
  '/en/account',
  '/en/account/unsorted',
  '/pt-BR/u/sample?view=list',
]

const problems: string[] = []
const fail = (problem: string) => {
  problems.push(problem)
  console.log(`  ✗ ${problem}`)
}
const pass = (what: string) => console.log(`  ✓ ${what}`)

/** Waits for `ready` to be true, or fails with `what` after `seconds`. */
async function until(what: string, seconds: number, ready: () => Promise<boolean>) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    if (await ready().catch(() => false)) return
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`${what} did not happen within ${seconds} s`)
}

if (/^https:\/\/shelf-ldallacqua\.vercel\.app/.test(BASE_URL)) {
  console.error('Never against production: this signs in with a made-up password.')
  process.exit(1)
}
if (
  !(await fetch(`${BASE_URL}/en`).then(
    (answer) => answer.ok,
    () => false,
  ))
) {
  console.error(`Nothing answers at ${BASE_URL}. Start it first: pnpm build && pnpm serve:test`)
  process.exit(1)
}

console.log('Building the app (debug)…')
const built = spawnSync('cargo', ['build', '--manifest-path', 'desktop/Cargo.toml'], {
  stdio: 'inherit',
  env: rustEnv(),
})
if (built.status !== 0) process.exit(built.status ?? 1)

// A web view profile of its own, so each run starts signed out, and the installed app's is untouched.
const profile = mkdtempSync(join(tmpdir(), 'shelf-desktop-check-'))
// A stand-in for a game's file: a batch file that writes down the folder it was started in.
const game = mkdtempSync(join(tmpdir(), 'shelf-desktop-game-'))
const started = join(game, 'started.txt')
writeFileSync(join(game, 'start.bat'), '@echo off\r\necho %CD%> "%~dp0started.txt"\r\n')
const app = spawn(resolve('desktop/target/debug/shelf-desktop.exe'), [], {
  env: {
    ...process.env,
    SHELF_URL: BASE_URL,
    SHELF_DATA_DIR: profile,
    SHELF_PICK: join(game, 'start.bat'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: 'inherit',
})

let plain: Browser | undefined
let exitCode = 0
try {
  await until(
    'the app’s web view opening its debugging port',
    60,
    async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok,
  )
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const pageOfApp = async () =>
    browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url().startsWith(BASE_URL))
  await until('the app opening Shelf', 30, async () => (await pageOfApp()) !== undefined)
  const shelf = (await pageOfApp())!
  /** A picture of the app's page, when a person asked for them. */
  const shot = async (name: string) => {
    if (SHOTS) await shelf.screenshot({ path: join(SHOTS, `${name.replace(/[^\w-]+/g, '_')}.png`) })
  }
  const errors: string[] = []
  shelf.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${shelf.url()}: ${message.text()}`)
  })
  shelf.on('pageerror', (error) => errors.push(`${shelf.url()}: ${error.message}`))

  console.log('\nThe app')
  pass(`opened ${BASE_URL}`)

  const info = await shelf.evaluate(async () => {
    const tauri = (
      window as unknown as {
        __TAURI__?: { core: { invoke: (command: string) => Promise<unknown> } }
      }
    ).__TAURI__
    return tauri ? await tauri.core.invoke('desktop_info') : undefined
  })
  if (info && typeof (info as { version?: unknown }).version === 'string')
    pass(`its bridge answers Shelf's page (version ${(info as { version: string }).version})`)
  else fail('its bridge did not answer Shelf’s page')

  // The window has no Windows bar: Shelf's header is the bar, with the window's controls.
  // In English, whatever Windows' language, so the controls are found by their English names.
  await shelf.goto(`${BASE_URL}/en`)
  // What makes the header the bar is fetched once the page runs, in that window only.
  await shelf
    .waitForFunction(() => document.querySelector('header[data-tauri-drag-region]'), null, {
      timeout: 10_000,
    })
    .catch(() => {})
  const bar = await shelf.evaluate(() => ({
    frameless: document.documentElement.getAttribute('data-window'),
    drag: document.querySelector('header')?.getAttribute('data-tauri-drag-region'),
  }))
  const control = (name: string) =>
    shelf.locator('header').getByRole('button', { name, exact: true })
  const shown = await Promise.all(
    ['Minimize', 'Maximize', 'Close'].map((name) => control(name).isVisible()),
  )
  if (bar.frameless === 'frameless' && bar.drag === 'deep' && shown.every(Boolean))
    pass('its header is the window’s bar, with minimize, maximize and close')
  else fail(`its header is not the window’s bar: ${JSON.stringify({ ...bar, shown })}`)
  await shot('header')
  await control('Maximize').click()
  await control('Restore').waitFor({ timeout: 5_000 })
  await control('Restore').click()
  await control('Maximize').waitFor({ timeout: 5_000 })
  pass('maximizes and restores from its header')

  const size = await shelf.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  plain = await chromium.launch()
  const context = await plain.newContext({ viewport: size, locale: 'en-US' })
  const browserPage = await context.newPage()
  // Counts that count up as they appear would be read halfway: both read the calm version.
  for (const page of [shelf, browserPage]) await page.emulateMedia({ reducedMotion: 'reduce' })

  for (const page of [shelf, browserPage]) await signIn(page)
  pass('signed in as the made-up owner')

  console.log(`\nEach page, beside a plain Chromium at ${size.width} by ${size.height}`)
  for (const path of PAGES) {
    const [inApp, inBrowser] = await Promise.all([
      readPage(shelf, path),
      readPage(browserPage, path),
    ])
    if (inApp === inBrowser) pass(`${path} reads the same (${inApp.length} characters)`)
    else fail(`${path} reads differently:\n${difference(inApp, inBrowser)}`)
    await shot(path)
  }

  console.log('\nLinking Steam (the test double)')
  await shelf.goto(`${BASE_URL}/api/v1/me/platforms/steam/connect?locale=en`)
  await until('coming back from Steam', 20, async () => /\/en\/account/.test(shelf.url()))
  pass(`came back to ${new URL(shelf.url()).pathname}, in the app`)

  console.log('\nPlay, from a file')
  await shelf.goto(`${BASE_URL}/en/u/sample/game/bloodborne`)
  await shelf.getByRole('button', { name: 'Choose the game’s file' }).click()
  await shelf.getByRole('button', { name: 'Play', exact: true }).click()
  await until('the file starting', 15, async () => existsSync(started))
  const folder = readFileSync(started, 'utf8').trim()
  if (folder.toLowerCase() === game.toLowerCase()) pass(`started the file, in its own folder`)
  else fail(`started the file in ${folder}, not in its own folder, ${game}`)
  await shelf.getByRole('button', { name: 'Ways to play' }).click()
  await shelf.getByRole('menuitem', { name: 'Forget the file' }).click()
  await shelf.getByRole('button', { name: 'Choose the game’s file' }).waitFor({ timeout: 10_000 })
  pass('forgot it, and asks for the file again')

  console.log('\nPlay, through Steam (read, never followed)')
  // Linked, then synced, from the app's own page: Skyrim comes from the made-up Steam account.
  await shelf.evaluate(async () => {
    let body: object = { read: true }
    for (let step = 0; step < 20; step++) {
      const answer = await fetch('/api/v1/me/platforms/steam/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const { remaining } = (await answer.json()) as { remaining?: number }
      if (!remaining) return
      body = {}
    }
  })
  await shelf.goto(`${BASE_URL}/en/u/sample/game/the-elder-scrolls-v-skyrim`)
  const steam = shelf.locator('[data-play] a[href^="steam://"]')
  await steam.waitFor({ timeout: 10_000 })
  pass(`Skyrim offers “${await steam.textContent()}”, to ${await steam.getAttribute('href')}`)

  console.log('\nThe console')
  if (errors.length === 0) pass('no error')
  else for (const error of errors) fail(error)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  await plain?.close()
  // The app and the web view's own processes, which hold its profile until they end.
  if (app.pid) spawnSync('taskkill', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore' })
  rmSync(game, { recursive: true, force: true })
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch {
    console.log(`(Left ${profile} behind: a web view process still holds it.)`)
  }
  exitCode = problems.length > 0 ? 1 : 0
}

console.log(
  problems.length > 0
    ? `\n${problems.length} problem(s).`
    : '\nThe app shows what a browser shows.',
)
process.exit(exitCode)

async function signIn(page: Page) {
  await page.goto(`${BASE_URL}/en/sign-in`)
  await page.getByLabel('Email address or handle').fill(OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.endsWith('/sign-in'), { timeout: 20_000 })
}

/**
 * A page's words once it has settled (every ghost gone, nothing left to
 * fetch), without Play, which the app and a browser draw differently.
 */
async function readPage(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
  await until(`${path} settling`, 20, async () => (await page.locator('.ghost').count()) === 0)
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body
    const words = main.cloneNode(true) as HTMLElement
    for (const play of words.querySelectorAll('[data-play]')) play.remove()
    // A detached copy has no layout, so its text is read as written, then spaced as one line.
    return (words.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

/** Where two readings part, with a little of each around it. */
function difference(a: string, b: string) {
  let at = 0
  while (at < a.length && a[at] === b[at]) at++
  const from = Math.max(0, at - 60)
  return `    app:     …${a.slice(from, at + 80)}…\n    browser: …${b.slice(from, at + 80)}…`
}
