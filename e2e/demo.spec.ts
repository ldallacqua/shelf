import type { Locator } from '@playwright/test'

import { expect, test } from './fixtures'

const led = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).getPropertyValue('--led').trim())

test.describe('the lit shelf', () => {
  test('takes the color of the case in focus, then returns to its own', async ({ page, size }) => {
    test.skip(size !== 'desktop', 'pointing needs a mouse')
    await page.goto('/en/foundations')
    const shelf = page.getByRole('img', { name: 'A backlit shelf of blank game cases, facing out' })
    const first = shelf.locator('[data-slot="game-case"]').first()

    await first.hover()
    await expect(first).toHaveAttribute('data-active', 'true')
    await expect.poll(() => led(shelf)).toBe('rgb(255, 122, 61)')

    await page.mouse.move(0, 0)
    await expect(first).not.toHaveAttribute('data-active', 'true')
    await expect.poll(() => led(shelf)).toBe('rgb(124, 92, 255)')
  })

  test('a touch does the same', async ({ page, size, browserName }) => {
    test.skip(size === 'desktop', 'touch is for phone and tablet')
    test.skip(browserName === 'firefox', 'Firefox in Playwright has no touch input to tap with')
    await page.goto('/en/foundations')
    const shelf = page.getByRole('img', { name: 'A backlit shelf of blank game cases, facing out' })
    const second = shelf.locator('[data-slot="game-case"]').nth(1)

    await second.tap()
    await expect(second).toHaveAttribute('data-active', 'true')
    await expect.poll(() => led(shelf)).toBe('rgb(34, 200, 238)')
  })

  test('the LED color can be chosen from the keyboard @smoke', async ({ page }) => {
    await page.goto('/en/foundations')
    const shelf = page.getByRole('img', {
      name: 'A shelf of blank game cases facing out, lit only by its LED bar',
    })

    // The page is live before every control on it is: in WebKit an arrow pressed in the
    // first few milliseconds was sometimes not handled. The group marks itself settled
    // once it has mounted, so the test waits for that, as no person could beat it.
    await page.locator('[data-slot="segmented"][data-settled]:has([aria-label="Violet"])').waitFor()
    await page.getByRole('radio', { name: 'Violet' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Orange' })).toBeFocused()
    await page.keyboard.press('Space')

    await expect(page.getByRole('radio', { name: 'Orange' })).toBeChecked()
    await expect.poll(() => led(shelf)).toBe('rgb(255, 122, 61)')
  })

  test('shows fewer cases on a phone, and its label counts what is showing', async ({
    page,
    size,
  }) => {
    await page.goto('/en/foundations')
    const shelf = page.getByRole('img', { name: 'A backlit shelf of blank game cases, facing out' })
    const showing = size === 'phone' ? 4 : 8

    await expect(shelf.locator('[data-slot="game-case"]:visible')).toHaveCount(showing)
    await expect(shelf.locator('[data-slot="shelf-label"]')).toContainText(String(showing))
  })
})

test.describe('motion', () => {
  test('the demo plays and resets', async ({ page }) => {
    await page.goto('/en/foundations')
    const marker = page.getByTestId('motion-marker-cinematic')
    const start = (await marker.boundingBox())?.x ?? 0

    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(async () => (await marker.boundingBox())?.x ?? 0).toBeGreaterThan(start + 50)

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect.poll(async () => (await marker.boundingBox())?.x ?? 0).toBe(start)
  })

  test.describe('under reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('says so, and the markers jump instead of gliding', async ({ page }) => {
      await page.goto('/en/foundations')
      await expect(page.getByText('Your device asks for reduced motion')).toBeVisible()

      const marker = page.getByTestId('motion-marker-cinematic')
      const duration = await marker.evaluate(
        (element) => getComputedStyle(element).transitionProperty,
      )
      expect(duration).not.toContain('transform')
    })
  })
})
