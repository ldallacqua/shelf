/**
 * pnpm ui:capture <screen…> | --list
 *
 * Takes the pictures and facts the UI/UX review judges (docs/ui-review.md): for
 * each screen and each of its scenes, the first screen at 390 and 1440 pixels
 * wide, light and dark, English and Portuguese; axe-core's violations for each;
 * the order Tab moves through; every word shown; headings, sideways scroll,
 * small targets and console errors. All of it goes to `.data/ui-review/<screen>/`,
 * with an `index.md` that lists it.
 *
 * It photographs a running server: `pnpm build`, then `pnpm serve:test` (or
 * BASE_URL). The owner's screens sign in as the sample shelf with the test
 * doubles' made-up owner, so they need the test doubles on; a new account's
 * screens sign one up through the real form, on the test database. A name that
 * starts with `/` captures that address as a visitor. `screen:scene,scene`
 * captures only those scenes again, beside the screen's others, with an index of
 * their own (`index-<scenes>.md`): for a review run again over what a fix touched.
 */
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import AxeBuilder from '@axe-core/playwright'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { routing, type Locale } from '../src/i18n/routing.ts'
import { MOCK_OWNER } from '../src/server/mocks/owner.ts'
import { BASE_URL } from './lib/budgets.ts'

type Who = 'visitor' | 'owner' | 'new'
type Scene = {
  name: string
  /** Replaces the screen's address for this scene. `{handle}` is the signed-in shelf's. */
  path?: string
  /** What to do once the page is ready, before the pictures. */
  act?: (page: Page) => Promise<void>
  /** Why this scene logs an error on purpose (a refused password answers 401). */
  expectedErrors?: string
}
type Screen = {
  name: string
  path: string
  who?: Who
  scenes?: Scene[]
  /** For a page that answers 404 on purpose. */
  allowErrors?: boolean
}

const SHELF = '/u/sample'

/** Fills a field found by its name, which is the same in both languages. */
const fill = (page: Page, name: string, value: string) =>
  page.locator(`input[name="${name}"]`).fill(value)

/** A handle no other run has. */
const freshHandle = () => `review-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`

/**
 * The duel (spec 3.14), from choosing to the game left. Each picture starts from a fresh device, so
 * each scene chooses its games again: the first of the backlog, in places drawn by a random that
 * always draws the same, so every width shows the same duel. Setting a game to Playing is answered
 * here, so the test database, and the next picture's backlog, stay as they were.
 */
async function chooseFirst(page: Page, count: number) {
  await page.locator('.duel-pool').waitFor({ timeout: 20_000 })
  const games = page.locator('.duel-pick')
  for (let index = 0; index < count; index += 1) {
    // Past the first screenful the list draws more on asking.
    if ((await games.count()) <= index) {
      await page.getByRole('button', { name: /^(Show|Mostrar mais)/ }).click()
    }
    // A seventeenth is marked unavailable, and still answers a press by saying the duel is full.
    await games.nth(index).click({ force: index >= 16 })
  }
}

const chooseEight = (page: Page) => chooseFirst(page, 8)

async function startDuel(page: Page, count = 8) {
  await chooseFirst(page, count)
  await page.evaluate(() => {
    let seed = 7
    Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  })
  // The bar below a wide screen and the panel beside the list each have Start: the one showing.
  await page
    .getByRole('button', { name: /^(Start the duel|Começar o duelo)$/ })
    .filter({ visible: true })
    .click()
  await page.locator('.duel-arena').waitFor()
}

async function chooseLeft(page: Page, times: number) {
  for (let pick = 0; pick < times; pick += 1) {
    await page.keyboard.press('ArrowLeft')
    // A choice shows for a moment before the next two step in.
    await page.waitForTimeout(450)
  }
}

async function toChampion(page: Page) {
  await startDuel(page)
  await chooseLeft(page, 7)
  await page.locator('.duel-champion').waitFor()
}

/** Presses a status chip, by its name in either language. */
const chip = (page: Page, name: RegExp) => page.getByRole('button', { name }).first().click()
const BACKLOG = /^(Backlog|Na fila)/
const PLAYING = /^(Playing|Jogando)/
const WISHLIST = /^(Wishlist|Lista de desejos)/

