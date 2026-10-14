import type { Page } from '@playwright/test'

import { expect, expectAccessible, openLibrary, shelfSettled, test } from './fixtures'

/**
 * The shelf in 3D (spec 3.3, 3.5 and 3.6). These assert meaning, not
 * pixels: which games, in what order, what is in focus, what the address
 * says. Where a browser cannot make a WebGL 2 context, the shelf gives way
 * to 2D and says so, and a test that needs 3D checks that instead.
 */

const pair = (page: Page) => page.getByRole('radiogroup', { name: 'Shelf in 2D or 3D' })
const shelfNames = (page: Page) => page.getByRole('heading', { level: 2 }).allTextContents()
const firstGames = (page: Page, shelf: string, count: number) =>
  page
    .getByRole('list', { name: `Games on the ${shelf} shelf` })
    .getByRole('button')
    .evaluateAll(
      (buttons, most) => buttons.slice(0, most).map((button) => button.getAttribute('aria-label')),
      count,
    )
const focusedName = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
const probe = (page: Page) =>
  page.evaluate(
    () => window.__shelf3dProbe as { calls: number; textureBytes: number; pulled?: number },
  )

/** Opens the library in 3D, or skips the test where this browser cannot draw it. */
async function open3d(page: Page, address = '/en/library') {
  // The scene reports its numbers after each frame once a probe is set.
  await page.addInitScript(() => {
    window.__shelf3dProbe = {}
  })
  await openLibrary(page, address)
  const settled = await shelfSettled(page)
  test.skip(settled !== '3d', 'this browser cannot draw 3D; the fallback has its own tests')
}

test.describe('which the shelf starts in (spec 3.6)', () => {
  test.use({ dimension: 'device' })

  test('a desktop starts in 3D, a phone or a tablet in 2D @smoke', async ({ page, size }) => {
    await openLibrary(page)
    const settled = await shelfSettled(page)
    if (size === 'desktop') {
      expect(['3d', 'fallback']).toContain(settled)
      if (settled === '3d')
        await expect(pair(page).getByRole('radio', { name: '3D' })).toBeChecked()
    } else {
      expect(settled).toBe('2d')
      // A phone is not offered 3D at all; a tablet is, and starts in 2D.
      if (size === 'phone') await expect(pair(page)).toBeHidden()
      else await expect(pair(page).getByRole('radio', { name: '2D' })).toBeChecked()
    }
  })

  test('a desktop asking for reduced motion starts in 2D', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openLibrary(page)
    expect(await shelfSettled(page)).toBe('2d')
  })

  test('the choice is remembered on this device, and is not in the address', async ({
    page,
    size,
  }) => {
    test.skip(size === 'phone', 'the choice is made with a pointer or a keyboard here')
    await openLibrary(page)
    await shelfSettled(page)
    const other = size === 'desktop' ? '2D' : '3D'
    await pair(page).getByRole('radio', { name: other }).click()
    await expect(page).toHaveURL(/\/en\/library$/)

    await openLibrary(page)
    const settled = await shelfSettled(page)
    if (other === '2D') expect(settled).toBe('2d')
    else expect(['3d', 'fallback']).toContain(settled)
    expect(await page.evaluate(() => localStorage.getItem('shelf:dimension'))).toBe(
      other.toLowerCase(),
    )
  })
})

test.describe('on a phone, held either way', () => {
  test.use({ dimension: '3d' })
  test.beforeEach(({ size }) => {
    test.skip(size !== 'phone', 'a phone is checked at its own size')
  })

  test('the shelf is 2D with nothing to choose, even when 3D was chosen in a larger window', async ({
    page,
  }) => {
    await openLibrary(page)
    expect(await shelfSettled(page)).toBe('2d')
    await expect(pair(page)).toBeHidden()
    await page.keyboard.press('d')
    await expect(page.locator('.game-box').first()).toBeVisible()
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
    // The choice waits for a window with room.
    expect(await page.evaluate(() => localStorage.getItem('shelf:dimension'))).toBe('3d')
  })

  test('on its side, too', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await openLibrary(page)
    expect(await shelfSettled(page)).toBe('2d')
    await expect(pair(page)).toBeHidden()
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
  })
})

