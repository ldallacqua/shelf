import { expect, test } from './fixtures'

test.describe('switching language', () => {
  test('keeps the page and switches every label @smoke', async ({ page }) => {
    await page.goto('/en/u/sample')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Sample's shelf")

    await page.getByRole('link', { name: 'PT: Português (Brasil)' }).click()

    await expect(page).toHaveURL(/\/pt-BR\/u\/sample$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Estante de Sample')
    await expect(page).toHaveTitle('Estante de Sample · Shelf')

    await page.getByRole('link', { name: 'EN: English' }).click()
    await expect(page).toHaveURL(/\/en\/u\/sample$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('keeps the filters in the address', async ({ page }) => {
    await page.goto('/en/u/sample?q=status%3Abacklog+genre%3Arpg&sort=-rating')

    const link = page.getByRole('link', { name: 'PT: Português (Brasil)' })
    await expect(link).toHaveAttribute('href', /\/pt-BR\/u\/sample\?.*sort=-rating/)
    await link.click()

    await expect(page).toHaveURL(/\/pt-BR\/u\/sample\?/)
    const address = new URL(page.url())
    expect(address.searchParams.get('q')).toBe('status:backlog genre:rpg')
    expect(address.searchParams.get('sort')).toBe('-rating')
  })

  test('keeps the scroll position', async ({ page }) => {
    await page.goto('/en')
    await page.getByRole('heading', { name: 'Motion' }).scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => window.scrollY)
    expect(before).toBeGreaterThan(200)

    await page.getByRole('link', { name: 'PT: Português (Brasil)' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')

    const after = await page.evaluate(() => window.scrollY)
    // Translated text wraps differently, so the position may shift a little, never back to the top.
    expect(after).toBeGreaterThan(before / 2)
  })

  test('is remembered on the next visit', async ({ page }) => {
    await page.goto('/en')
    await page.getByRole('link', { name: 'PT: Português (Brasil)' }).click()
    await expect(page).toHaveURL(/\/pt-BR$/)

    // An English browser comes back to the bare address: the earlier choice wins.
    await page.goto('/')
    await expect(page).toHaveURL(/\/pt-BR$/)
  })

  test('the link works before any JavaScript has run', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/en/u/sample/trophies')

    await page.getByRole('link', { name: 'PT: Português (Brasil)' }).click()

    await expect(page).toHaveURL(/\/pt-BR\/u\/sample\/trophies$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Troféus')
    await context.close()
  })
})

test.describe('language marks for screen readers', () => {
  test('the page declares its language, and the switch declares the other', async ({ page }) => {
    await page.goto('/pt-BR')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')

    const link = page.getByRole('link', { name: 'EN: English' })
    await expect(link).toHaveAttribute('lang', 'en')
    await expect(link).toHaveAttribute('hreflang', 'en')
  })
})
