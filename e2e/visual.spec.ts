import { expect, locales, openWithTheme, pages, test, themes } from './fixtures'

/**
 * Reference screenshots: every page, in both themes and both languages, at
 * phone and desktop width.
 *
 * They are made on Linux in CI, because text renders differently on a Mac, so
 * this file is skipped anywhere else. To make new ones, run the "Reference
 * screenshots" job (see docs/testing.md) and commit the files it produces.
 */
test.describe('reference screenshots @visual', () => {
  test.skip(
    ({ browserName, size }) => browserName !== 'chromium' || size === 'tablet',
    'references are kept for Chromium at phone and desktop width',
  )
  test.skip(process.platform !== 'linux', 'references are made on Linux')

  for (const { name, path } of pages) {
    for (const theme of themes) {
      for (const locale of locales) {
        test(`${name}, ${theme}, ${locale}`, async ({ page }) => {
          await openWithTheme(page, `/${locale}${path}`, theme)
          await page.evaluate(() => document.fonts.ready)
          // The wall is fixed to the window, so the window is grown to the page:
          // a stitched full-page capture would repeat the wall's light.
          const width = page.viewportSize()?.width ?? 1440
          const height = await page.evaluate(() => document.documentElement.scrollHeight)
          await page.setViewportSize({ width, height })
          await expect(page).toHaveScreenshot(`${name}-${theme}-${locale}.png`)
        })
      }
    }
  }
})
