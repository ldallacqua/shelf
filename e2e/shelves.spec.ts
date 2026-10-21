import type { Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'

/**
 * Smart shelves (spec 5.5): a filter, a sort and a grouping kept under a
 * name, at an address of their own. Everyone sees the same shelves; only
 * the owner saves them, signed in through GitHub's test doubles.
 */

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search the library' })
const totals = (page: Page) => page.getByRole('group', { name: 'Library totals' })
const SHORT_ONES = 'status:backlog length:<10'

test.describe('a smart shelf', () => {
  test('opens from the Shelves menu with its filter, sort and grouping @smoke', async ({
    page,
  }) => {
    await openLibrary(page)
    await page.getByRole('button', { name: 'Shelves' }).click()
    await page.getByRole('menuitem', { name: 'Short ones' }).click()

    await expect(page).toHaveURL(/\/en\/shelves\/short-ones$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Short ones')
    await expect(search(page)).toHaveValue(SHORT_ONES)
    await expect(totals(page)).toContainText('18 games')
    await expect(page.getByRole('button', { name: /^Sort/ })).toContainText('Time to beat')
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('All games')
    // A shelf is part of the library.
    if ((await page.getByRole('navigation', { name: 'Main' }).count()) > 0) {
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }),
      ).toHaveAttribute('aria-current', 'page')
    }
  })

  test('arrives with its games already in the page', async ({ page }) => {
    const html = await (await page.request.get('/en/shelves/short-ones')).text()
    expect(html).toContain('Short ones')
    expect(html).toContain('All games')
  })

  test('changed on screen, it says so, and goes back to how it was saved', async ({ page }) => {
    await openLibrary(page, '/en/shelves/short-ones')
    await expect(page.getByText('Changed', { exact: true })).toHaveCount(0)

    await page
      .getByRole('radiogroup', { name: 'Status' })
      .getByRole('radio', { name: /^Completed/ })
      .click()
    await expect(search(page)).toHaveValue('status:completed length:<10')
    await expect(page.getByText('Changed', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Back to the saved shelf' }).click()
    await expect(page).toHaveURL(/\/en\/shelves\/short-ones$/)
    await expect(search(page)).toHaveValue(SHORT_ONES)
    await expect(page.getByText('Changed', { exact: true })).toHaveCount(0)
  })

  test('an address with no shelf behind it says so', async ({ page }) => {
    await page.goto('/en/shelves/not-a-shelf')
    await expect(
      page.getByRole('main').getByText('There is no shelf at this address.'),
    ).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await page.getByRole('main').getByRole('link', { name: 'Library' }).click()
    await expect(page).toHaveURL(/\/en\/library$/)
  })

  test('is translated, and keeps its address in either language', async ({ page }) => {
    await openLibrary(page, '/pt-BR/shelves/short-ones')
    await expect(page.getByRole('group', { name: 'Totais da biblioteca' })).toContainText(
      '18 jogos',
    )
    await page.getByRole('link', { name: 'EN: English' }).click()
    await expect(page).toHaveURL(/\/en\/shelves\/short-ones$/)
  })

  test('a visitor is offered no way to save or change one', async ({ page }) => {
    await openLibrary(page, '/en/shelves/short-ones?sort=title')
    await expect(page.getByText('Changed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Save|Edit shelf)/ })).toHaveCount(0)
  })
})

test.describe('saving a shelf, as the owner', () => {
  test.use({ signedIn: true })

  test('what is on screen is saved under a name, at an address of its own, and removed again', async ({
    page,
  }, testInfo) => {
    // A name of its own per project: the projects run at once, against one database.
    const name = `Test ${testInfo.project.name} ${Date.now().toString(36)}`
    await openLibrary(page, '/en/library?q=genre%3Arpg&sort=-rating&group=none')
    await page.getByRole('button', { name: 'Save as a shelf' }).click()
    const sheet = page.getByRole('dialog', { name: 'Save as a shelf' })
    await sheet.getByLabel('Name').fill(name)
    await sheet.getByRole('button', { name: 'Save as new' }).click()

    await page.waitForURL(/\/en\/shelves\/[a-z0-9-]+$/)
    const slug = new URL(page.url()).pathname.split('/').pop()!
    try {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
      await expect(search(page)).toHaveValue('genre:rpg')
      await expect(page.getByRole('button', { name: /^Sort/ })).toContainText('My rating')
      await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('All games')

      const saved = await page.request.get(`/api/v1/shelves/${slug}`)
      expect(saved.status()).toBe(200)
      expect(await saved.json()).toMatchObject({
        slug,
        name,
        query: 'genre:rpg',
        sort: '-rating',
        group: 'none',
      })

      await page.getByRole('button', { name: 'Shelves' }).click()
      await expect(page.getByRole('menuitem', { name })).toHaveAttribute('aria-current', 'page')
      await page.keyboard.press('Escape')
    } finally {
      await page.goto(`/en/shelves/${slug}`)
      await page.getByRole('button', { name: 'Edit shelf' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Remove this shelf' }).click()
      await expect(page).toHaveURL(/\/en\/library$/)
    }
    expect((await page.request.get(`/api/v1/shelves/${slug}`)).status()).toBe(404)
  })
})
