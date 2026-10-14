import {
  expectAccessible,
  libraryViews,
  locales,
  openWithTheme,
  pages,
  test,
  themes,
} from './fixtures'

/**
 * Automated accessibility checks (axe, WCAG 2.2 A and AA) on every page, in
 * both themes and both languages, and on every menu while it is open.
 */
for (const { name, path } of pages) {
  for (const theme of themes) {
    for (const locale of locales) {
      test(`${name} passes axe in ${theme}, ${locale} @smoke`, async ({ page }) => {
        await openWithTheme(page, `/${locale}${path}`, theme)
        await expectAccessible(page)
      })
    }
  }
}

for (const { name, path } of libraryViews) {
  for (const theme of themes) {
    test(`${name} passes axe in ${theme}`, async ({ page }) => {
      await openWithTheme(page, `/en${path}`, theme)
      await expectAccessible(page)
    })
  }
}

for (const theme of themes) {
  test(`the compact shelf passes axe in ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/library', theme)
    await page.getByRole('radio', { name: 'Compact' }).click()
    await expectAccessible(page)
  })

  test(`a game's details pass axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/library', theme)
    await page.getByRole('button', { name: /^Astro Bot/ }).click()
    await page.getByRole('dialog').waitFor()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`the filter panel passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/library?q=genre%3Arpg+-theme%3Ahorror', theme)
    await page.getByRole('button', { name: /^Filters/ }).click()
    const panel = page.getByRole('dialog', { name: 'Filters', exact: true })
    await panel.waitFor()
    // A long list, with its search box and a value that matches nothing.
    await panel.locator('details[data-filter="owned"] summary').click()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`saving a shelf passes axe, ${theme}`, async ({ page, context, baseURL }) => {
    // The owner, as the test doubles know them.
    await context.addCookies([{ name: 'shelf-test-owner', value: '1', url: baseURL! }])
    await openWithTheme(page, '/en/library?q=genre%3Arpg', theme)
    await page.getByRole('button', { name: 'Save as a shelf' }).click()
    await page.getByRole('dialog', { name: 'Save as a shelf' }).waitFor()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`the sort menu passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/library', theme)
    await page.getByRole('button', { name: /^Sort/ }).click()
    await page.getByRole('menu').waitFor()
    await expectAccessible(page, '[role="menu"]')
  })

  test(`the keyboard shortcuts pass axe while open, ${theme}`, async ({ page, size }) => {
    test.skip(size === 'phone', 'a phone has no keyboard')
    await openWithTheme(page, '/en/library', theme)
    // The library streams in after the page is live; its keys come with it.
    await page.locator('.game-box').first().waitFor()
    // WebKit sends keys to the page only once it has been clicked.
    await page.getByRole('heading', { level: 1 }).click()
    await page.keyboard.press('?')
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`the grouping menu passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/library', theme)
    await page.getByRole('button', { name: /Platform/ }).click()
    await page.getByRole('menu').waitFor()
    await expectAccessible(page, '[role="menu"]')
  })
}

for (const theme of themes) {
  test(`the theme menu passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en', theme)
    await page.getByRole('button', { name: 'Theme' }).click()
    await page.getByRole('menu').waitFor()
    // The page behind the menu is checked above; here, the menu itself.
    await expectAccessible(page, '[role="menu"]')
  })

  test(`the phone menu passes axe while open, ${theme}`, async ({ page, size }) => {
    test.skip(size !== 'phone', 'the menu button exists only at phone width')
    await openWithTheme(page, '/en', theme)
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('menu').waitFor()
    await expectAccessible(page, '[role="menu"]')
  })
}

test.describe('the page that is not found', () => {
  test.use({ allowConsoleErrors: true })

  for (const theme of themes) {
    test(`passes axe in ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/not-a-page', theme)
      await expectAccessible(page)
    })
  }
})
