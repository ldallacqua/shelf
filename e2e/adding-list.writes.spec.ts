import type { APIRequestContext, Page } from '@playwright/test'

import { choose, expect, openLibrary, test } from './fixtures'
import { listToAdd } from './games-to-add'

/**
 * Adding many games from a pasted list (spec 4.2), as the owner. This
 * changes the library, so it runs after every test that only reads it, and
 * each project adds games of its own.
 */

test.use({ signedIn: true })

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add a game' })
const notice = (page: Page) => page.locator('[data-notice]')

type Search = {
  results: { title: string; year: number | null; platforms: number[] }[]
  platforms: { id: number; key: string; name: string; short: string }[]
}

type Game = {
  slug: string
  title: string
  status: string
  owned: { platform: string; format: string }[]
}

/** The library's game with exactly this title, if it has one. */
async function onShelf(request: APIRequestContext, title: string): Promise<Game | undefined> {
  const answer = (await (
    await request.get(`/api/v1/u/sample/library?q=${encodeURIComponent(`"${title}"`)}`)
  ).json()) as { games: Game[] }
  return answer.games.find((game) => game.title === title)
}

test('a reviewed list is added at once, each row as set, and Undo takes them all back @smoke', async ({
  page,
}, info) => {
  const [first, second, third] = listToAdd(info)
  // The second line gives a year and a platform, as IGDB has them.
  const found = (await (
    await page.request.get(`/api/v1/igdb/search?q=${encodeURIComponent(second)}`)
  ).json()) as Search
  const game = found.results.find((result) => result.title === second)!
  const platform = found.platforms.find((each) => each.id === game.platforms.at(-1))!
  const lines = [first, `${second} (${game.year}) [${platform.short}]`, third, 'Zzqx Nothing']

  // Filtered to the first: its box comes onto the shelf, and leaves it again.
  await openLibrary(page, `/en/u/sample?q=${encodeURIComponent(`"${first}"`)}&group=none`)
  await page.keyboard.press('a')
  await sheet(page).getByRole('tab', { name: 'Paste a list' }).click()
  await sheet(page).getByRole('textbox', { name: 'Titles, one per line' }).fill(lines.join('\n'))
  await sheet(page).getByRole('button', { name: 'Match 4 titles' }).click()
  await expect(sheet(page).getByText('4 lines: 3 exact, 0 close, 1 not found.')).toBeVisible({
    timeout: 15_000,
  })

  // On every row at once, then one row of its own.
  await choose(
    page,
    sheet(page).getByRole('combobox', { name: 'Status', exact: true }),
    'Completed',
  )
  await expect(sheet(page).getByRole('combobox', { name: `Status for ${first}` })).toHaveText(
    'Completed',
  )
  await choose(page, sheet(page).getByRole('combobox', { name: `Status for ${third}` }), 'Wishlist')
  await expect(sheet(page).getByRole('combobox', { name: `Platform for ${third}` })).toBeDisabled()
  // The platform its line named, as the format I choose.
  await expect(sheet(page).getByRole('combobox', { name: `Platform for ${second}` })).toHaveText(
    platform.name,
  )
  await choose(page, sheet(page).getByRole('combobox', { name: `Format for ${second}` }), 'Digital')

  await sheet(page).getByRole('button', { name: 'Add 3 games' }).click()
  await expect(sheet(page)).toBeHidden()
  await expect(notice(page)).toContainText('Added 3 games.')

  const [one, two, three] = await Promise.all(
    [first, second, third].map((title) => onShelf(page.request, title)),
  )
  expect(one?.status).toBe('completed')
  expect(two).toMatchObject({
    status: 'completed',
    owned: [{ platform: platform.key, format: 'digital' }],
  })
  expect(three).toMatchObject({ status: 'wishlist', owned: [] })
  // The shelf has them too.
  await expect(page.locator(`[data-flip][aria-label^="${first} ("]`).first()).toBeAttached()

  await notice(page).getByRole('button', { name: 'Undo' }).click()
  await expect(notice(page)).toContainText('Took 3 games back off the shelf.')
  for (const title of [first, second, third]) {
    expect(await onShelf(page.request, title), title).toBeUndefined()
  }
  await expect(page.locator(`[data-flip][aria-label^="${first} ("]`)).toHaveCount(0)
})
