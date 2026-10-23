import type { Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'

/**
 * Folding a shelf away (spec 3.7), in each view, remembered on this device.
 * A phone shows one shelf at a time, so nothing folds there.
 */
test.describe('folding a shelf away', () => {
  test.skip(({ size }) => size === 'phone', 'a phone shows one shelf at a time')

  /** The first shelf with its fold button, by its name as its heading shows it. */
  const firstShelf = async (page: Page) => {
    const section = page.locator('section[data-shelf]').first()
    const name = (await section.getByRole('heading', { level: 2 }).textContent())!.trim()
    return { section, name }
  }

  for (const view of ['shelf', 'wall', 'list'] as const) {
    test(`folds its games away in the ${view} view, and is remembered`, async ({ page }) => {
      await openLibrary(page, `/en/u/sample?view=${view}`)
      const { section, name } = await firstShelf(page)
      const games = section.locator('[data-shelf-body]')
      await expect(games).toBeVisible()

      await section.getByRole('button', { name: `Fold the ${name} shelf away` }).click()
      await expect(games).toBeHidden()
      // The count stays beside the name.
      await expect(section.locator('header')).toContainText(/\d+ games?/)

      await page.reload()
      await expect(page.locator(`section[data-shelf] [data-shelf-body]`).first()).toBeHidden()
      await page
        .locator('section[data-shelf]')
        .first()
        .getByRole('button', { name: `Show the ${name} shelf` })
        .click()
      await expect(page.locator('section[data-shelf] [data-shelf-body]').first()).toBeVisible()
    })
  }

  test.describe('before the page has run any script', () => {
    // The page's scripts are refused on purpose, and the browser logs each one.
    test.use({ allowConsoleErrors: true })

    test('a folded shelf is already hidden', async ({ page }) => {
      await openLibrary(page)
      const { section, name } = await firstShelf(page)
      await section.getByRole('button', { name: `Fold the ${name} shelf away` }).click()

      // The head script hides it at once; the page's own script would come later.
      await page.route('**/_next/static/chunks/**', (route) => route.abort())
      await page.reload()
      await expect(page.locator('section[data-shelf] [data-shelf-body]').first()).toBeHidden()
    })
  })
})
