import type { Locator, Page } from '@playwright/test'

import { expect, openLibrary, test } from './fixtures'

/**
 * Finding games (spec 3.1, 5 and 6): the search field and its filter
 * language, the status row, the chips, the filter panel and the sort. The
 * filter is the address's `q`, so every check here is also a check that the
 * address says what the page shows. Counts are the sample library's.
 */

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search the library' })
const totals = (page: Page) => page.getByRole('group', { name: 'Library totals' })
const chips = (page: Page) => page.getByRole('group', { name: 'Active filters' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Filters', exact: true })
/** The panel's own count, at its foot. A range that cannot be read says so in a status of its own. */
const panelCount = (page: Page) => panel(page).getByRole('status').last()
const openPanel = (page: Page) => page.getByRole('button', { name: 'Filters', exact: true }).click()
const firstBox = (page: Page) => page.locator('.game-box').first()

/** The number of games the API says a filter matches: the page should say the same. */
async function matches(page: Page, q: string): Promise<number> {
  const answer = await page.request.get(`/api/v1/library?limit=1&q=${encodeURIComponent(q)}`)
  return ((await answer.json()) as { stats: { games: number } }).stats.games
}

/** The first title the API gives for a sort, with one shelf of everything. */
async function firstTitle(page: Page, sort: string): Promise<string> {
  const answer = await page.request.get(`/api/v1/library?group=none&limit=1&sort=${sort}`)
  return ((await answer.json()) as { games: { title: string }[] }).games[0]!.title
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Opens one filter's section in the panel. Status and genre start open. */
async function openSection(page: Page, key: string): Promise<Locator> {
  const section = panel(page).locator(`details[data-filter="${key}"]`)
  if (!(await section.evaluate((details) => (details as HTMLDetailsElement).open))) {
    await section.locator('summary').click()
  }
  await expect(section).toHaveAttribute('open', '')
  return section
}

/** The filter in the address. While the panel is open the page behind it is out of reach. */
const address = (page: Page) => expect.poll(() => new URL(page.url()).searchParams.get('q'))

/**
 * Includes or excludes a value. With a mouse the value's row cycles off,
 * included, excluded; on touch each value has its own two buttons.
 */
async function pick(section: Locator, value: string, state: 'include' | 'exclude') {
  const touch = await section.evaluate(() => matchMedia('(pointer: coarse)').matches)
  if (touch) {
    const name = state === 'include' ? new RegExp(`^Include ${escape(value)},`) : `Exclude ${value}`
    await section.getByRole('button', { name, exact: true }).click()
    return
  }
  const row = (suffix: string) =>
    section.getByRole('button', { name: new RegExp(`^${escape(value)}, [\\d,]+ games?${suffix}$`) })
  await row('').click()
  if (state === 'exclude') await row(', included').click()
}

test.describe('the search field (spec 3.1)', () => {
  test('filters as you type, and the address keeps it @smoke', async ({ page }) => {
    await openLibrary(page)
    await search(page).fill('zelda')
    await expect(page).toHaveURL(/[?&]q=zelda(&|$)/)
    await expect(totals(page)).toContainText(`${await matches(page, 'zelda')} games`)
    await expect(firstBox(page)).toHaveAccessibleName(/Zelda/)

    // The address is the state: a reload, or a link, shows the same.
    await page.reload()
    await expect(search(page)).toHaveValue('zelda')
    await expect(totals(page)).toContainText('9 games')
  })

  test('Back undoes a search as a whole, not a letter at a time', async ({ page }) => {
    await openLibrary(page)
    await search(page).pressSequentially('zelda', { delay: 40 })
    await expect(page).toHaveURL(/q=zelda/)
    await page.goBack()
    await expect(page).toHaveURL(/\/en\/library$/)
    await expect(search(page)).toHaveValue('')
    await expect(totals(page)).toContainText('230 games')
    await page.goForward()
    await expect(search(page)).toHaveValue('zelda')
  })

  test('a part it cannot understand is shown struck through, and the rest still applies', async ({
    page,
  }) => {
    await openLibrary(page, '/en/library?q=halo%3A3+zelda')
    const ignored = chips(page).locator('[data-ignored]')
    await expect(ignored).toHaveText(/halo:3/)
    await expect(ignored.locator('s')).toHaveText('halo:3')
    await expect(chips(page)).toContainText('Title: zelda')
    await expect(totals(page)).toContainText('9 games')

    await chips(page).getByRole('button', { name: 'Remove halo:3' }).click()
    await expect(search(page)).toHaveValue('zelda')
    await expect(ignored).toHaveCount(0)
  })

  test('the filter language: or, brackets, a dash for not', async ({ page }) => {
    const q = '(genre:rpg OR genre:strategy) -status:wishlist'
    await openLibrary(page, `/en/library?q=${encodeURIComponent(q)}`)
    await expect(totals(page)).toContainText(`${await matches(page, q)} games`)
    await expect(chips(page)).toContainText('Not status: Wishlist')
  })

  test('/ goes to the search from anywhere, and Escape empties it', async ({ page, size }) => {
    test.skip(size === 'phone', 'a phone has no keyboard')
    await openLibrary(page)
    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('/')
    await expect(search(page)).toBeFocused()
    await page.keyboard.type('zelda')
    await expect(page).toHaveURL(/q=zelda/)
    await page.keyboard.press('Escape')
    await expect(search(page)).toHaveValue('')
    await expect(page).toHaveURL(/\/en\/library$/)
  })

  test('the search in the header opens the library with it', async ({ page, size }) => {
    test.skip(size !== 'desktop', 'the header has room for a search field only on a desktop')
    await page.goto('/en/trophies')
    const field = page.getByRole('searchbox', { name: 'Search the library' })
    await field.fill('zelda')
    await field.press('Enter')
    await expect(page).toHaveURL(/\/en\/library\?q=zelda$/)
    await expect(search(page)).toHaveValue('zelda')
    await expect(totals(page)).toContainText('9 games')
  })
})

test.describe('the status row', () => {
  test('one tap sets the status, and All takes it away @smoke', async ({ page }) => {
    await openLibrary(page)
    const row = page.getByRole('radiogroup', { name: 'Status' })
    await expect(row.getByRole('radio', { name: 'All', exact: true })).toBeChecked()

    await row.getByRole('radio', { name: 'Playing, 6 games' }).click()
    await expect(search(page)).toHaveValue('status:playing')
    await expect(totals(page)).toContainText('6 games')
    await expect(row.getByRole('radio', { name: /^Playing/ })).toBeChecked()

    await row.getByRole('radio', { name: 'All', exact: true }).click()
    await expect(page).toHaveURL(/\/en\/library$/)
    await expect(totals(page)).toContainText('230 games')
  })

  test('its counts follow the rest of the filter', async ({ page }) => {
    await openLibrary(page, '/en/library?q=genre%3Arpg')
    const row = page.getByRole('radiogroup', { name: 'Status' })
    const playing = await matches(page, 'genre:rpg status:playing')
    await expect(row.getByRole('radio', { name: `Playing, ${playing} games` })).toBeVisible()
  })
})

test.describe('the chips (spec 3.1)', () => {
  test('one per condition, each removable, and Clear all', async ({ page }) => {
    await openLibrary(page, '/en/library?q=genre%3Arpg+-theme%3Ahorror')
    await expect(chips(page)).toContainText('Genre: Role-playing (RPG)')
    await expect(chips(page)).toContainText('Not theme: Horror')
    await expect(totals(page)).toContainText(
      `${await matches(page, 'genre:rpg -theme:horror')} games`,
    )

    await chips(page).getByRole('button', { name: 'Remove Not theme: Horror' }).click()
    await expect(search(page)).toHaveValue('genre:rpg')
    await expect(totals(page)).toContainText('86 games')

    await chips(page).getByRole('button', { name: 'Clear all' }).click()
    await expect(page).toHaveURL(/\/en\/library$/)
    await expect(chips(page)).toHaveCount(0)
  })

  test('when nothing matches, the page says so, and Clear all brings the games back', async ({
    page,
  }) => {
    await openLibrary(page, '/en/library?q=year%3A%3C1900')
    const empty = page.getByRole('status').filter({ hasText: 'No games match these filters.' })
    await expect(empty).toBeVisible()
    await expect(page.locator('.game-box')).toHaveCount(0)
    await empty.getByRole('button', { name: 'Clear all' }).click()
    await expect(firstBox(page)).toBeVisible()
    await expect(totals(page)).toContainText('230 games')
  })
})

test.describe('the filter panel (spec 5)', () => {
  test('includes and excludes values, and applies each at once @smoke', async ({ page }) => {
    await openLibrary(page)
    await openPanel(page)
    await expect(panel(page)).toBeVisible()

    const genre = await openSection(page, 'genre')
    await pick(genre, 'Role-playing (RPG)', 'include')
    await address(page).toBe('genre:rpg')
    await expect(panelCount(page)).toHaveText('86 games match')

    const theme = await openSection(page, 'theme')
    await pick(theme, 'Horror', 'exclude')
    await address(page).toBe('genre:rpg -theme:horror')
    const left = await matches(page, 'genre:rpg -theme:horror')
    await expect(panelCount(page)).toHaveText(`${left} games match`)

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Filters, 2 active' })).toBeVisible()
    await expect(totals(page)).toContainText(`${left} games`)
  })

  test('two values of one filter match either, or both', async ({ page }) => {
    await openLibrary(page)
    await openPanel(page)
    const genre = await openSection(page, 'genre')
    await pick(genre, 'Role-playing (RPG)', 'include')
    await pick(genre, 'Strategy', 'include')
    await address(page).toBe('genre:rpg,strategy')
    await expect(panelCount(page)).toHaveText(
      `${await matches(page, 'genre:rpg,strategy')} games match`,
    )

    await genre.getByRole('radio', { name: 'All of' }).click()
    await address(page).toBe('genre:rpg genre:strategy')
    await expect(panelCount(page)).toHaveText(
      `${await matches(page, 'genre:rpg genre:strategy')} games match`,
    )
  })

  test('a second group is joined to the first by OR', async ({ page }) => {
    await openLibrary(page)
    await openPanel(page)
    await pick(await openSection(page, 'status'), 'Playing', 'include')
    await panel(page).getByRole('button', { name: 'Add a group, joined by or' }).click()
    await expect(panel(page).getByRole('radio', { name: 'Group 2' })).toBeChecked()

    await pick(await openSection(page, 'format'), 'Physical', 'include')
    await address(page).toBe('status:playing OR format:physical')
    await expect(panelCount(page)).toHaveText(
      `${await matches(page, 'status:playing OR format:physical')} games match`,
    )

    // Each group is read back on its own.
    await panel(page).getByRole('radio', { name: 'Group 1' }).click()
    await expect(panel(page).locator('details[data-filter="status"] summary')).toContainText(
      'Playing',
    )
  })

  test('a range takes numbers, and says when it cannot read one', async ({ page }) => {
    await openLibrary(page)
    await openPanel(page)
    const rating = await openSection(page, 'rating')
    await rating.getByLabel('From').fill('9')
    await address(page).toBe('rating:>=9')
    await expect(panelCount(page)).toHaveText(`${await matches(page, 'rating:>=9')} games match`)

    await rating.getByLabel('To').fill('ten')
    await expect(rating.getByText('Type a number.')).toBeVisible()
    await address(page).toBe('rating:>=9')
  })

  test('keywords arrive only when they are asked for', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/library/keywords/')) asked.push(request.url())
    })
    await openLibrary(page)
    expect(asked).toEqual([])

    await openPanel(page)
    const keyword = await openSection(page, 'keyword')
    await keyword.getByLabel('Find a Keyword').fill('zombies')
    await pick(keyword, 'zombies', 'include')
    await address(page).toBe('keyword:zombies')
    await expect(panelCount(page)).toHaveText(
      `${await matches(page, 'keyword:zombies')} games match`,
    )
    expect(asked.length).toBeGreaterThan(0)
  })

  test('an address with a keyword is drawn with it from the start', async ({ page }) => {
    await openLibrary(page, '/en/library?q=keyword%3Azombies')
    await expect(totals(page)).toContainText(`${await matches(page, 'keyword:zombies')} games`)
    await expect(chips(page)).toContainText('Keyword: zombies')
  })
})

