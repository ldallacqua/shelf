import type { Locator, Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'

/**
 * A game's sheet on a phone (spec 3.4 and 12): it rises short, with the
 * cover, the title, the status and the platforms; a tap or a drag up shows
 * all of it, and a drag down takes it back, or away.
 */
test.describe('a game’s sheet on a phone', () => {
  test.skip(({ size }) => size !== 'phone', 'wider than a phone, a game opens in a side panel')

  const sheet = (page: Page) => page.getByRole('dialog')

  /** Where the sheet's top edge is, as a share of the window's height, once it has come to rest. */
  const topOf = async (page: Page) => {
    const box = sheet(page)
    await expect(box).not.toHaveAttribute('data-dragging')
    // Its position eases for a moment after a change.
    await page.waitForTimeout(400)
    const top = (await box.boundingBox())!.y
    return top / page.viewportSize()!.height
  }

  /** Drags with a pointer from the middle of `from`, by `by` pixels down (up when negative). */
  const drag = async (page: Page, from: Locator, by: number) => {
    const box = (await from.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let step = 1; step <= 6; step += 1) await page.mouse.move(x, y + (by * step) / 6)
    await page.mouse.up()
  }

  const open = async (page: Page) => {
    await openLibrary(page)
    await page.getByRole('button', { name: /^Astro Bot/ }).click()
    await expect(sheet(page)).toBeVisible()
  }

  test('rises short, with the game’s name, status and platforms in view, and its buttons', async ({
    page,
  }) => {
    await open(page)
    await expect(sheet(page)).toHaveAttribute('data-height', 'short')
    expect(await topOf(page)).toBeGreaterThan(0.25)
    await expect(sheet(page).getByRole('heading', { level: 2 })).toBeInViewport()
    await expect(sheet(page).getByRole('button', { name: 'Next' })).toBeInViewport()
  })

  test('shows all of the game from its grip, by a tap or by dragging up, and back', async ({
    page,
  }) => {
    await open(page)
    await sheet(page).getByRole('button', { name: 'Show all of this game' }).click()
    await expect(sheet(page)).toHaveAttribute('data-height', 'full')
    expect(await topOf(page)).toBeLessThan(0.12)

    const grip = sheet(page).getByRole('button', { name: 'Show less of this game' })
    await drag(page, grip, 140)
    await expect(sheet(page)).toHaveAttribute('data-height', 'short')

    await drag(page, sheet(page).getByRole('heading', { level: 2 }), -140)
    await expect(sheet(page)).toHaveAttribute('data-height', 'full')
  })

  test('goes away when dragged down while short', async ({ page }) => {
    await open(page)
    await drag(page, sheet(page).getByRole('heading', { level: 2 }), 160)
    await expect(sheet(page)).toBeHidden()
    await expect(page).toHaveURL(/\/en\/u\/sample$/)
  })
})
