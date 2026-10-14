import { expect, pages, test } from './fixtures'

test.describe('language of the first visit', () => {
  test('an English browser lands on /en', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test.describe('with a Portuguese browser', () => {
    test.use({ locale: 'pt-BR' })

    test('lands on /pt-BR', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL(/\/pt-BR$/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fundamentos')
    })
  })

  test.describe('with any other language', () => {
    test.use({ locale: 'ja-JP' })

    test('lands on /en', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL(/\/en$/)
    })
  })

  test('an address without a language gets one', async ({ page }) => {
    await page.goto('/library')
    await expect(page).toHaveURL(/\/en\/library$/)
  })
})

test.describe('header and footer', () => {
  test('the main links go to their pages and mark where you are @smoke', async ({ page, size }) => {
    await page.goto('/en')

    if (size === 'phone') {
      await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('menuitem', { name: 'Library' }).click()
    } else {
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Library' })
        .click()
    }
    await expect(page).toHaveURL(/\/en\/library$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library')
    await expect(page).toHaveTitle('Library · Shelf')

    if (size === 'phone') {
      await page.getByRole('button', { name: 'Menu' }).click()
      await expect(page.getByRole('menuitem', { name: 'Library' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await page.getByRole('menuitem', { name: 'Trophies' }).click()
    } else {
      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await nav.getByRole('link', { name: 'Trophies' }).click()
    }
    await expect(page).toHaveURL(/\/en\/trophies$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trophies')

    await page.getByRole('link', { name: 'Shelf, home' }).click()
    await expect(page).toHaveURL(/\/en$/)
  })

  test('the footer credits IGDB on every page', async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(`/en${path}`)
      await expect(page.getByRole('contentinfo')).toContainText('IGDB.com')
    }
  })

  test('the first Tab stop skips to the content', async ({ page, browserName }) => {
    // Safari only tabs to links when the user has turned that on in its settings.
    test.skip(browserName === 'webkit', 'WebKit does not Tab to links by default')
    await page.goto('/en')

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()

    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
  })
})

test.describe('empty states', () => {
  // The library's own empty state needs an empty library, which these tests
  // do not have: it is covered by a component test instead.
  test('the trophy wall says nothing is finished yet', async ({ page }) => {
    await page.goto('/en/trophies')
    await expect(page.getByText('Nothing finished yet.')).toBeVisible()
  })
})

test.describe('a page that does not exist', () => {
  // The browser itself logs the 404 as a failed resource; that is the point of these tests.
  test.use({ allowConsoleErrors: true })

  test("answers 404 in the visitor's language, with a way back @smoke", async ({ page }) => {
    const response = await page.goto('/pt-BR/nao-existe')
    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Esta página não está na estante.',
    )

    await page.getByRole('link', { name: 'Ir para a biblioteca' }).click()
    await expect(page).toHaveURL(/\/pt-BR\/library$/)
  })

  test('an unknown language is treated as a page under English', async ({ page }) => {
    const response = await page.goto('/xx/library')
    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(/\/en\/xx\/library$/)
  })

  test('the 404 page is complete before any JavaScript has run', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' })
    const page = await context.newPage()

    const response = await page.goto('/en/not-a-page')

    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This page is not on the shelf.',
    )
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await context.close()
  })

  test('the page that draws "not found" answers 404 when opened directly', async ({ page }) => {
    const response = await page.goto('/en/missing')
    expect(response?.status()).toBe(404)
  })

  test('a real page answers 200', async ({ request }) => {
    for (const address of ['/en', '/en/library', '/pt-BR/trophies']) {
      const response = await request.get(address)
      expect(response.status(), address).toBe(200)
    }
  })

  test('a trailing slash leads to the same page', async ({ page }) => {
    await page.goto('/en/library/')
    await expect(page).toHaveURL(/\/en\/library$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library')
  })
})