/** Two games' duel, the final, after choosing them some other way than from the backlog. */
async function startFinal(page: Page) {
  await page
    .getByRole('button', { name: /^(Start the duel|Começar o duelo)$/ })
    .filter({ visible: true })
    .click()
  await page.locator('.duel-arena').waitFor()
}

/** Answers a status change (Start playing it) with this, so the test database stays as it was. */
const answerPatch = (page: Page, answer: { status: number; json: unknown }) =>
  page.route('**/api/v1/entries/**', (route) =>
    route.request().method() === 'PATCH' ? route.fulfill(answer) : route.continue(),
  )

/** A filter the sample shelf answers with a few games, so chips, counts and a short shelf show. */
const A_FILTER = 'genre:rpg status:backlog'

/**
 * Opens the filters: a dialog below 96rem. From there up they stand beside the library already,
 * with no button to press.
 */
async function openFilters(page: Page) {
  const button = page.getByRole('button', { name: /^(Filters|Filtros)/ }).filter({ visible: true })
  if ((await button.count()) === 0) return
  await button.first().click()
  await page.locator('[data-filter-panel]').waitFor()
}

const settingsPages = [
  'profile',
  'privacy',
  'platforms',
  'security',
  'appearance',
  'app',
  'download-sources',
  'download-services',
  'saves',
]