test.describe('the sort (spec 6)', () => {
  test('a key from the menu, and a button that reverses it @smoke', async ({ page }) => {
    await openLibrary(page, '/en/library?group=none')
    await page.getByRole('button', { name: /^Sort/ }).click()
    await page.getByRole('menuitemradio', { name: 'My rating' }).click()
    // Highest first: the way a rating is usually wanted.
    await expect(page).toHaveURL(/sort=-rating/)
    await expect(firstBox(page)).toHaveAccessibleName(
      new RegExp(`^${escape(await firstTitle(page, '-rating'))} `),
    )

    await page.getByRole('button', { name: 'My rating, descending' }).click()
    await expect(page).toHaveURL(/sort=rating(&|$)/)
    await expect(page.getByRole('button', { name: 'My rating, ascending' })).toBeVisible()
    await expect(firstBox(page)).toHaveAccessibleName(
      new RegExp(`^${escape(await firstTitle(page, 'rating'))} `),
    )

    await page.goBack()
    await expect(page).toHaveURL(/sort=-rating/)
  })

  test('Surprise me shuffles, and the address keeps the order', async ({ page }) => {
    await openLibrary(page, '/en/library?group=none')
    await page.getByRole('button', { name: /^Sort/ }).click()
    await page.getByRole('menuitemradio', { name: 'Surprise me' }).click()
    await expect(page).toHaveURL(/sort=random&seed=[a-z0-9]+/i)
    const seed = new URL(page.url()).searchParams.get('seed')
    const first = await firstBox(page).getAttribute('aria-label')

    await page.reload()
    await expect(firstBox(page)).toHaveAttribute('aria-label', first ?? '')

    await page.getByRole('button', { name: 'Shuffle again' }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('seed')).not.toBe(seed)
  })

  test('a heading in the list sorts by its column', async ({ page, size }) => {
    await openLibrary(page, '/en/library?view=list&group=none')
    const table = page.getByRole('table').first()
    const title = table.getByRole('columnheader', { name: 'Title' })
    await expect(title).toHaveAttribute('aria-sort', 'ascending')

    if (size === 'phone') {
      // The phone's list keeps the title, platforms and status.
      await title.getByRole('button').click()
      await expect(page).toHaveURL(/sort=-title/)
      await expect(title).toHaveAttribute('aria-sort', 'descending')
      return
    }
    const igdb = table.getByRole('columnheader', { name: 'IGDB' })
    await igdb.getByRole('button').click()
    await expect(page).toHaveURL(/sort=-igdb/)
    await expect(igdb).toHaveAttribute('aria-sort', 'descending')
    await expect(title).not.toHaveAttribute('aria-sort')
    await igdb.getByRole('button').click()
    await expect(page).toHaveURL(/sort=igdb(&|$)/)
    await expect(igdb).toHaveAttribute('aria-sort', 'ascending')
  })
})

test.describe('keyboard shortcuts (spec 3.11)', () => {
  test.beforeEach(({ size }) => {
    test.skip(size === 'phone', 'a phone has no keyboard')
  })

  test('? lists them; single letters can be turned off, and / still works', async ({ page }) => {
    await openLibrary(page)
    await page.keyboard.press('f')
    await expect(panel(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()

    await page.keyboard.press('?')
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(help).toBeVisible()
    await help.getByRole('switch', { name: 'Single-letter shortcuts' }).click()
    await page.keyboard.press('Escape')
    await expect(help).toBeHidden()

    await page.keyboard.press('f')
    await expect(panel(page)).toBeHidden()
    await page.keyboard.press('/')
    await expect(search(page)).toBeFocused()
  })
})
