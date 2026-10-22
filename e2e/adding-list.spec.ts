import type { Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'

/**
 * Many games at once (spec 4.2), as the owner, up to the review: matching
 * changes nothing, so these run with the tests that only read. Adding from
 * a list is in adding-list.writes.spec.ts.
 */

test.use({ signedIn: true })

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add a game' })
const rows = (page: Page) => sheet(page).getByRole('list', { name: 'Lines and their matches' })

/** Titles another game in the fixtures shares (a remake, a reboot): their best match may be the other. */
const SHARED = new Set([
  'God of War',
  'Shadow of the Colossus',
  "Demon's Souls",
  "The Legend of Zelda: Link's Awakening",
  'Doom',
  'Prey',
  'The Elder Scrolls V: Skyrim',
  'Resident Evil 4',
  'Resident Evil 2',
  'Tomb Raider',
])

async function openList(page: Page) {
  await openLibrary(page, '/en/u/sample?group=none')
  await page.keyboard.press('a')
  await expect(sheet(page)).toBeVisible()
  await sheet(page).getByRole('tab', { name: 'Paste a list' }).click()
  const field = sheet(page).getByRole('textbox', { name: 'Titles, one per line' })
  await expect(field).toBeVisible()
  return field
}

test('a pasted list of 50 known titles has every line matched or marked, the ones I have left out', async ({
  page,
}) => {
  const library = (await (await page.request.get('/api/v1/u/sample/library?limit=80')).json()) as {
    games: { title: string }[]
  }
  const mine = library.games.map((game) => game.title).filter((title) => !SHARED.has(title))
  const list = [
    ...mine.slice(0, 45),
    'Crysis',
    'Bastion (2011) [PC]',
    '- Stray',
    // Close: South Park: The Stick of Truth.
    'Stick of Truth',
    'Zzqx Nothing Like It',
  ]
  expect(list).toHaveLength(50)

  const field = await openList(page)
  await field.fill(list.join('\n'))
  await expect(sheet(page).getByText('50 titles.')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Match 50 titles' }).click()

  await expect(sheet(page).getByText(/^50 lines: 48 exact, 1 close, 1 not found\.$/)).toBeVisible({
    timeout: 20_000,
  })
  const each = rows(page).getByRole('listitem')
  await expect(each).toHaveCount(50)
  // Already in the library: marked, and left out unless I say otherwise.
  const owned = each.filter({ hasText: 'In library' })
  await expect(owned).toHaveCount(45)
  await expect(owned.locator('input[type="checkbox"]:checked')).toHaveCount(0)

  // A year and a platform are read: Bastion starts on PC.
  await expect(sheet(page).getByRole('combobox', { name: 'Platform for Bastion' })).toHaveText('PC')
  // A line no game matches says so, and can be searched again.
  const none = each.filter({ hasText: 'No match' })
  await expect(none).toHaveCount(1)
  await expect(none.getByRole('checkbox')).toBeDisabled()
  await none.getByRole('textbox', { name: 'Title to search for' }).fill('Crysis')
  await none.getByRole('button', { name: 'Search again' }).click()
  await expect(each.filter({ hasText: 'No match' })).toHaveCount(0)
  // Now matched twice: the second starts left out.
  await expect(each.filter({ hasText: 'Also on line 46' })).toHaveCount(1)
  await expect(sheet(page).getByRole('button', { name: 'Add 4 games' })).toBeVisible()
})

test('matching can be canceled, and the list is back as pasted', async ({ page }) => {
  // Each step answers slowly enough to cancel in the middle.
  await page.route('**/api/v1/igdb/match', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue().catch(() => undefined)
  })
  const field = await openList(page)
  const text = Array.from({ length: 25 }, (_, at) => `Game number ${at}`).join('\n')
  await field.fill(text)
  await sheet(page).getByRole('button', { name: 'Match 25 titles' }).click()
  await expect(sheet(page).getByText('Matching 0 of 25…')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Cancel' }).click()

  await expect(field).toHaveValue(text)
  await expect(field).toBeEditable()
  await expect(sheet(page).getByRole('progressbar')).toHaveCount(0)
  await expect(sheet(page).getByRole('button', { name: 'Match 25 titles' })).toBeEnabled()
})

test.describe('when IGDB asks to slow down', () => {
  // The browser itself logs the refused request.
  test.use({ allowConsoleErrors: true })

  test('the progress says it is waiting, then goes on', async ({ page }) => {
    await slowDownOnce(page)
    const field = await openList(page)
    await field.fill('Crysis\nBastion')
    await sheet(page).getByRole('button', { name: 'Match 2 titles' }).click()
    await expect(
      sheet(page).getByText('IGDB asks us to slow down. Waiting, then going on…'),
    ).toBeVisible()
    await expect(sheet(page).getByText(/^2 lines: 2 exact/)).toBeVisible({ timeout: 10_000 })
  })
})

/** The first match request answers as IGDB does when it is rate-limiting. */
async function slowDownOnce(page: Page) {
  let first = true
  await page.route('**/api/v1/igdb/match', async (route) => {
    if (!first) return route.continue()
    first = false
    return route.fulfill({
      status: 502,
      json: { error: { code: 'igdb', message: 'IGDB did not answer. Try again.' } },
    })
  })
}

test('more than 200 lines are not matched, and it says why', async ({ page }) => {
  const field = await openList(page)
  await field.fill(Array.from({ length: 201 }, (_, at) => `Game ${at}`).join('\n'))
  await expect(sheet(page).getByText('201 titles: up to 200 at a time.')).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: /^Match/ })).toBeDisabled()
})