/** Every screen the review knows, by the name docs/ui-review.md gives it. */
const screens: Screen[] = [
  { name: 'home', path: '' },
  {
    name: 'sign-in',
    path: '/sign-in',
    scenes: [
      { name: 'open' },
      {
        name: 'wrong-password',
        expectedErrors: 'The refused password answers 401, which the browser logs.',
        act: async (page) => {
          await fill(page, 'who', 'sample')
          await fill(page, 'password', 'not-the-password-at-all')
          await page.locator('button[type="submit"]').click()
          await page.locator('p[role="alert"]').waitFor()
        },
      },
    ],
  },
  {
    name: 'sign-up',
    path: '/sign-up',
    scenes: [
      { name: 'open' },
      {
        name: 'handle-kept',
        act: async (page) => {
          await fill(page, 'handle', 'library')
          await page.locator('input[name="handle"][aria-invalid="true"]').waitFor()
        },
      },
      {
        name: 'filled',
        act: async (page) => {
          await fill(page, 'name', 'Sam Rivera')
          await fill(page, 'handle', freshHandle())
          await fill(page, 'email', 'sam@shelf.test')
          await fill(page, 'password', 'a-made-up-review-password')
          // The handle's check answers after a pause.
          await page.waitForTimeout(1500)
        },
      },
      {
        // Sent with the sample shelf's address, which an account already uses: nothing is made.
        name: 'email-taken',
        expectedErrors: 'The refused sign-up answers with an error status, which the browser logs.',
        act: async (page) => {
          await fill(page, 'name', 'Sam Rivera')
          await fill(page, 'handle', freshHandle())
          await fill(page, 'email', MOCK_OWNER.email)
          await fill(page, 'password', 'a-made-up-review-password')
          await page.waitForTimeout(1500)
          await page.locator('button[type="submit"]').click()
          await page.locator('p[role="alert"]').waitFor()
        },
      },
    ],
  },
  {
    name: 'library',
    path: SHELF,
    scenes: [
      { name: 'open' },
      { name: 'filters', act: openFilters },
      { name: 'filtered', path: `${SHELF}?q=${encodeURIComponent(A_FILTER)}` },
      { name: 'no-match', path: `${SHELF}?q=zzzz` },
      {
        name: 'sort-menu',
        act: async (page) => {
          await page
            .getByRole('button', { name: /^(Sort|Ordem)/ })
            .first()
            .click()
          await page.getByRole('menu').waitFor()
        },
      },
      { name: 'grouped', path: `${SHELF}?group=status` },
    ],
  },
  {
    // One's own shelf: Add, and saving a filter as a shelf.
    name: 'library-mine',
    path: SHELF,
    who: 'owner',
    scenes: [
      { name: 'open' },
      { name: 'filtered', path: `${SHELF}?q=${encodeURIComponent(A_FILTER)}` },
    ],
  },
  { name: 'library-wall', path: `${SHELF}?view=wall` },
  { name: 'library-list', path: `${SHELF}?view=list` },
  { name: 'library-banners', path: `${SHELF}?view=banner` },
  { name: 'library-empty', path: '/u/{handle}', who: 'new' },
  { name: 'game', path: `${SHELF}/game/bloodborne` },
  { name: 'game-mine', path: `${SHELF}/game/bloodborne`, who: 'owner' },
  { name: 'unsorted', path: '/account/unsorted', who: 'owner' },
  { name: 'hours', path: '/account/hours', who: 'owner' },
  { name: 'archived', path: '/account/archived', who: 'owner' },
  {
    name: 'duel',
    path: '/account/duel',
    who: 'owner',
    scenes: [
      { name: 'pick' },
      { name: 'picked', act: chooseEight },
      { name: 'fight', act: startDuel },
      {
        name: 'fight-later',
        act: async (page) => {
          await startDuel(page)
          await chooseLeft(page, 4)
        },
      },
      { name: 'champion', act: toChampion },
      {
        name: 'started',
        act: async (page) => {
          await answerPatch(page, { status: 200, json: { version: 999_999 } })
          await toChampion(page)
          await page.getByRole('button', { name: /^(Start playing it|Começar a jogar)$/ }).click()
          await page.locator('.duel-champion [role="status"]:not(:empty)').waitFor()
        },
      },
      {
        name: 'start-failed',
        expectedErrors: 'Saving is refused on purpose, which the browser logs.',
        act: async (page) => {
          await answerPatch(page, { status: 500, json: { error: 'failed' } })
          await toChampion(page)
          await page.getByRole('button', { name: /^(Start playing it|Começar a jogar)$/ }).click()
          await page.locator('.duel-champion [role="status"]:not(:empty)').waitFor()
        },
      },
      {
        // The game left is one already being played: it says so, in words.
        name: 'already-playing',
        act: async (page) => {
          await page.locator('.duel-pool').waitFor({ timeout: 20_000 })
          await chip(page, PLAYING)
          await chip(page, BACKLOG)
          await chooseFirst(page, 2)
          await startFinal(page)
          await chooseLeft(page, 1)
          await page.locator('.duel-champion').waitFor()
        },
      },
      {
        // A wished-for game against one owned: one Platforms row, "Wanted on" on one side.
        name: 'wishlist',
        act: async (page) => {
          await page.locator('.duel-pool').waitFor({ timeout: 20_000 })
          await chip(page, WISHLIST)
          await chip(page, BACKLOG)
          await chooseFirst(page, 1)
          await chip(page, BACKLOG)
          await chip(page, WISHLIST)
          await chooseFirst(page, 1)
          await startFinal(page)
        },
      },
      {
        // A shelf whose games all wait for a status: the duel leads to Organize.
        name: 'unsorted',
        act: async (page) => {
          await page.route('**/api/v1/me/library', async (route) => {
            const file = (await (await route.fetch()).json()) as { games: unknown[][] }
            // A game's third place is its status, by its place in `statusCodes`: 5 is unsorted.
            for (const row of file.games) row[2] = 5
            await route.fulfill({ json: file })
          })
          await page.reload()
          await page.getByRole('link', { name: /^(Go to Organize|Ir para Organizar)$/ }).waitFor()
        },
      },
      {
        name: 'confirm',
        act: async (page) => {
          await startDuel(page)
          await chooseLeft(page, 1)
          await page.getByRole('button', { name: /^(Change the games|Trocar os jogos)$/ }).click()
          await page.getByRole('alertdialog').waitFor()
        },
      },
      {
        name: 'full',
        act: async (page) => {
          await chooseFirst(page, 17)
        },
      },
      {
        name: 'no-match',
        act: async (page) => {
          await page.locator('.duel-pool').waitFor({ timeout: 20_000 })
          // The header has a search of its own on a wide screen.
          await page
            .getByRole('searchbox', { name: /^(Find a game|Encontrar um jogo)$/ })
            .fill('zzzz')
          await page.waitForTimeout(800)
        },
      },
      { name: 'byes', act: (page) => startDuel(page, 5) },
      { name: 'sixteen', act: (page) => startDuel(page, 16) },
      {
        name: 'failed',
        expectedErrors: 'The library read is refused on purpose, which the browser logs.',
        act: async (page) => {
          await page.route('**/api/v1/me/library', (route) => route.abort())
          await page.reload()
          await page.locator('[role="alert"]').waitFor()
        },
      },
    ],
  },
  { name: 'duel-empty', path: '/account/duel', who: 'new' },
  { name: 'duel-visitor', path: '/account/duel' },
  {
    name: 'start',
    path: '/account/start',
    who: 'new',
    scenes: ['play', 'bring', 'look', 'sort', 'ready'].map((step) => ({
      name: step,
      path: `/account/start#${step}`,
    })),
  },
  { name: 'settings', path: '/settings', who: 'owner' },
  ...settingsPages.map((page) => ({
    name: `settings-${page}`,
    path: `/settings/${page}`,
    who: 'owner' as const,
  })),
  { name: 'shelf', path: `${SHELF}/shelves/short-ones` },
  { name: 'trophies', path: `${SHELF}/trophies` },
  { name: 'downloads', path: '/downloads' },
  { name: 'consent', path: '/consent' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
  { name: 'missing', path: '/u/sample/game/no-such-game', allowErrors: true },
]

/**
 * Every main breakpoint, each at a width where it turns on or a device people use. Layout is
 * what changes with the width, so the full set (both themes, both languages) is taken at the
 * phone and the desktop only, as the browser tests' projects have them; the others in light
 * and Portuguese, whose longer words break a layout first.
 */
const widths = [
  // The narrowest phone, and WCAG's reflow width (1.4.10).
  { width: 320, height: 640, full: false },
  // The browser tests' phone.
  { width: 390, height: 844, full: true },
  // sm turns on: a big phone held sideways, a small tablet.
  { width: 640, height: 800, full: false },
  // md: the browser tests' tablet, upright.
  { width: 820, height: 1180, full: false },
  // lg turns on: a tablet held sideways, a small laptop; the list beside a game appears.
  { width: 1024, height: 768, full: false },
  // xl: the browser tests' desktop.
  { width: 1440, height: 900, full: true },
  // 2xl: a wide monitor.
  { width: 1920, height: 1080, full: false },
] as const
const themes = ['light', 'dark'] as const
const locales = routing.locales
/** Where a width is taken in one look only, that look. */
const ONE_LOOK = { theme: 'light', locale: 'pt-BR' } as const
/** A full-page picture stops here: past it, the first screens say enough. */
const FULL_PAGE_LIMIT = 6000
const FOCUS_STOPS = 60

type Combo = { width: number; height: number; theme: (typeof themes)[number]; locale: Locale }
const comboName = ({ width, theme, locale }: Combo) => `${width}-${theme}-${locale}`

/** Waits until the page is at rest: live, nothing busy, fonts in, images painted, fades over. */
async function settle(page: Page) {
  await page
    .locator('html[data-ready]')
    .waitFor({ state: 'attached', timeout: 15_000 })
    .catch(() => {})
  await page
    .waitForFunction(
      () =>
        !document.querySelector('[aria-busy="true"]') &&
        !document.querySelector('[role="radiogroup"][tabindex="-1"]'),
      null,
      { timeout: 15_000 },
    )
    .catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((image) => {
            const box = image.getBoundingClientRect()
            return box.bottom > 0 && box.top < window.innerHeight && box.width > 0
          })
          .every((image) => image.complete),
      null,
      { timeout: 10_000 },
    )
    .catch(() => {})
  // Fades and rises end on their own; one that is paused, or restarted as a scene comes into view
  // (the landing's), never would: give up on those after a few seconds, as every wait here does.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.timeline instanceof DocumentTimeline &&
              animation.playState !== 'paused' &&
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      ),
      new Promise((done) => setTimeout(done, 5_000)),
    ]),
  )
  await page.waitForTimeout(400)
}

