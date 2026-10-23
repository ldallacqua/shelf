import { expect, openLibrary, test } from './fixtures'

/** A title as a pattern that matches it exactly. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Scrubbing a compact shelf on a phone (spec 3.4): press on the ledge, wait
 * a moment, slide, and lift to open the spine under the finger. Playwright
 * cannot slide a finger itself, so Chromium's own touch input does it.
 */
test.describe('scrubbing a compact shelf', () => {
  test.skip(
    ({ browserName, size }) => browserName !== 'chromium' || size !== 'phone',
    'touches are sent through Chromium, on a phone',
  )

  test('opens the spine the finger lifts from, showing each title on the way', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('shelf:density', 'compact'))
    await openLibrary(page)
    const shelf = page.locator('.shelf-panel').first()
    const boxes = shelf.locator('.game-box')
    await expect(boxes.nth(2)).toBeVisible()
    const first = (await boxes.nth(0).boundingBox())!
    const third = (await boxes.nth(2).boundingBox())!
    const y = first.y + first.height / 2
    const touch = await page.context().newCDPSession(page)
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
      touch.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y }],
      })

    await send('touchStart', first.x + first.width / 2)
    await page.waitForTimeout(400)
    const title = shelf.locator('.scrub-title')
    await expect(title).toBeVisible()
    for (let step = 1; step <= 5; step += 1) {
      await send('touchMove', first.x + first.width / 2 + ((third.x - first.x) * step) / 5)
    }
    // The third spine's title, as its name begins.
    const chosen = (await title.textContent())!
    expect(await boxes.nth(2).getAttribute('aria-label')).toMatch(new RegExp(`^${escape(chosen)}`))
    await send('touchEnd')

    await expect(title).toBeHidden()
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(chosen)
  })
})
