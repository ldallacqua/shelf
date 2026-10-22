import { expect, SHELF, test } from './fixtures'

/** The trophy wall (spec 3.9), on the sample shelf, which has games finished in several years. */
test.describe('the trophy wall', () => {
  test('stands every finished game under the year it was finished, newest first @smoke', async ({
    page,
  }) => {
    await page.goto(`/en${SHELF}/trophies`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trophies')

    // The wall streams in behind its skeleton on a shelf's first visit.
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    const years = await page.getByRole('heading', { level: 2 }).allTextContents()
    const numbers = years.map((year) => Number(year.slice(0, 4)))
    expect(numbers.length).toBeGreaterThan(1)
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a))

    // As many trophies as the stats say were finished.
    const stats = page.getByRole('group', { name: 'Trophy stats' })
    const finished = stats.getByText('Finished', { exact: true }).locator('xpath=..')
    const trophies = await page.locator('main li.trophy').count()
    await expect(finished).toHaveText(new RegExp(`${trophies}$`))
  })

  test('a trophy leads to its game', async ({ page }) => {
    await page.goto(`/en${SHELF}/trophies`)
    const first = page.locator('main li.trophy').first().getByRole('link')
    const title = await first.getAttribute('href')
    await first.click()
    await expect(page).toHaveURL(new RegExp(`${title}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('is offered to search engines, named for its shelf', async ({ page, request }) => {
    await page.goto(`/en${SHELF}/trophies`)
    await expect(page).toHaveTitle("Sample's trophies · Shelf")
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /games Sample finished/,
    )
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain(`/en${SHELF}/trophies<`)
  })

  test('reads in Portuguese', async ({ page }) => {
    await page.goto(`/pt-BR${SHELF}/trophies`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Troféus')
    await expect(page.getByRole('group', { name: 'Números dos troféus' })).toContainText('Zerados')
  })
})
