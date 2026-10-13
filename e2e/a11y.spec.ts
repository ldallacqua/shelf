import { expectAccessible, locales, openWithTheme, pages, test, themes } from './fixtures'

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
