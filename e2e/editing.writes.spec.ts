import type { APIRequestContext, Locator, Page } from '@playwright/test'

import { chooseDay, expect, openLibrary, shownDay, test } from './fixtures'
import { gameToAdd } from './games-to-add'

/**
 * Editing a game in place (spec 7.3), as the owner. Each test adds a game of
 * its own through the API, changes it, and takes it away again.
 */

test.use({ signedIn: true })

type Search = { results: { igdbId: number; title: string; platforms: number[] }[] }

/** Adds a game through the API, as the owner whose session the page has. Returns its address. */
async function addThroughApi(request: APIRequestContext, title: string): Promise<string> {
  const search = (await (
    await request.get(`/api/v1/igdb/search?q=${encodeURIComponent(title)}`)
  ).json()) as Search
  const found = search.results.find((result) => result.title === title)
  if (!found) throw new Error(`IGDB's test double has no ${title}`)
  const added = await request.post('/api/v1/entries', {
    data: {
      igdbId: found.igdbId,
      status: 'backlog',
      copies: [{ platform: found.platforms[0], format: 'physical' }],
    },
  })
  expect(added.status()).toBe(201)
  return ((await added.json()) as { slug: string }).slug
}

/** "Mine" as the owner edits it: busy while a change is being saved. */
const mine = (scope: Page | Locator) => scope.locator('section[aria-busy]').first()

test.describe('editing a game', () => {
  let slug: string | undefined

  test.afterEach(async ({ page }) => {
    if (slug) await page.request.delete(`/api/v1/entries/${slug}`)
    slug = undefined
  })

  test('in its panel, a change is saved as it is made, and the box on the shelf takes it', async ({
    page,
  }, info) => {
    const title = gameToAdd(info, 3)
    slug = await addThroughApi(page.request, title)
    await openLibrary(page, `/en/library?q=${encodeURIComponent(`"${title}"`)}&group=none`)
    const box = page.locator(`[data-flip^="${slug}"]`).first()
    await expect(box).toHaveAttribute('data-status', 'backlog')
    await box.click()

    const panel = page.getByRole('dialog')
    const status = panel.getByRole('group', { name: 'Status' })
    await status.getByText('Playing', { exact: true }).click()
    // On the shelf, at once: a box being played stands differently.
    await expect(box).toHaveAttribute('data-status', 'playing')
    await expect(mine(panel)).toHaveAttribute('aria-busy', 'false')

    // Out to ten and back by half points: saved once it has come to rest, not at each press.
    const rating = panel.getByRole('slider', { name: 'My rating' })
    await rating.focus()
    await page.keyboard.press('End')
    for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowLeft')
    await expect(rating).toHaveAttribute('aria-valuetext', '7.5 out of 10')
    const game = async () =>
      (await (await page.request.get(`/api/v1/games/${slug}`)).json()) as {
        status: string
        rating: number
      }
    await expect.poll(game).toMatchObject({ status: 'playing', rating: 7.5 })
    await expect(mine(panel)).toHaveAttribute('aria-busy', 'false')

    // The owner's own read speaks the API's units too: out of ten, in hours.
    const patched = await page.request.patch(`/api/v1/entries/${slug}`, {
      data: { hoursPlayed: 2.5 },
    })
    expect(patched.status()).toBe(200)
    const owned = (await (await page.request.get(`/api/v1/entries/${slug}`)).json()) as unknown
    expect(owned).toMatchObject({ status: 'playing', rating: 7.5, hoursPlayed: 2.5 })
    expect(await (await page.request.get(`/api/v1/games/${slug}`)).json()).toMatchObject({
      hoursPlayed: 2.5,
    })
  })

  test('completed sets today’s date, which stays editable, and the page shows it after a reload', async ({
    page,
  }, info) => {
    slug = await addThroughApi(page.request, gameToAdd(info, 4))
    await page.goto(`/en/game/${slug}`)
    const status = page.getByRole('group', { name: 'Status' })
    await status.getByText('Completed', { exact: true }).click()
    const date = page.getByRole('button', { name: /^Completed on/ })
    // Today where the browser is, as the field shows it.
    const today = await page.evaluate(() =>
      new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date()),
    )
    await expect(date).toHaveAccessibleName(`Completed on ${today}`)
    await chooseDay(page, date, '2024-02-29')
    await expect(date).toHaveAccessibleName(`Completed on ${shownDay('2024-02-29')}`)
    await expect(mine(page)).toHaveAttribute('aria-busy', 'false')

    await page.reload()
    await expect(page.getByRole('button', { name: /^Completed on/ })).toHaveAccessibleName(
      `Completed on ${shownDay('2024-02-29')}`,
    )
    await expect(page.locator('.game-hero')).toContainText('Completed')
  })

  test('a private note never reaches a visitor, in the page or any file; a public one does', async ({
    page,
    browser,
  }, info) => {
    slug = await addThroughApi(page.request, gameToAdd(info, 5))
    const note = `Saved for later, ${info.project.name}`
    await page.goto(`/en/game/${slug}`)
    await page.getByRole('textbox', { name: 'Notes' }).fill(note)
    await page.getByRole('textbox', { name: 'Notes' }).blur()
    await expect(mine(page)).toHaveAttribute('aria-busy', 'false')

    const visitor = await browser.newContext()
    const read = async (path: string) => (await visitor.request.get(path)).text()
    const version = new URL(
      (await visitor.request.get('/api/v1/library/snapshot/0', { maxRedirects: 0 })).headers()
        .location!,
      'http://x',
    ).pathname.split('/')
    const current = version[version.length - 1]
    for (const path of [
      `/en/game/${slug}`,
      `/api/v1/games/${slug}`,
      `/api/v1/library/snapshot/${current}`,
      `/api/v1/library/games/${current}/${slug}`,
      '/api/v1/library?limit=200',
    ]) {
      expect(await read(path), path).not.toContain(note)
    }

    await page.getByRole('switch', { name: 'Visitors can read these notes' }).check()
    await expect(mine(page)).toHaveAttribute('aria-busy', 'false')
    expect(await read(`/en/game/${slug}`)).toContain(note)
    await visitor.close()
  })

  test('removing asks once, and Undo puts it back as it was', async ({ page }, info) => {
    const title = gameToAdd(info, 6)
    slug = await addThroughApi(page.request, title)
    await page.goto(`/en/game/${slug}`)
    await page.getByRole('button', { name: 'Remove from library' }).click()
    await expect(page.getByText(`Remove ${title} from the library?`)).toBeVisible()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(page).toHaveURL(/\/en\/library$/)
    await expect(page.locator('[data-notice]')).toContainText(`Removed ${title}.`)
    expect((await page.request.get(`/api/v1/games/${slug}`)).status()).toBe(404)

    await page.locator('[data-notice]').getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('[data-notice]')).toContainText(`Put ${title} back on the shelf.`)
    const back = await page.request.get(`/api/v1/games/${slug}`)
    expect(back.status()).toBe(200)
    expect(((await back.json()) as { platforms: unknown[] }).platforms.length).toBeGreaterThan(0)
  })
})

test.describe('a visitor', () => {
  test.use({ signedIn: false })

  test('sees a game’s page with no edit control', async ({ page }) => {
    await page.goto('/en/game/donkey-kong-country')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Donkey Kong Country')
    await expect(page.getByRole('group', { name: 'Status' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove from library' })).toHaveCount(0)
  })
})
