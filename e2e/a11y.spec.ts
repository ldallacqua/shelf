import {
  expectAccessible,
  fillUntil,
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
    await openWithTheme(page, '/en/u/sample', theme)
    await page.getByRole('radio', { name: 'Compact' }).click()
    await expectAccessible(page)
  })

  test(`a game's details pass axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/u/sample', theme)
    await page.getByRole('button', { name: /^Astro Bot/ }).click()
    await page.getByRole('dialog').waitFor()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`the filter panel passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/u/sample?q=genre%3Arpg+-theme%3Ahorror', theme)
    await page.getByRole('button', { name: /^Filters/ }).click()
    const panel = page.getByRole('dialog', { name: 'Filters', exact: true })
    await panel.waitFor()
    // A long list, with its search box and a value that matches nothing.
    await panel.locator('details[data-filter="owned"] summary').click()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`sign-up passes axe with a handle that cannot be, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/sign-up', theme)
    await fillUntil(
      page.getByRole('textbox', { name: 'Handle' }),
      'library',
      page.getByText('That one is kept for the site. Try another.'),
    )
    await expectAccessible(page)
  })

  test.describe('signed in', () => {
    test.use({ signedIn: true })

    test(`the account menu passes axe while open, ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/u/sample', theme)
      await page.getByRole('button', { name: 'Sample, your account' }).click()
      await page.getByRole('menu').waitFor()
      await expectAccessible(page, '[role="menu"]')
    })

    test(`the account page passes axe, ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/account', theme)
      await page.getByRole('heading', { name: 'Your shelf' }).waitFor()
      await expectAccessible(page)
    })

    test(`saving a shelf passes axe, ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/u/sample?q=genre%3Arpg', theme)
      await page.getByRole('button', { name: 'Save as a shelf' }).click()
      await page.getByRole('dialog', { name: 'Save as a shelf' }).waitFor()
      await expectAccessible(page, '[role="dialog"]')
    })

    // Nothing below is added or saved: each stops before the button that would.
    test(`adding a game passes axe, and its calendar while open, ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/u/sample', theme)
      await page.getByRole('banner').getByRole('button', { name: 'Add', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Add a game' })
      await sheet.getByRole('combobox', { name: 'Search IGDB' }).fill('Half-Life')
      await sheet.getByRole('option').filter({ hasNotText: 'In library' }).first().click()
      await sheet.getByText('Completed', { exact: true }).click()
      await expectAccessible(page, '[role="dialog"]')

      await sheet.getByRole('button', { name: /^Completed on/ }).click()
      await page.locator('[data-slot="calendar"]').waitFor()
      await expectAccessible(page, '[data-slot="popover-content"]')
    })

    test(`a pasted list's review passes axe, and a select while open, ${theme}`, async ({
      page,
    }) => {
      await openWithTheme(page, '/en/u/sample', theme)
      await page.getByRole('banner').getByRole('button', { name: 'Add', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Add a game' })
      await sheet.getByRole('tab', { name: 'Paste a list' }).click()
      await sheet
        .getByRole('textbox', { name: 'Titles, one per line' })
        .fill(['Half-Life', 'Stick of Truth', 'Zzqx Nothing Like It'].join('\n'))
      await sheet.getByRole('button', { name: 'Match 3 titles' }).click()
      await sheet.getByText(/^3 lines:/).waitFor({ timeout: 20_000 })
      await expectAccessible(page, '[role="dialog"]')

      await sheet
        .getByRole('combobox', { name: /^Match for/ })
        .first()
        .click()
      await page.getByRole('listbox').waitFor()
      await expectAccessible(page, '[role="listbox"]')
    })

    test(`editing a game passes axe, ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/u/sample/game/bloodborne', theme)
      const mine = page.locator('section[aria-busy]')
      await mine.getByRole('slider', { name: 'My rating' }).waitFor()
      await expectAccessible(page, 'section[aria-busy]')
    })
  })

  test(`the sort menu passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/u/sample', theme)
    await page.getByRole('button', { name: /^Sort/ }).click()
    await page.getByRole('menu').waitFor()
    await expectAccessible(page, '[role="menu"]')
  })

  test(`the keyboard shortcuts pass axe while open, ${theme}`, async ({ page, size }) => {
    test.skip(size === 'phone', 'a phone has no keyboard')
    await openWithTheme(page, '/en/u/sample', theme)
    // The library streams in after the page is live; its keys come with it.
    await page.locator('.game-box').first().waitFor()
    // WebKit sends keys to the page only once it has been clicked.
    await page.getByRole('heading', { level: 1 }).click()
    await page.keyboard.press('?')
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    await expectAccessible(page, '[role="dialog"]')
  })

  test(`the grouping menu passes axe while open, ${theme}`, async ({ page }) => {
    await openWithTheme(page, '/en/u/sample', theme)
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