/** Signs in as the sample shelf, through the real form, while the test doubles answer. */
async function signInAsOwner(page: Page) {
  await page.goto(`${BASE_URL}/en/sign-in`)
  await settle(page)
  await fill(page, 'who', MOCK_OWNER.email)
  await fill(page, 'password', MOCK_OWNER.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 })
}

/** Signs a new account up through the real form, on the test database. Returns its handle. */
async function signUpNew(page: Page): Promise<string> {
  const handle = freshHandle()
  await page.goto(`${BASE_URL}/en/sign-up`)
  await settle(page)
  await fill(page, 'name', 'Sam Rivera')
  await fill(page, 'handle', handle)
  await fill(page, 'email', `${handle}@shelf.test`)
  // Made up for this run and never printed: the account lives only in the test database.
  await fill(page, 'password', randomBytes(18).toString('base64url'))
  await page.waitForTimeout(1500)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/sign-up'), { timeout: 20_000 })
  return handle
}

type Session = { state?: string; handle: string }

async function sessionFor(browser: Browser, who: Who, folder: string): Promise<Session> {
  if (who === 'visitor') return { handle: 'sample' }
  const context = await browser.newContext()
  const page = await context.newPage()
  const handle = who === 'owner' ? (await signInAsOwner(page), 'sample') : await signUpNew(page)
  const state = join(folder, `session-${who}.json`)
  await context.storageState({ path: state })
  await context.close()
  return { state, handle }
}

