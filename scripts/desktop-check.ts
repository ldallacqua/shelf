/**
 * pnpm desktop:check
 *
 * Checks Shelf for Windows against the local server (the desktop guide,
 * section 5): starts the app's development build on `BASE_URL` with its web
 * view's debugging port open, connects to it as to any Chromium, signs in as
 * the made-up owner, and reads each page beside the same page read in a plain
 * Chromium the same size. Fails if a page reads differently, if the app's
 * bridge does not answer Shelf's page, if linking Steam (the test double)
 * does not come back to the app, or if the console has an error.
 *
 * Start the server first: pnpm build && pnpm serve:test. Never against
 * production: it signs in with the test doubles' made-up password.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium, type Browser, type Page } from '@playwright/test'

import { BASE_URL } from './lib/budgets.ts'
import { rustEnv } from './lib/rust-env.ts'

const PORT = 9333
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
const app = spawn(resolve('desktop/target/debug/shelf-desktop.exe'), [], {
  env: {
    ...process.env,
    SHELF_URL: BASE_URL,
    SHELF_DATA_DIR: profile,
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
  }

  console.log('\nLinking Steam (the test double)')
  await shelf.goto(`${BASE_URL}/api/v1/me/platforms/steam/connect?locale=en`)
  await until('coming back from Steam', 20, async () => /\/en\/account/.test(shelf.url()))
  pass(`came back to ${new URL(shelf.url()).pathname}, in the app`)

  console.log('\nThe console')
  if (errors.length === 0) pass('no error')
  else for (const error of errors) fail(error)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  await plain?.close()
  // The app and the web view's own processes, which hold its profile until they end.
  if (app.pid) spawnSync('taskkill', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore' })
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

/** A page's words once it has settled: every ghost gone, nothing left to fetch. */
async function readPage(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
  await until(`${path} settling`, 20, async () => (await page.locator('.ghost').count()) === 0)
  return page.evaluate(() =>
    (document.querySelector('main') ?? document.body).innerText.replace(/\s+/g, ' ').trim(),
  )
}

/** Where two readings part, with a little of each around it. */
function difference(a: string, b: string) {
  let at = 0
  while (at < a.length && a[at] === b[at]) at++
  const from = Math.max(0, at - 60)
  return `    app:     …${a.slice(from, at + 80)}…\n    browser: …${b.slice(from, at + 80)}…`
}
