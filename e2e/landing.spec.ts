import type { Page } from '@playwright/test'

import { expect, SHELF, test } from './fixtures'

/**
 * The landing page (spec 15): what Shelf is, told with an example shelf, and
 * the one call to action. Counts below are the example shelf's, written by
 * `pnpm landing:demo`.
 */

const askDemo = (page: Page) => page.locator('#how')

test.describe('the landing page', () => {
  test('its call to action leads to sign-up @smoke', async ({ page }) => {
    await page.goto('/en')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Every game you own, on one shelf.',
    )
    await page.getByRole('main').getByRole('link', { name: 'Create your shelf' }).first().click()
    await expect(page).toHaveURL(/\/en\/sign-up$/)
  })

  test('"See how it works" goes to the first part', async ({ page }) => {
    await page.goto('/en')
    await page.getByRole('link', { name: 'See how it works' }).click()
    await expect(page).toHaveURL(/#how$/)
    await expect(page.getByRole('heading', { name: 'Ask it anything.' })).toBeInViewport()
  })

  test.describe('signed in', () => {
    test.use({ signedIn: true })

    test('offers one’s own shelf instead', async ({ page }) => {
      await page.goto('/en')
      const toShelf = page.getByRole('main').getByRole('link', { name: 'Go to your shelf' })
      await expect(toShelf.first()).toHaveAttribute('href', `/en${SHELF}`)
      await expect(
        page.getByRole('main').getByRole('link', { name: 'Create your shelf' }),
      ).toHaveCount(0)
    })
  })

  test.describe('under reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('every part is there as a still, and nothing plays by itself', async ({ page }) => {
      await page.goto('/en')
      await page.locator('#assistant').scrollIntoViewIfNeeded()
      await expect(page.locator('[data-scene="waiting"]')).toHaveCount(0)
      await expect(page.getByText('3 games on your shelf fit:')).toBeVisible()
      await askDemo(page).scrollIntoViewIfNeeded()
      await expect(askDemo(page).getByText('All 61 games')).toBeVisible()
    })

    test('the filters narrow the example shelf, one by one or typed', async ({ page }) => {
      await page.goto('/en')
      const demo = askDemo(page)
      const boxes = demo.getByRole('list', { name: 'Games the filter finds' }).getByRole('listitem')
      await demo.getByRole('button', { name: 'Not started' }).click()
      await expect(demo.getByText('26 of 61 games')).toBeVisible()
      await demo.getByRole('button', { name: 'Under 10 hours' }).click()
      await expect(demo.getByText('6 of 61 games')).toBeVisible()
      await demo.getByRole('button', { name: 'On Switch' }).click()
      await expect(demo.getByText('3 of 61 games')).toBeVisible()
      await expect(boxes).toHaveCount(3)
      await expect(demo.getByRole('searchbox', { name: 'Filter the example shelf' })).toHaveValue(
        'status:backlog length:<10 owned:switch',
      )

      // Typed, in the real filter language.
      await demo.getByRole('searchbox', { name: 'Filter the example shelf' }).fill('rating:>=9')
      await expect(demo.getByText('18 of 61 games')).toBeVisible()
      await demo.getByRole('button', { name: 'genre:platform year:<2000' }).click()
      await expect(demo.getByText('4 of 61 games')).toBeVisible()
      await expect(boxes).toHaveCount(4)
      await demo.getByRole('button', { name: 'Clear the filter' }).click()
      await expect(demo.getByText('All 61 games')).toBeVisible()
    })
  })

  test('the filters play out by themselves as they come into view', async ({ page }) => {
    await page.goto('/en')
    await askDemo(page).scrollIntoViewIfNeeded()
    await expect(askDemo(page).getByText('3 of 61 games')).toBeVisible({ timeout: 15_000 })
    await expect(askDemo(page).getByRole('button', { name: 'On Switch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('is open to search engines, with the files that guide them', async ({ page, request }) => {
    await page.goto('/en')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)

    const robots = await request.get('/robots.txt')
    expect(await robots.text()).toMatch(/Disallow: \/api\/[\s\S]*Sitemap: .*\/sitemap\.xml/)
    const sitemap = await (await request.get('/sitemap.xml')).text()
    for (const listed of [
      '/en<',
      '/en/sign-up<',
      '/en/u/sample<',
      '/en/u/sample/game/bloodborne<',
    ]) {
      expect(sitemap, listed).toContain(listed)
    }
    expect(sitemap).toContain('hreflang="pt-BR"')
    const guide = await request.get('/llms.txt')
    expect(guide.headers()['content-type']).toContain('text/plain')
    expect(await guide.text()).toContain('## The filter language')
  })

  test('the design foundations are still there, unlisted', async ({ page }) => {
    const response = await page.goto('/en/foundations')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Foundations')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })
})
