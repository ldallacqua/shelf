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
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))),
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