async function newContext(browser: Browser, combo: Combo, session: Session) {
  const context = await browser.newContext({
    viewport: { width: combo.width, height: combo.height },
    colorScheme: combo.theme,
    locale: combo.locale,
    storageState: session.state,
  })
  // As a returning visitor would have it: the theme chosen, nothing else set.
  await context.addInitScript((theme) => {
    window.localStorage.setItem('shelf:theme', theme)
  }, combo.theme)
  return context
}

type AxeViolation = { id: string; impact: string; help: string; targets: string[] }

async function runAxe(page: Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    targets: violation.nodes.slice(0, 8).map((node) => node.target.join(' ')),
  }))
}

type Facts = {
  headings: string[]
  sideways: number
  pageHeight: number
  smallTargets: { name: string; width: number; height: number }[]
}

function readFacts(page: Page): Promise<Facts> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden'
    }
    const nameOf = (element: Element) =>
      (
        element.getAttribute('aria-label') ||
        (element as HTMLElement).innerText ||
        element.getAttribute('name') ||
        element.tagName.toLowerCase()
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter(visible)
      .map((heading) => `${heading.tagName.toLowerCase()} ${nameOf(heading)}`)
    const controls = document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], [tabindex="0"]',
    )
    const smallTargets = [...controls]
      .filter(visible)
      .map((element) => {
        const box = element.getBoundingClientRect()
        return {
          name: nameOf(element),
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      })
      .filter((target) => target.width < 24 || target.height < 24)
      .sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height))
      .slice(0, 20)
    return {
      headings,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageHeight: document.documentElement.scrollHeight,
      smallTargets,
    }
  })
}

type FocusStop = {
  n: number
  element: string
  size: string
  ring: string
  covered: boolean
}