test.describe('the shelf in 3D', () => {
  test.use({ dimension: '3d' })
  test.beforeEach(({ size }) => {
    test.skip(size !== 'desktop', '3D is checked where it is the default: on a desktop')
  })

  test('takes over from the 2D shelf, with the canvas hidden from assistive technology @smoke', async ({
    page,
  }) => {
    await open3d(page)
    await expect(page.locator('.game-box')).toHaveCount(0)
    await expect(page.locator('.shelf-3d-canvas')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByRole('navigation', { name: 'Shelves along the wall' })).toBeVisible()
  })

  test('has the same shelves and games as 2D, in the same order (spec 3.5)', async ({ page }) => {
    await open3d(page)
    const shelves3d = await shelfNames(page)
    const games3d = await firstGames(page, 'PlayStation 4', 12)

    await page.keyboard.press('d')
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
    expect(await shelfNames(page)).toEqual(shelves3d)
    expect(await firstGames(page, 'PlayStation 4', 12)).toEqual(games3d)
    expect(shelves3d.slice(0, 2)).toEqual(['PlayStation 5', 'PlayStation 4'])
  })

  test('shows the games a filter and a sort pick, as 2D does (spec 5 and 6)', async ({ page }) => {
    await open3d(page, '/en/library?q=genre%3Arpg&sort=-rating')
    await expect(page.getByRole('group', { name: 'Library totals' })).toContainText('86 games')
    const shelves3d = await shelfNames(page)
    const games3d = await firstGames(page, 'PlayStation 5', 8)

    await page.keyboard.press('d')
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
    expect(await shelfNames(page)).toEqual(shelves3d)
    expect(await firstGames(page, 'PlayStation 5', 8)).toEqual(games3d)

    // And a change made in 3D is drawn in 3D.
    await page.keyboard.press('d')
    await expect(page.locator('[data-shelf-phase="3d"]')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search the library' }).fill('zelda')
    await expect(page.getByRole('group', { name: 'Library totals' })).toContainText('9 games')
    await expect(page.locator('[data-shelf-phase="3d"]')).toBeVisible()
    expect((await shelfNames(page)).length).toBeGreaterThan(0)
  })

  test('switching keeps the address and the game in focus, both ways', async ({ page }) => {
    await open3d(page, '/en/library?group=status')
    const backlog = page.getByRole('list', { name: 'Games on the Backlog shelf' })
    await backlog.getByRole('button').nth(4).focus()
    const name = await focusedName(page)
    expect(name).toBeTruthy()

    await page.keyboard.press('d')
    await expect(page.locator('.game-box').first()).toBeVisible()
    await expect.poll(() => focusedName(page)).toBe(name)
    await expect(page).toHaveURL(/\/en\/library\?group=status$/)

    await page.keyboard.press('d')
    await expect(page.locator('[data-shelf-phase="3d"]')).toBeVisible()
    await expect.poll(() => focusedName(page)).toBe(name)
    await expect(page).toHaveURL(/\/en\/library\?group=status$/)
  })

  test('arrows move between games, Page Down changes shelf, Enter opens, Escape puts it back', async ({
    page,
  }) => {
    await open3d(page)
    const shelf = page.getByRole('list', { name: 'Games on the PlayStation 5 shelf' })
    const first = shelf.getByRole('button').first()
    await first.focus()

    await page.keyboard.press('ArrowRight')
    await expect(shelf.getByRole('button').nth(1)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(first).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(first).not.toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(first).toBeFocused()

    await page.keyboard.press('PageDown')
    const next = page.getByRole('list', { name: 'Games on the PlayStation 4 shelf' })
    await expect(next.getByRole('button').first()).toBeFocused()
    await page.keyboard.press('PageUp')
    await expect(first).toBeFocused()

    await page.keyboard.press('Enter')
    const details = page.getByRole('dialog', { name: 'Astro Bot' })
    await expect(details).toBeVisible()
    await expect.poll(async () => (await probe(page)).pulled).toBe(0)
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(first).toBeFocused()
  })

  test('a click in the scene opens the game under the pointer', async ({ page }) => {
    await open3d(page)
    const canvas = page.locator('.shelf-3d-canvas')
    const area = (await canvas.boundingBox())!
    // Across the top ledge until the pointer is over a box.
    let hit = false
    for (let x = 0.15; x < 0.7 && !hit; x += 0.05) {
      await page.mouse.move(area.x + area.width * x, area.y + area.height * 0.32)
      hit = await page.locator('.shelf-3d-tag').isVisible()
    }
    expect(hit).toBe(true)
    const tag = (await page.locator('.shelf-3d-tag').textContent()) ?? ''
    await page.mouse.down()
    await page.mouse.up()
    const title = tag.split(' · ')[0]!
    await expect(page.getByRole('dialog', { name: title })).toBeVisible()
  })

  test('follows a regroup, and stays in 3D', async ({ page }) => {
    await open3d(page)
    await page.getByRole('button', { name: /Platform/ }).click()
    await page.getByRole('menuitemradio', { name: 'Status' }).click()
    await expect(page).toHaveURL(/group=status/)
    await expect(page.locator('[data-shelf-phase="3d"]')).toBeVisible()
    expect(await shelfNames(page)).toEqual([
      'Playing',
      'Backlog',
      'Completed',
      'Dropped',
      'Wishlist',
    ])
  })

  test('gives way to 2D in a window made too small for it, and comes back when there is room', async ({
    page,
  }) => {
    await open3d(page)
    await page.setViewportSize({ width: 1000, height: 500 })
    await expect(page.locator('.game-box').first()).toBeVisible()
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
    await expect(pair(page)).toBeHidden()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.locator('[data-shelf-phase="3d"]')).toBeVisible()
    await expect(pair(page).getByRole('radio', { name: '3D' })).toBeChecked()
  })

  test('stays within its draw-call and texture budgets (architecture, section 14)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__shelf3dProbe = {}
    })
    await open3d(page)
    await expect.poll(async () => (await probe(page)).calls ?? 0).toBeGreaterThan(0)
    const numbers = await probe(page)
    expect(numbers.calls).toBeLessThan(40)
    expect(numbers.textureBytes).toBeLessThan(256 * 1024 * 1024)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`passes axe in ${theme}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('shelf:theme', value), theme)
      await open3d(page)
      await expectAccessible(page)
    })
  }

  test('when the graphics context is lost, goes back to 2D and says so (spec 3.3)', async ({
    page,
  }) => {
    await open3d(page)
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.shelf-3d-canvas')
      canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
    })
    await expect(page.getByRole('status').filter({ hasText: 'graphics card reset' })).toBeVisible()
    await expect(page.locator('.game-box').first()).toBeVisible()
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
  })
})

test.describe('where 3D cannot run (spec 3.6)', () => {
  test.use({ dimension: '3d' })

  test('without WebGL 2 the shelf is 2D, and 3D is unavailable with its reason', async ({
    page,
    size,
  }) => {
    test.skip(size === 'phone', 'the pair of buttons is checked once, at a wider size')
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'WebGL2RenderingContext')
    })
    await openLibrary(page)
    await expect(page.locator('.game-box').first()).toBeVisible()
    const threeD = pair(page).getByRole('radio', { name: '3D' })
    await expect(threeD).toHaveAttribute('aria-disabled', 'true')
    await expect(threeD).toHaveAccessibleDescription(
      '3D needs WebGL 2, which this browser does not offer.',
    )
    // Pressing it does nothing. Forced: to Playwright, as to assistive technology, it is disabled.
    await threeD.click({ force: true })
    await expect(page.locator('[data-shelf-3d]')).toHaveCount(0)
    await expect(pair(page).getByRole('radio', { name: '2D' })).toBeChecked()
  })
})
