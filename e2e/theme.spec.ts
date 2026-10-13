import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

const WALL = { light: 'rgb(236, 238, 242)', dark: 'rgb(11, 13, 18)' }

const wallColor = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

test.describe('theme on load', () => {
  // These tests hold back every script file, so that only the inline theme
  // script can run. The browser logs each blocked file as an error.
  test.describe("before any of the app's JavaScript has run", () => {
    test.use({ colorScheme: 'dark', allowConsoleErrors: true })

    test('a dark device gets the dark theme @smoke', async ({ page }) => {
      await page.route('**/*.js', (route) => route.abort())

      await page.goto('/en', { waitUntil: 'domcontentloaded' })

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'system')
      expect(await wallColor(page)).toBe(WALL.dark)
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0d12')
    })

    test('a stored choice of light wins over the dark device', async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem('shelf:theme', 'light'))
      await page.route('**/*.js', (route) => route.abort())

      await page.goto('/en', { waitUntil: 'domcontentloaded' })

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'light')
      expect(await wallColor(page)).toBe(WALL.light)
    })
  })

  test('a light device gets the light theme', async ({ page }) => {
    await page.goto('/en')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await wallColor(page)).toBe(WALL.light)
  })

  test.describe('on a dark device', () => {
    test.use({ colorScheme: 'dark' })

    test('the page hydrates without complaint', async ({ page }) => {
      await page.goto('/en')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.getByRole('button', { name: 'Theme' }).click()
      await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeChecked()
    })
  })
})

test.describe('changing theme', () => {
  test('the header switch applies a choice and remembers it @smoke', async ({ page }) => {
    await page.goto('/en')

    await page.getByRole('button', { name: 'Theme' }).click()
    await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeChecked()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect.poll(() => wallColor(page)).toBe(WALL.dark)

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Theme' }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
  })

  test('the choice carries to other pages and the other language', async ({ page }) => {
    await page.goto('/en')
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.goto('/pt-BR/library')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('"System" follows the device as it changes', async ({ page }) => {
    await page.goto('/en')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('a chosen theme does not follow the device', async ({ page }) => {
    await page.goto('/en')
    await page.getByRole('radio', { name: 'Light' }).click()

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('the change plays as a change of light, then settles', async ({ page }) => {
    await page.goto('/en')

    // Click, and in the same breath ask the browser what it has started to
    // animate. Watching for a half-way color instead would be a race against
    // an 800ms fade, and a slow machine loses that race.
    const animating = await page.getByRole('radio', { name: 'Dark' }).evaluate((radio) => {
      ;(radio as HTMLElement).click()
      void getComputedStyle(document.documentElement).backgroundColor
      return document
        .getAnimations()
        .map((animation) => (animation as CSSTransition).transitionProperty ?? '')
    })

    // The wall, the text and both lights are all on their way to the new state.
    expect(animating).toEqual(
      expect.arrayContaining(['--wall', '--text', '--ambient', '--led-strength']),
    )
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme-changing', 'to-dark')

    await expect(page.locator('html')).not.toHaveAttribute('data-theme-changing', /.+/)
    expect(await wallColor(page)).toBe(WALL.dark)
  })

  test.describe('under reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('the change is immediate', async ({ page }) => {
      await page.goto('/en')
      await page.getByRole('radio', { name: 'Dark' }).click()

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('html')).not.toHaveAttribute('data-theme-changing', /.+/)
      expect(await wallColor(page)).toBe(WALL.dark)
    })
  })
})
