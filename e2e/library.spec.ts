import type { Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'

/**
 * The library (spec, sections 2 and 3): the shelf, the wall and the list show
 * the same sample library of 230 games, and the address says which view and
 * which grouping.
 */

const boxes = (page: Page) => page.locator('.game-box')

test.describe('the shelf', () => {
  test('arrives with its first shelf of games already in the page @smoke', async ({ page }) => {
    // Before any script runs: the boxes are in the HTML the server sent.
    const response = await page.request.get('/en/library')
    const html = await response.text()
    expect(html).toContain('PlayStation 5')
    expect(html).toContain('Astro Bot')
  })

  test('groups games by platform, newest PlayStation first @smoke', async ({ page, size }) => {
    await openLibrary(page)
    const shelves = page.getByRole('heading', { level: 2 })
    await expect(shelves.first()).toHaveText('PlayStation 5')
    const first = page.getByRole('list', { name: 'Games on the PlayStation 5 shelf' })
    await expect(first.getByRole('button').first()).toHaveAccessibleName(
      'Astro Bot (2024), PS5, Physical, Completed',
    )
    await expect(page.getByRole('group', { name: 'Library totals' })).toContainText('230 games')
    if (size !== 'phone') await expect(shelves.nth(1)).toHaveText('PlayStation 4')
  })

  test('says in words what a box shows by shape', async ({ page }) => {
    await openLibrary(page)
    const shelf = page.getByRole('list', { name: 'Games on the PlayStation 5 shelf' })
    // A count on the box's foot: owned on more than one platform.
    await expect(shelf.getByRole('button', { name: /^Baldur's Gate III/ })).toHaveAccessibleName(
      "Baldur's Gate III (2023), PS5, Physical, Backlog, owned on 2 platforms",
    )
    // A cover with no case around it: a download.
    const download = shelf.getByRole('button', { name: /^Final Fantasy VII Remake/ })
    await expect(download).toHaveAccessibleName(/PS5, Digital, Backlog$/)
    await expect(download.locator('.game-loose')).toBeVisible()
    // A foil seal: completed.
    await expect(
      shelf.getByRole('button', { name: /^Astro Bot/ }).locator('.game-seal'),
    ).toBeVisible()
  })

  test('keeps only the rows near the window in the page', async ({ page }) => {
    await openLibrary(page, '/en/library?group=none')
    await expect(page.getByRole('heading', { level: 2, name: 'All games' })).toBeVisible()
    expect(await boxes(page).count()).toBeLessThan(120)

    // Far down the shelf there are still games, and still only a screenful of them.
    await page.keyboard.press('Tab')
    await boxes(page).first().focus()
    await page.keyboard.press('End')
    await expect(boxes(page).last()).toBeFocused()
    await expect(boxes(page).last()).toHaveAttribute('data-index', '229')
    expect(await boxes(page).count()).toBeLessThan(120)
  })

  test('lights the row in the color of the game in focus', async ({ page, size }) => {
    test.skip(size !== 'desktop', 'hover belongs to a pointer')
    await openLibrary(page)
    const box = page.getByRole('button', { name: /^Doom Eternal/ })
    const cell = box.locator('xpath=..')
    const resting = await cell.evaluate((el) => getComputedStyle(el).getPropertyValue('--led'))
    await box.hover()
    await expect
      .poll(() => cell.evaluate((el) => getComputedStyle(el).getPropertyValue('--led')))
      .not.toBe(resting)
    await expect(box.locator('.game-case')).toHaveAttribute('data-active', 'true')
  })
})

test.describe('keyboard (spec 3.11)', () => {
  test('arrows move between games, Enter opens one, Escape puts it back', async ({
    page,
    size,
  }) => {
    test.skip(size === 'phone', 'a phone has no keyboard')
    await openLibrary(page)
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
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(first).toBeFocused()
  })

  test('Tab stops once per shelf', async ({ page, size }) => {
    test.skip(size === 'phone', 'a phone has no keyboard')
    await openLibrary(page)
    const first = page.getByRole('list', { name: 'Games on the PlayStation 5 shelf' })
    await first.getByRole('button').first().focus()
    await page.keyboard.press('Tab')
    const second = page.getByRole('list', { name: 'Games on the PlayStation 4 shelf' })
    await expect(second.getByRole('button').first()).toBeFocused()
  })
})

test.describe('a game picked up from the shelf', () => {
  test('shows what is recorded about it, and steps to its neighbors @smoke', async ({ page }) => {
    await openLibrary(page)
    await page.getByRole('button', { name: /^Astro Bot/ }).click()
    const details = page.getByRole('dialog', { name: 'Astro Bot' })
    await expect(details).toContainText('Completed')
    await expect(details).toContainText('PlayStation 5, Physical')
    await expect(details.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await details.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('dialog', { name: "Baldur's Gate III" })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('dialog', { name: 'Astro Bot' })).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})

test.describe('the address is the state (spec 2)', () => {
  test('grouping changes the shelves and the address, and Back undoes it @smoke', async ({
    page,
  }) => {
    await openLibrary(page)
    await page.getByRole('button', { name: /Platform/ }).click()
    await page.getByRole('menuitemradio', { name: 'Status' }).click()

    await expect(page).toHaveURL(/group=status/)
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Playing')

    await page.goBack()
    await expect(page).not.toHaveURL(/group=/)
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('PlayStation 5')
    await page.goForward()
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Playing')
  })

  test('the view changes the address too', async ({ page }) => {
    await openLibrary(page)
    await page.getByRole('radio', { name: 'Wall', exact: true }).click()
    await expect(page).toHaveURL(/view=wall/)
    await expect(page.locator('.wall-grid').first()).toBeVisible()

    await page.getByRole('radio', { name: 'List', exact: true }).click()
    await expect(page).toHaveURL(/view=list/)
    await expect(page.getByRole('table').first()).toBeVisible()

    await page.goBack()
    await expect(page.locator('.wall-grid').first()).toBeVisible()
  })

  test('loading an address directly shows exactly the state it describes', async ({ page }) => {
    await openLibrary(page, '/en/library?view=list&group=year')
    await expect(page.getByRole('radio', { name: 'List', exact: true })).toBeChecked()
    await expect(page.getByRole('table').first()).toBeVisible()
    // Newest year first.
    const years = await page.getByRole('heading', { level: 2 }).allTextContents()
    expect(Number(years[0])).toBeGreaterThan(Number(years[1]))
  })

  test('an unknown or malformed parameter falls back to its default', async ({ page }) => {
    await openLibrary(page, '/en/library?view=cube&group=%3Cscript%3E&sort=')
    await expect(page.getByRole('radio', { name: 'Shelf', exact: true })).toBeChecked()
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('PlayStation 5')
  })
})

test.describe('the wall and the list', () => {
  test('the wall shows a status mark and platforms on each cover', async ({ page }) => {
    await openLibrary(page, '/en/library?view=wall')
    const first = page.getByRole('list', { name: 'Games on the PlayStation 5 shelf' })
    await expect(first.getByRole('button').first()).toHaveAccessibleName(/^Astro Bot/)
    await expect(first.locator('.wall-marks').first()).toContainText('PS5')

    await page.getByRole('radio', { name: 'Large covers' }).click()
    await expect(page.locator('.wall-grid').first()).toHaveAttribute('data-size', 'large')
  })

  test('the list is a real table, and a row opens its game', async ({ page, size }) => {
    await openLibrary(page, '/en/library?view=list')
    const table = page.getByRole('table', { name: 'Games on the PlayStation 5 shelf' })
    await expect(table.getByRole('columnheader', { name: 'Title' })).toBeVisible()
    if (size === 'desktop') {
      await expect(table.getByRole('columnheader', { name: 'Completed' })).toBeVisible()
    }
    // Anywhere on the row will do, not only the title.
    await table
      .getByRole('row')
      .nth(1)
      .click({ position: { x: 30, y: 20 } })
    await expect(page.getByRole('dialog', { name: 'Astro Bot' })).toBeVisible()
  })
})

test.describe('choices that belong to the device', () => {
  test('the compact shelf is remembered, and is not in the address', async ({ page }) => {
    await openLibrary(page)
    await page.getByRole('radio', { name: 'Compact' }).click()
    await expect(page.locator('.game-spine').first()).toBeVisible()
    await expect(page).toHaveURL(/\/en\/library$/)

    await page.reload()
    await expect(page.getByRole('radio', { name: 'Compact' })).toBeChecked()
    await expect(page.locator('.game-spine').first()).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
  })
})

test.describe('on a phone (spec 3.4)', () => {
  test('one shelf fills the screen, with tabs to move between shelves', async ({ page, size }) => {
    test.skip(size !== 'phone', 'the shelf pager exists only at phone width')
    await openLibrary(page)
    const tabs = page.getByRole('navigation', { name: 'Shelves' })
    await expect(tabs.getByRole('button').first()).toHaveAttribute('aria-current', 'true')

    await tabs.getByRole('button', { name: /^PS4/ }).click()
    await expect(tabs.getByRole('button', { name: /^PS4/ })).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('heading', { level: 2, name: 'PlayStation 4' })).toBeInViewport()
    await expect(
      page.getByRole('heading', { level: 2, name: 'PlayStation 5' }),
    ).not.toBeInViewport()
  })

  test('a tap opens the game as a sheet from the bottom', async ({ page, size }) => {
    test.skip(size !== 'phone', 'the bottom sheet is the phone layout')
    await openLibrary(page)
    await page.getByRole('button', { name: /^Astro Bot/ }).tap()
    const sheet = page.getByRole('dialog', { name: 'Astro Bot' })
    await expect(sheet).toBeVisible()
    const height = page.viewportSize()?.height ?? 0
    // Once it has slid in, it sits on the bottom edge and leaves the top of the shelf in view.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox()
        return Math.round((box?.y ?? 0) + (box?.height ?? 0))
      })
      .toBe(height)
    expect((await sheet.boundingBox())?.y ?? 0).toBeGreaterThan(40)
  })
})

test.describe('in Portuguese', () => {
  test('statuses and labels are translated; titles stay as IGDB gives them', async ({ page }) => {
    await openLibrary(page, '/pt-BR/library?group=status')
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Jogando')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Biblioteca')
    await expect(page.getByRole('radio', { name: 'Estante' })).toBeChecked()
  })
})
