import { expect, libraryViews, locales, openWithTheme, pages, test, themes } from './fixtures'

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

  // The library's other views, once each per theme.
  for (const { name, path } of libraryViews) {
    for (const theme of themes) {
      test(`${name}, ${theme}`, async ({ page }) => {
        await openWithTheme(page, `/en${path}`, theme)
        await page.evaluate(() => document.fonts.ready)
        await page.addStyleTag({ content: 'html, [data-theme] { --grain: 0 !important; }' })
        await page.waitForTimeout(1200)
        await expect(page).toHaveScreenshot(`${name}-${theme}.png`)
      })
    }
  }

  for (const theme of themes) {
    test(`a game picked up from the shelf, ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/library', theme)
      await page.evaluate(() => document.fonts.ready)
      await page.addStyleTag({ content: 'html, [data-theme] { --grain: 0 !important; }' })
      await page.getByRole('button', { name: /^Astro Bot/ }).click()
      await page.getByRole('dialog').waitFor()
      await page.waitForTimeout(1200)
      await expect(page).toHaveScreenshot(`library-game-${theme}.png`)
    })
  }

  for (const { name, path } of pages) {
    for (const theme of themes) {
      for (const locale of locales) {
        test(`${name}, ${theme}, ${locale}`, async ({ page }) => {
          await openWithTheme(page, `/${locale}${path}`, theme)
          await page.evaluate(() => document.fonts.ready)
          // The wall's fine grain is noise by design. It makes each image three
          // times larger and tells a comparison nothing, so it is switched off.
          await page.addStyleTag({ content: 'html, [data-theme] { --grain: 0 !important; }' })
          if (name === 'library') {
            // The library is many screens long and draws only the rows near the
            // window, so it is captured as the window shows it. Its totals
            // settle into place over a moment; wait for that.
            await page
              .waitForResponse((response) => response.url().includes('/snapshot/'), {
                timeout: 5000,
              })
              .catch(() => undefined)
            await page.waitForTimeout(1200)
          } else {
            // The wall is fixed to the window, so the window is grown to the page:
            // a stitched full-page capture would repeat the wall's light.
            const width = page.viewportSize()?.width ?? 1440
            const height = await page.evaluate(() => document.documentElement.scrollHeight)
            await page.setViewportSize({ width, height })
          }
          await expect(page).toHaveScreenshot(`${name}-${theme}-${locale}.png`)
        })
      }
    }
  }
})