/** Presses Tab from the top of the page and notes each stop, until focus comes round again. */
async function walkFocus(page: Page): Promise<FocusStop[]> {
  // A scene may leave focus in a field. Tab starts after whatever was focused
  // last, so start from a mark at the very top of the page, outside the Tab order.
  await page.evaluate(() => {
    const mark = document.createElement('span')
    mark.id = 'ui-capture-start'
    mark.tabIndex = -1
    document.body.prepend(mark)
    mark.focus()
    window.scrollTo(0, 0)
  })
  const stops: FocusStop[] = []
  let first = ''
  for (let n = 1; n <= FOCUS_STOPS; n += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(60)
    const focused = page.locator(':focus')
    if ((await focused.count()) === 0) break
    const snapshot = (await focused.ariaSnapshot().catch(() => '')).split('\n')[0] ?? ''
    const element = snapshot
      .replace(/^- /, '')
      .replace(/:$/, '')
      .replace(/^'(.*)'$/, '$1')
      // What a field holds is not the review's business, and may be a password.
      .replace(/^(textbox "[^"]*").*$/, '$1')
      .slice(0, 90)
    const facts = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement
      const box = active.getBoundingClientRect()
      const style = getComputedStyle(active)
      const ring =
        style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
          ? `outline ${style.outlineWidth}`
          : style.boxShadow !== 'none'
            ? 'shadow'
            : 'none'
      const x = Math.min(Math.max(box.left + box.width / 2, 0), window.innerWidth - 1)
      const y = Math.min(Math.max(box.top + box.height / 2, 0), window.innerHeight - 1)
      const top = document.elementFromPoint(x, y)
      return {
        id: `${active.tagName}#${active.id}.${active.className}@${Math.round(box.left)},${Math.round(box.top + window.scrollY)}`,
        size: `${Math.round(box.width)}x${Math.round(box.height)}`,
        ring,
        covered: !!top && top !== active && !active.contains(top) && !top.contains(active),
      }
    })
    if (n === 1) first = facts.id
    else if (facts.id === first) break
    stops.push({ n, element: element || '(no name)', ...facts })
  }
  await page.evaluate(() => document.getElementById('ui-capture-start')?.remove())
  return stops.map(({ n, element, size, ring, covered }) => ({ n, element, size, ring, covered }))
}

type SceneRecord = {
  scene: string
  address: string
  pictures: string[]
  axe: Record<string, AxeViolation[]>
  facts: Record<string, Facts>
  focus: FocusStop[]
  errors: string[]
  expectedErrors?: string
  failed: string[]
}

