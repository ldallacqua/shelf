import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Browser, type Page, type TestInfo } from '@playwright/test'

export const locales = ['en', 'pt-BR'] as const
export const themes = ['light', 'dark'] as const
export type Locale = (typeof locales)[number]
export type Theme = (typeof themes)[number]

/** Every page that exists, by its address after the language. */
export const pages = [
  { name: 'home', path: '' },
  { name: 'library', path: '/library' },
  { name: 'shelf', path: '/shelves/short-ones' },
  { name: 'game', path: '/game/bloodborne' },
  { name: 'trophies', path: '/trophies' },
] as const

/** The library in each of its views, for checks that should see all three. */
export const libraryViews = [
  { name: 'library-wall', path: '/library?view=wall' },
  { name: 'library-list', path: '/library?view=list' },
  { name: 'library-by-status', path: '/library?group=status' },
] as const

/**
 * Opens the library and waits until the whole of it has arrived: the page
 * comes with its first boxes, and the rest follow as one file.
 */
export async function openLibrary(page: Page, address = '/en/library') {
  const file = page.waitForResponse((response) => response.url().includes('/library/snapshot/'))
  await page.goto(address)
  await file
  // The first boxes arrive in a stagger, and the totals settle. Both are over
  // when the page stops marking its boxes as arriving.
  await page.locator('[data-enter]').first().waitFor({ state: 'detached', timeout: 10_000 })
  await shelfSettled(page)
}

/**
 * Where the page draws the shelf in 3D, waits until the 3D shelf has taken
 * over, or until it has said why it could not. Returns which happened.
 */
export async function shelfSettled(page: Page): Promise<'2d' | '3d' | 'fallback'> {
  // The pair of buttons shows what the page is drawing, or about to draw.
  const threeD = page
    .getByRole('radiogroup', { name: 'Shelf in 2D or 3D' })
    .getByRole('radio', { name: '3D' })
  if ((await threeD.count()) === 0 || (await threeD.getAttribute('aria-checked')) !== 'true') {
    return '2d'
  }
  const live = page.locator('[data-shelf-phase="3d"]')
  const gaveWay = page.getByRole('status').filter({ hasText: /so the shelf is in 2D/ })
  await expect(live.or(gaveWay)).toBeVisible({ timeout: 30_000 })
  return (await live.count()) > 0 ? '3d' : 'fallback'
}

/**
 * Links prefetch the pages they point to. When a test leaves a page while one
 * of those requests is still in flight, WebKit reports the abandoned request
 * as an error, in these words. Nothing is wrong, so it is not counted.
 */
const cutShortByLeaving = /due to access control checks/

/**
 * The owner's account while the test doubles answer: `MOCK_OWNER` in
 * `src/server/mocks/start.ts`. Made-up values, never a real password.
 */
export const OWNER = {
  email: 'owner@shelf.test',
  password: 'test-doubles-only-owner-password',
} as const

/** Fills in the sign-in form and sends it. */
export async function fillSignIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/**
 * Signs in as the owner, through the real sign-in page and code. Starts from
 * the sign-in page and leaves the page where sign-in sent it.
 */
export async function signIn(page: Page, from?: string) {
  await page.goto(from ? `/en/sign-in?from=${encodeURIComponent(from)}` : '/en/sign-in')
  await page.locator('html[data-ready]').waitFor({ state: 'attached' })
  await fillSignIn(page, OWNER.email, OWNER.password)
  await page.waitForURL((url) => !url.pathname.startsWith('/en/sign-in'))
}

type Fixtures = {
  /**
   * Signed in as the owner from the start: the session saved once per
   * worker is loaded into the browser before the page opens.
   */
  signedIn: boolean
  /**
   * The shelf's 2D or 3D choice, stored before the page loads. 2D unless a
   * test asks for 3D, so the tests written for 2D read 2D on every project;
   * `device` stores nothing and leaves it to the device's default.
   */
  dimension: '2d' | '3d' | 'device'
  /**
   * Set to true for a test that makes the browser log an error on purpose,
   * for example by opening an address that answers 404.
   */
  allowConsoleErrors: boolean
  /** Fails the test if the page logs an error or throws. On for every test. */
  cleanConsole: void
  /** The project's size: phone, tablet or desktop. */
  size: 'phone' | 'tablet' | 'desktop'
}

