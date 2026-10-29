import { expect, SHELF, test } from './fixtures'

/** The trophy wall (spec 3.9), on the sample shelf, which has games finished in several years. */
test.describe('the trophy wall', () => {
  test('stands every finished game under the year it was finished, newest first @smoke', async ({
    page,
  }) => {
    await page.goto(`/en${SHELF}/trophies`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trophies')

    // The wall streams in behind its skeleton on a shelf's first visit.
    const headings = page.locator('main .trophy-year > h2')
    await expect(headings.first()).toBeVisible()
    const years = await headings.allTextContents()
    const numbers = years.map((year) => Number(year.slice(0, 4)))
    expect(numbers.length).toBeGreaterThan(1)
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a))

    // As many trophies as the stats say were finished.
    const stats = page.getByRole('group', { name: 'Trophy stats' })
    const finished = stats
      .getByText('Games finished', { exact: true })
      .locator('xpath=following-sibling::p[1]')
    const trophies = await page.locator('main li.trophy').count()
    await expect(finished).toHaveText(new RegExp(`${trophies}$`))
  })

  test('is of one year once a year is chosen, and of all of them again (issue 68)', async ({
    page,
  }) => {
    await page.goto(`/en${SHELF}/trophies`)
    const period = page.getByRole('list', { name: 'Period' })
    const year = period.getByRole('link').nth(1)
    const chosen = (await year.textContent())!.trim()
    await year.click()
    await expect(page).toHaveURL(new RegExp(`year=${chosen}`))
    await expect(page.getByText(`Finished in ${chosen}`, { exact: true })).toBeVisible()
    const headings = await page.locator('main .trophy-year > h2').allTextContents()
    expect(headings.map((heading) => heading.slice(0, 4))).toEqual([chosen])
    await period.getByRole('link', { name: 'All time' }).click()
    await expect(page.getByText('Games finished', { exact: true })).toBeVisible()
  })

  test('ranks what is finished as asked, and keeps it on the way to a year (issue 68)', async ({
    page,
  }) => {
    await page.goto(`/en${SHELF}/trophies`)
    const rankBy = page.getByRole('list', { name: 'Rank by' })
    await rankBy.getByRole('link', { name: 'Hours' }).click()
    await expect(page).toHaveURL(/by=hours/)
    await expect(rankBy.getByRole('link', { name: 'Hours' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await page.getByRole('list', { name: 'Period' }).getByRole('link').nth(1).click()
    await expect(page).toHaveURL(/year=\d{4}.*by=hours/)
    await expect(page.getByRole('region', { name: 'What is finished' })).toBeVisible()
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
    await expect(page.getByRole('group', { name: 'Números dos troféus' })).toContainText(
      'Jogos zerados',
    )
  })
})