async function captureScene(
  browser: Browser,
  screen: Screen,
  scene: Scene,
  session: Session,
  folder: string,
): Promise<SceneRecord> {
  const out = join(folder, scene.name)
  mkdirSync(out, { recursive: true })
  const path = (scene.path ?? screen.path).replace('{handle}', session.handle)
  const record: SceneRecord = {
    scene: scene.name,
    address: path || '/',
    pictures: [],
    axe: {},
    facts: {},
    focus: [],
    errors: [],
    expectedErrors: scene.expectedErrors,
    failed: [],
  }

  for (const { full, ...size } of widths) {
    for (const theme of themes) {
      for (const locale of locales) {
        if (!full && (theme !== ONE_LOOK.theme || locale !== ONE_LOOK.locale)) continue
        const combo: Combo = { ...size, theme, locale }
        const name = comboName(combo)
        let context: BrowserContext | undefined
        try {
          context = await newContext(browser, combo, session)
          const page = await context.newPage()
          page.on('console', (message) => {
            if (message.type() === 'error' && !screen.allowErrors) {
              record.errors.push(`${name}: ${message.text().slice(0, 200)}`)
            }
          })
          page.on('pageerror', (error) =>
            record.errors.push(`${name}: uncaught ${error.message.slice(0, 200)}`),
          )
          await page.goto(`${BASE_URL}/${locale}${path}`)
          await settle(page)
          if (scene.act) {
            await scene.act(page)
            await settle(page)
          }

          await page.screenshot({ path: join(out, `${name}.png`) })
          record.pictures.push(`${name}.png`)
          const facts = await readFacts(page)
          record.facts[name] = facts
          if (facts.pageHeight > size.height + 40) {
            // Below the first screen, lazy images load only once scrolled to.
            await page.evaluate(async (limit) => {
              for (let y = 0; y < Math.min(document.body.scrollHeight, limit); y += 600) {
                window.scrollTo(0, y)
                await new Promise((done) => setTimeout(done, 120))
              }
              window.scrollTo(0, 0)
            }, FULL_PAGE_LIMIT)
            await settle(page)
            await page.screenshot({
              path: join(out, `${name}-full.png`),
              fullPage: true,
              clip: {
                x: 0,
                y: 0,
                width: size.width,
                height: Math.min(facts.pageHeight, FULL_PAGE_LIMIT),
              },
            })
            record.pictures.push(`${name}-full.png`)
          }
          record.axe[name] = await runAxe(page)

          if (size.width === 1440 && theme === 'light') {
            const words = await page.evaluate(() => document.body.innerText)
            writeFileSync(join(out, `text-${locale}.txt`), words)
            if (locale === 'en') record.focus = await walkFocus(page)
          }
        } catch (error) {
          record.failed.push(`${name}: ${(error as Error).message.split('\n')[0]}`)
        } finally {
          await context?.close()
        }
      }
    }
  }

  writeFileSync(join(out, 'axe.json'), JSON.stringify(record.axe, null, 2))
  writeFileSync(join(out, 'facts.json'), JSON.stringify(record.facts, null, 2))
  writeFileSync(join(out, 'focus.json'), JSON.stringify(record.focus, null, 2))
  return record
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function indexOf(screen: Screen, records: SceneRecord[], commit: string): string {
  const lines = [
    `# ${screen.name}`,
    '',
    `Captured ${new Date().toISOString().slice(0, 16).replace('T', ' ')} on ${commit}, from ${BASE_URL}, as ${screen.who ?? 'visitor'}.`,
    'Read docs/ui-review.md for what to do with this. Pictures are the first screen; `-full` is the page, up to',
    `${FULL_PAGE_LIMIT} pixels. Names are \`<width>-<theme>-<locale>\`. Widths: ${widths.map(({ width, full }) => `${width}${full ? ' (both themes, both languages)' : ''}`).join(', ')};`,
    `the rest in ${ONE_LOOK.theme} and ${ONE_LOOK.locale}. A seam in a \`-full\` picture where the first screen ends is`,
    'the fixed wall behind the page, drawn once by the capture: not a fault.',
  ]
  for (const record of records) {
    lines.push('', `## Scene: ${record.scene}`, '', `Address: \`/<locale>${record.address}\``, '')
    if (record.failed.length) {
      lines.push('**Could not capture:**', '', ...record.failed.map((line) => `- ${line}`), '')
    }
    lines.push(
      `Pictures, in \`${record.scene}/\`: ${record.pictures.map((picture) => `\`${picture}\``).join(', ')}`,
    )

    lines.push('', '### axe-core (WCAG 2.2 A, AA, best practice)', '')
    const byRule = new Map<string, { violation: AxeViolation; where: string[] }>()
    for (const [combo, violations] of Object.entries(record.axe)) {
      for (const violation of violations) {
        const entry = byRule.get(violation.id) ?? { violation, where: [] }
        entry.where.push(combo)
        byRule.set(violation.id, entry)
      }
    }
    if (byRule.size === 0) lines.push('No violations in any capture.')
    else {
      lines.push('| Rule | Impact | Help | In | First targets |', '| --- | --- | --- | --- | --- |')
      for (const { violation, where } of byRule.values()) {
        lines.push(
          `| ${violation.id} | ${violation.impact} | ${cell(violation.help)} | ${where.length === Object.keys(record.axe).length ? 'all' : where.join(', ')} | ${cell(violation.targets.slice(0, 3).join('; '))} |`,
        )
      }
    }

    lines.push('', '### Facts', '')
    // One line a width: its light English capture, or its one look.
    for (const [combo, facts] of Object.entries(record.facts)) {
      if (!combo.includes(`-${ONE_LOOK.theme}-`)) continue
      const width = combo.split('-')[0]
      if (!combo.endsWith('-en') && record.facts[`${width}-light-en`]) continue
      lines.push(
        `- **${combo}:** page ${facts.pageHeight}px tall, sideways scroll ${facts.sideways}px.`,
      )
      if (facts.smallTargets.length) {
        lines.push(
          `  Targets under 24px: ${facts.smallTargets.map((target) => `${cell(target.name)} (${target.width}x${target.height})`).join('; ')}`,
        )
      }
    }
    const sideways = Object.entries(record.facts).filter(([, facts]) => facts.sideways > 0)
    if (sideways.length) {
      lines.push(
        `- Scrolls sideways in: ${sideways.map(([combo, facts]) => `${combo} (${facts.sideways}px)`).join(', ')}`,
      )
    }
    const headings = record.facts['1440-light-en']?.headings ?? []
    lines.push(
      '',
      '**Headings (1440, light, en):**',
      '',
      ...(headings.length ? headings.map((heading) => `- ${heading}`) : ['- none']),
    )

    lines.push('', '### Focus order (1440, light, en)', '')
    if (record.focus.length === 0) lines.push('No stop reached.')
    else {
      lines.push('| # | Element | Size | Ring | Covered |', '| --- | --- | --- | --- | --- |')
      for (const stop of record.focus) {
        lines.push(
          `| ${stop.n} | ${cell(stop.element)} | ${stop.size} | ${stop.ring} | ${stop.covered ? 'yes' : ''} |`,
        )
      }
    }

    lines.push('', '### Console errors', '')
    if (record.expectedErrors) lines.push(`Expected in this scene: ${record.expectedErrors}`, '')
    lines.push(
      ...(record.errors.length
        ? [...new Set(record.errors)].map((line) => `- ${line}`)
        : ['None.']),
    )
    lines.push(
      '',
      `Words: \`${record.scene}/text-en.txt\`, \`${record.scene}/text-pt-BR.txt\`. Raw: \`axe.json\`, \`facts.json\`, \`focus.json\`.`,
    )
  }
  return `${lines.join('\n')}\n`
}

