import type { Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'
import { gameToAdd } from './games-to-add'

/**
 * Adding games (spec 4.1), as the owner. These change the library, so they
 * run after every test that only reads it, and each adds a game of its own.
 */

test.use({ signedIn: true })

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add a game' })
const notice = (page: Page) => page.locator('[data-notice]')
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The result whose title is exactly this. */
const result = (page: Page, title: string) =>
  sheet(page)
    .getByRole('option')
    .filter({ has: page.getByText(title, { exact: true }) })

/** `A`, the title, and the arrow keys down to the result: no pointer. */
async function findWithKeys(page: Page, title: string) {
  await page.keyboard.press('a')
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByRole('combobox', { name: 'Search IGDB' })).toBeFocused()
  await page.keyboard.type(title)
  await expect(result(page, title).first()).toBeVisible()
  for (let step = 0; step < 8; step += 1) {
    if ((await result(page, title).first().getAttribute('aria-selected')) === 'true') return
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`The arrow keys never reached ${title}`)
}

test.describe('adding a game', () => {
  test('is found and added with the keyboard alone, comes into view, and Undo takes it off again @smoke', async ({
    page,
  }, info) => {
    const title = gameToAdd(info, 0)
    await openLibrary(page, '/en/library?group=none')
    await findWithKeys(page, title)
    await page.keyboard.press('Enter')

    // Where it is owned is the next thing asked: the first platform has focus.
    const first = sheet(page)
      .getByRole('group', { name: 'Platforms owned' })
      .getByRole('button')
      .first()
    await expect(first).toBeFocused()
    await page.keyboard.press('Space')
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    const rating = sheet(page).getByLabel('My rating, out of 10')
    for (
      let step = 0;
      step < 20 && !(await rating.evaluate((field) => field === document.activeElement));
      step += 1
    ) {
      await page.keyboard.press('Tab')
    }
    await page.keyboard.type('8')
    await page.keyboard.press('Enter')

    await expect(sheet(page)).toBeHidden()
    await expect(notice(page)).toContainText(`Added ${title}.`)
    // The new box, in view and in focus.
    const box = page.locator(`[data-flip][aria-label^="${title} ("]`)
    await expect(box.first()).toBeFocused()
    await expect(box.first()).toBeInViewport()

    await notice(page).getByRole('button', { name: 'Undo' }).click()
    await expect(notice(page)).toContainText(`Took ${title} back off the shelf.`)
    await expect(page.locator(`[data-flip][aria-label^="${title} ("]`)).toHaveCount(0)
  })

  test('Command or Control and Enter adds, and stays open for the next game', async ({
    page,
  }, info) => {
    const title = gameToAdd(info, 1)
    await openLibrary(page)
    await findWithKeys(page, title)
    await page.keyboard.press('Enter')
    await sheet(page).getByRole('radio', { name: 'Wishlist' }).check({ force: true })
    await page.keyboard.press('ControlOrMeta+Enter')

    await expect(notice(page)).toContainText(`Added ${title}.`)
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('combobox', { name: 'Search IGDB' })).toHaveValue('')
    await expect(sheet(page).getByRole('combobox', { name: 'Search IGDB' })).toBeFocused()
    await page.keyboard.press('Escape')
    await notice(page).getByRole('button', { name: 'Undo' }).click()
    await expect(notice(page)).toContainText(`Took ${title} back off the shelf.`)
  })

  test('a game the filters hide says so, and Show brings it into view', async ({ page }, info) => {
    const title = gameToAdd(info, 2)
    await openLibrary(page, '/en/library?q=status%3Aplaying')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sheet(page).getByRole('combobox', { name: 'Search IGDB' }).fill(title)
    await result(page, title).first().click()
    await sheet(page).getByRole('radio', { name: 'Backlog' }).check({ force: true })
    await sheet(page).getByRole('button', { name: 'Add', exact: true }).click()

    await expect(notice(page)).toContainText(`Added ${title}. Your filters hide it.`)
    await notice(page).getByRole('button', { name: 'Show' }).click()
    await expect(page).not.toHaveURL(/q=/)
    const box = page.locator(`[data-flip][aria-label^="${title} ("]`).first()
    await expect(box).toBeFocused()

    // And off again, through its own Undo.
    await notice(page).getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator(`[data-flip][aria-label^="${escape(title)} ("]`)).toHaveCount(0)
  })
})

test.describe('finding a game to add', () => {
  test('two games with one title are told apart by year and platforms, without opening either', async ({
    page,
  }) => {
    await openLibrary(page)
    await page.keyboard.press('a')
    await sheet(page).getByRole('combobox', { name: 'Search IGDB' }).fill('Prey')
    const preys = result(page, 'Prey')
    await expect(preys).toHaveCount(2)
    await expect(preys.filter({ hasText: '2006' })).toHaveCount(1)
    await expect(preys.filter({ hasText: '2017' })).toHaveCount(1)
    // The one already on the shelf says so.
    await expect(preys.filter({ hasText: '2017' })).toContainText('In library')
    await expect(preys.filter({ hasText: '2006' })).not.toContainText('In library')
  })

  test('a game already on the shelf opens its page instead of being added twice', async ({
    page,
  }) => {
    await openLibrary(page)
    await page.keyboard.press('a')
    await sheet(page)
      .getByRole('combobox', { name: 'Search IGDB' })
      .fill('The Elder Scrolls V: Skyrim')
    const skyrim = result(page, 'The Elder Scrolls V: Skyrim')
    await expect(skyrim).toHaveCount(1)
    await expect(skyrim).toContainText('In library')
    // Its Switch port is folded in, not a second result.
    await expect(skyrim).toContainText('also on')
    await skyrim.click()
    await expect(page).toHaveURL(/\/en\/game\/the-elder-scrolls-v-skyrim$/)
  })

  test('a game related to one I have offers to join it, as ADR 001 proposes', async ({ page }) => {
    await openLibrary(page)
    await page.keyboard.press('a')
    await sheet(page).getByRole('combobox', { name: 'Search IGDB' }).fill('Persona 5')
    await result(page, 'Persona 5').first().click()
    const choice = sheet(page).getByRole('group', { name: /^You have Persona 5 Royal/ })
    await expect(choice).toBeVisible()
    await expect(choice.getByRole('radio', { name: /Add it to Persona 5 Royal/ })).toBeChecked()
    await expect(
      choice.getByRole('radio', { name: 'Add it as a game of its own' }),
    ).not.toBeChecked()
  })
})
