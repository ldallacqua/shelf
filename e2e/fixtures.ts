import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Page } from '@playwright/test'

export const locales = ['en', 'pt-BR'] as const
export const themes = ['light', 'dark'] as const
export type Locale = (typeof locales)[number]
export type Theme = (typeof themes)[number]

/** Every page that exists, by its address after the language. */
export const pages = [
  { name: 'home', path: '' },
  { name: 'library', path: '/library' },
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
}

/**
 * Links prefetch the pages they point to. When a test leaves a page while one
 * of those requests is still in flight, WebKit reports the abandoned request
 * as an error, in these words. Nothing is wrong, so it is not counted.
 */
const cutShortByLeaving = /due to access control checks/

type Fixtures = {
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

export const test = base.extend<Fixtures>({
  /**
   * After opening an address, wait until the page is live (React has taken
   * over and set `data-ready`). A click that lands before that does nothing,
   * which on a slow machine looks like a broken control. A test that asks for
   * an earlier moment with `waitUntil` is left alone: it is testing the page
   * before it is live.
   */
  page: async ({ page }, use) => {
    // No test depends on IGDB's image servers, and the repository holds no
    // cover art: every cover is answered with a flat color made from its id.
    await page.route('https://images.igdb.com/**', (route) => {
      const id = route.request().url().split('/').pop() ?? ''
      let hash = 0
      for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360
      return route.fulfill({
        contentType: 'image/svg+xml',
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