/**
 * The owner's session for this worker, made by signing in the first time a
 * test asks for it. A worker is a process of its own and runs one project's
 * tests, so this is one sign-in per worker, and none where no test asks.
 */
let ownerSession: Promise<string> | undefined

const saveOwnerSession = async (browser: Browser, info: TestInfo): Promise<string> => {
  const folder = join(tmpdir(), 'shelf-e2e')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, `owner-${info.project.name}-${info.workerIndex}.json`)
  const context = await browser.newContext({ baseURL: info.project.use.baseURL })
  const page = await context.newPage()
  await signIn(page)
  await expect(page.locator('footer')).toContainText('Signed in as')
  await context.storageState({ path: file })
  await context.close()
  return file
}

export const test = base.extend<Fixtures>({
  signedIn: [false, { option: true }],
  storageState: async ({ signedIn, storageState, browser }, use, testInfo) => {
    if (!signedIn) return use(storageState)
    ownerSession ??= saveOwnerSession(browser, testInfo)
    await use(await ownerSession)
  },

  /**
   * After opening an address, wait until the page is live (React has taken
   * over and set `data-ready`). A click that lands before that does nothing,
   * which on a slow machine looks like a broken control. A test that asks for
   * an earlier moment with `waitUntil` is left alone: it is testing the page
   * before it is live.
   */
  page: async ({ page, dimension }, use) => {
    if (dimension !== 'device') {
      await page.addInitScript((value) => {
        window.localStorage.setItem('shelf:dimension', value)
      }, dimension)
    }
    // No test depends on IGDB's image servers, and the repository holds no
    // cover art: every cover is answered with a flat color made from its id.
    await page.route('https://images.igdb.com/**', (route) => {
      const id = route.request().url().split('/').pop() ?? ''
      let hash = 0
      for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360
      return route.fulfill({
        contentType: 'image/svg+xml',
        // As IGDB answers: a cover may be drawn into a canvas, and the 3D shelf makes textures of them.
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="264" height="352"><rect width="264" height="352" fill="hsl(${hash} 55% 38%)"/><rect width="264" height="120" fill="hsl(${(hash + 40) % 360} 60% 55%)"/></svg>`,
      })
    })

    const goto = page.goto.bind(page)
    page.goto = async (address, options) => {
      const response = await goto(address, options)
      if (!options?.waitUntil) {
        await page.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 15_000 })
      }
      return response
    }
    await use(page)
  },

  dimension: ['2d', { option: true }],
  allowConsoleErrors: [false, { option: true }],
  cleanConsole: [
    async ({ page, allowConsoleErrors }, use) => {
      const problems: string[] = []
      const note = (problem: string) => {
        if (!cutShortByLeaving.test(problem)) problems.push(problem)
      }
      page.on('console', (message) => {
        if (message.type() === 'error') note(`console: ${message.text()}`)
      })
      page.on('pageerror', (error) => note(`uncaught: ${error.message}`))
      await use()
      if (!allowConsoleErrors) expect(problems, 'the page should log no errors').toEqual([])
    },
    { auto: true },
  ],
  size: async ({}, use, testInfo) => {
    await use(testInfo.project.metadata.size)
  },
})

export { expect }

/** Opens a page with a theme chosen as a returning visitor would have it. */
export async function openWithTheme(page: Page, address: string, theme: Theme) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('shelf:theme', value)
  }, theme)
  await page.goto(address)
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

/**
 * Runs axe against WCAG 2.2 A and AA and expects nothing.
 * Pass a selector to check one part of the page, for example an open menu.
 */
export async function expectAccessible(page: Page, only?: string) {
  // A group of buttons that shares one keyboard stop (Radix's roving focus) is sent with no
  // stop at all, and takes one a render after it comes alive. Judge it once it has.
  await expect(page.locator('[role="radiogroup"][tabindex="-1"]')).toHaveCount(0, {
    timeout: 15_000,
  })
  // Judge the page at rest. A color caught half-way through a fade is not a
  // color anyone is asked to read.
  // Animations that never end (a pulsing light) or that follow the scroll
  // position are part of the page at rest, so they are not waited for.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline instanceof DocumentTimeline &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    ),
  )

  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ])
  const results = await (only ? builder.include(only) : builder).analyze()
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
  )
  expect(summary).toEqual([])
}

/** How far the page can scroll sideways. It should be zero. */
export function sidewaysOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}