const asked = process.argv.slice(2)
if (asked.length === 0 || asked.includes('--list')) {
  console.log('Screens: (or an address starting with /)\n')
  for (const screen of screens) {
    console.log(`  ${screen.name.padEnd(28)} ${screen.path || '/'}  ${screen.who ?? ''}`)
  }
  process.exit(asked.length === 0 ? 1 : 0)
}

/** A screen to capture, whole, or only the scenes named after it (`duel:full,no-match`). */
type Asked = Screen & { only?: string[] }

const chosen = asked.map((argument): Asked => {
  if (argument.startsWith('/')) {
    return {
      name: argument.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home',
      path: argument,
    }
  }
  const [name = '', scenes] = argument.split(':')
  const screen = screens.find((candidate) => candidate.name === name)
  if (!screen) {
    console.error(`No screen named ${name}. pnpm ui:capture --list names them.`)
    process.exit(1)
  }
  if (scenes === undefined) return screen
  const only = scenes.split(',')
  const known = (screen.scenes ?? [{ name: 'open' }]).map((scene) => scene.name)
  const unknown = only.filter((scene) => !known.includes(scene))
  if (unknown.length > 0) {
    console.error(`${name} has no scene ${unknown.join(', ')}. Its scenes: ${known.join(', ')}.`)
    process.exit(1)
  }
  return { ...screen, only }
})

const commit = execSync('git rev-parse --short HEAD').toString().trim()
const root = resolve('.data/ui-review')
const browser = await chromium.launch()
try {
  for (const screen of chosen) {
    const folder = join(root, screen.name)
    // Scenes captured again replace only their own folders; the screen's others stay.
    if (screen.only) {
      for (const scene of screen.only) rmSync(join(folder, scene), { recursive: true, force: true })
    } else {
      rmSync(folder, { recursive: true, force: true })
    }
    mkdirSync(folder, { recursive: true })
    console.log(`${screen.name}: signing in as ${screen.who ?? 'visitor'}`)
    const session = await sessionFor(browser, screen.who ?? 'visitor', folder)
    const records: SceneRecord[] = []
    const scenes = (screen.scenes ?? [{ name: 'open' }]).filter(
      (scene) => !screen.only || screen.only.includes(scene.name),
    )
    for (const scene of scenes) {
      console.log(`${screen.name}: ${scene.name}`)
      records.push(await captureScene(browser, screen, scene, session, folder))
    }
    if (session.state) rmSync(session.state, { force: true })
    const index = screen.only ? `index-${screen.only.join('-')}.md` : 'index.md'
    writeFileSync(join(folder, index), indexOf(screen, records, commit))
    const failed = records.flatMap((record) => record.failed)
    console.log(
      `${screen.name}: wrote ${join(folder, index)}${failed.length ? `, ${failed.length} not captured` : ''}`,
    )
  }
} finally {
  await browser.close()
}
