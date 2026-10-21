import type { Page } from '@playwright/test'

import {
  expect,
  expectAccessible,
  openLibrary,
  openWithTheme,
  shelfSettled,
  test,
  themes,
} from './fixtures'

/**
 * A game's page (spec 7): a full page at its own address, and the same page
 * over the shelf when a game is opened from the library. Back closes it, and
 * the shelf is where it was left.
 */

const panel = (page: Page) => page.getByRole('dialog')

/** The first game in a view: a box on the shelf, a cover on the wall, a title in the list. */
const firstGame = (page: Page, view: 'shelf' | 'wall' | 'list') =>
  page
    .locator(
      view === 'shelf'
        ? '.game-box[data-flip]'
        : view === 'wall'
          ? '.wall-box[data-flip]'
          : '.game-link[data-flip]',
    )
    .first()

/** Counts the view transitions the page asks the browser for, where it can make them. */
const countTransitions = (page: Page) =>
  page.addInitScript(() => {
    const record = window as unknown as { transitions: number }
    record.transitions = 0
    const start = document.startViewTransition?.bind(document)
    if (!start) return
    document.startViewTransition = ((update: () => void) => {
      record.transitions += 1
      return start(update)
    }) as typeof document.startViewTransition
  })

const transitions = (page: Page) =>
  page.evaluate(() => ({
    supported: 'startViewTransition' in document,
    count: (window as unknown as { transitions: number }).transitions,
  }))

test.describe("a game's own page", () => {
  test('arrives whole, without the library file @smoke', async ({ page }) => {
    const files: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/library/snapshot/')) files.push(request.url())
    })
    await page.goto('/en/game/bloodborne')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bloodborne')
    const main = page.getByRole('main')
    await expect(main).toContainText('An action RPG in which the player embodies a Hunter')
    await expect(main.getByRole('heading', { name: 'Mine' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'PlayStation 4, Digital' })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Details' })).toBeVisible()
    expect(files).toEqual([])
    // A game is part of the library.
    if ((await page.getByRole('navigation', { name: 'Main' }).count()) > 0) {
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }),
      ).toHaveAttribute('aria-current', 'page')
    }
  })

  test('is in the HTML, with what it is for search engines', async ({ page }) => {
    const html = await (await page.request.get('/en/game/bloodborne')).text()
    expect(html).toContain('<h1')
    expect(html).toContain('Bloodborne')
    await page.goto('/en/game/bloodborne')
    const data = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    )
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: 'Bloodborne',
      datePublished: '2015-03-24',
      gamePlatform: ['PlayStation 4'],
    })
    expect(data.url).toMatch(/\/en\/game\/bloodborne$/)
  })

  test('each value under Details opens the library filtered by it', async ({ page }) => {
    await page.goto('/en/game/bloodborne')
    await page.getByRole('main').getByRole('link', { name: 'FromSoftware' }).last().click()
    await expect(page).toHaveURL(/\/en\/library\?q=developer%3Afromsoftware$/)
    await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveValue(
      'developer:fromsoftware',
    )
  })

  test('leads back to the library, to the shelf it was opened on', async ({ page }) => {
    await page.goto('/en/game/bloodborne')
    await expect(page.getByRole('link', { name: 'Library', exact: true }).first()).toBeVisible()
    await page.goto('/en/game/bloodborne?view=wall&q=genre%3Arpg')
    const back = page.getByRole('main').getByRole('link', { name: 'Library' })
    await expect(back).toHaveAttribute('href', '/en/library?q=genre%3Arpg&view=wall')
  })

  test('marks IGDB’s English as English on the Portuguese site', async ({ page }) => {
    await page.goto('/pt-BR/game/bloodborne')
    await expect(page.getByRole('heading', { name: 'Sobre' })).toBeVisible()
    await expect(page.getByText(/^An action RPG/).locator('xpath=..')).toHaveAttribute('lang', 'en')
  })

  test('an address with no game behind it says so, and is not indexed', async ({ page }) => {
    await page.goto('/en/game/not-a-game')
    await expect(
      page.getByRole('main').getByText('There is no game at this address.'),
    ).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/Game not found/)
  })

  test('a visitor never sees a private note, in the page or in any file', async ({ page }) => {
    // The sample library gives Donkey Kong Country a note kept private.
    const note = 'Played it through twice, back to back.'
    const html = await (await page.request.get('/en/game/donkey-kong-country')).text()
    expect(html).not.toContain(note)
    const api = await (await page.request.get('/api/v1/games/donkey-kong-country')).json()
    expect(api.notes).toBeNull()
    const facts = await page.request.get('/api/v1/library/games/0/donkey-kong-country')
    expect(JSON.stringify(await facts.json())).not.toContain(note)
    // A public note is shown.
    await page.goto('/en/game/bloodborne')
    await expect(
      page.getByText('Borrowed this years ago and finally bought my own copy.'),
    ).toBeVisible()
  })

  test('its screenshots open full screen, and the arrow keys step through them', async ({
    page,
  }) => {
    await page.goto('/en/game/bloodborne')
    await page.getByRole('button', { name: /^Screenshot 1 of \d+ from Bloodborne/ }).click()
    const viewer = page.getByRole('dialog', { name: 'Screenshots from Bloodborne' })
    const count = viewer.locator('[aria-live]')
    await expect(count).toHaveText(/^1 of \d+$/)
    await page.keyboard.press('ArrowRight')
    await expect(count).toHaveText(/^2 of \d+$/)
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
  })
})

test.describe('a game opened from the library', () => {
  for (const view of ['shelf', 'wall', 'list'] as const) {
    test(`from the ${view}, sits over it; Back closes it and the ${view} is as it was`, async ({
      page,
    }) => {
      await openLibrary(page, `/en/library?view=${view}&group=status`)
      const box = firstGame(page, view)
      const key = await box.getAttribute('data-flip')
      const slug = key!.split(':')[0]!
      await box.click()

      await expect(page).toHaveURL(new RegExp(`/en/game/${slug}\\?view=${view}&group=status$`))
      await expect(panel(page)).toBeVisible()
      await expect(panel(page).getByRole('heading', { level: 2 })).not.toBeEmpty()
      // The library behind keeps its view and grouping while the game is open.
      await expect(page.locator(`.library[data-view="${view}"]`)).toBeAttached()

      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`/en/library\\?view=${view}&group=status$`))
      await expect(panel(page)).toBeHidden()
      await expect(page.locator(`[data-flip="${key}"]`).first()).toBeFocused()

      // Forward opens it again.
      await page.goForward()
      await expect(panel(page)).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/en/game/${slug}`))
    })
  }

  test('its cover does not fly home, by the close button or by Back', async ({ page }) => {
    await countTransitions(page)
    await openLibrary(page, '/en/library?view=wall')
    test.skip(!(await transitions(page)).supported, 'this browser has no view transitions')
    const box = firstGame(page, 'wall')
    const ways = [
      () => panel(page).getByRole('button', { name: 'Close' }).click(),
      () => page.goBack(),
    ]
    for (const close of ways) {
      const before = (await transitions(page)).count
      await box.click()
      await expect(panel(page)).toBeVisible()
      await expect(page.locator('html')).not.toHaveAttribute('data-morph')
      await close()
      await expect(panel(page)).toBeHidden()
      await expect(page).toHaveURL(/\/en\/library\?view=wall$/)
      // Out of its box, and not back: WebKit's page crashed as a cover flew home.
      expect((await transitions(page)).count).toBe(before + 1)
    }
  })

  test('the close button steps back out of history, as Back does @smoke', async ({ page }) => {
    await openLibrary(page)
    await firstGame(page, 'shelf').click()
    await expect(panel(page)).toBeVisible()
    await panel(page).getByRole('button', { name: 'Close' }).click()
    await expect(panel(page)).toBeHidden()
    await expect(page).toHaveURL(/\/en\/library$/)
    // Opening another game afterwards is a new step, closed by one Back.
    await firstGame(page, 'shelf').click()
    await expect(page).toHaveURL(/\/en\/game\//)
    await page.goBack()
    await expect(page).toHaveURL(/\/en\/library$/)
  })

  test('the arrow keys step through the library’s order in one step of history', async ({
    page,
  }) => {
    await openLibrary(page, '/en/library?group=none')
    const keys = await page
      .locator('.game-box[data-flip]')
      .evaluateAll((boxes) => boxes.slice(0, 2).map((box) => (box as HTMLElement).dataset.flip!))
    // A box's key is its game, and the copy it stands for.
    const [first, second] = keys.map((key) => key.split(':')[0]!)
    await page.locator(`[data-flip="${keys[0]}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/en/game/${first}\\?group=none$`))
    // The address changes as the game is asked for; the keys work once it is open.
    await expect(panel(page).getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(new RegExp(`/en/game/${second}\\?group=none$`))
    await page.goBack()
    await expect(panel(page)).toBeHidden()
    await expect(page).toHaveURL(/\/en\/library\?group=none$/)
  })

  test('draws what the library knows at once, and the rest when it arrives', async ({ page }) => {
    await openLibrary(page)
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/library/games/**', async (route) => {
      await held
      await route.continue()
    })
    await firstGame(page, 'shelf').click()
    await expect(panel(page).getByRole('heading', { name: 'Mine' })).toBeVisible()
    await expect(panel(page).locator('.ghost').first()).toBeAttached()
    release()
    await expect(panel(page).getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(panel(page).locator('.ghost')).toHaveCount(0)
  })

  test('a value in it opens the library filtered by it, and the game closes', async ({ page }) => {
    await openLibrary(page, '/en/library?q=bloodborne')
    await firstGame(page, 'shelf').click()
    await panel(page).getByRole('link', { name: 'Role-playing (RPG)' }).click()
    await expect(page).toHaveURL(/\/en\/library\?q=genre%3Arpg$/)
    await expect(panel(page)).toBeHidden()
    await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveValue(
      'genre:rpg',
    )
  })

  test('its full page takes the place of the panel, and Back is the library again', async ({
    page,
  }) => {
    await openLibrary(page, '/en/library?q=bloodborne')
    await firstGame(page, 'shelf').click()
    await panel(page).getByRole('link', { name: 'Open the full page' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bloodborne')
    await expect(panel(page)).toBeHidden()
    await expect(page).toHaveURL(/\/en\/game\/bloodborne\?q=bloodborne$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/en\/library\?q=bloodborne$/)
  })

  test('its cover grows out of its box, and simply appears under reduced motion', async ({
    page,
  }) => {
    await countTransitions(page)
    await openLibrary(page)
    await firstGame(page, 'shelf').click()
    await expect(panel(page)).toBeVisible()
    const opened = await transitions(page)
    if (opened.supported) {
      expect(opened.count).toBe(1)
      // Nothing is left named once it has landed.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              [...document.querySelectorAll<HTMLElement>('*')].filter(
                (element) => element.style.viewTransitionName,
              ).length,
          ),
        )
        .toBe(0)
    }

    // Once the cover has landed the panel stays where it is: its own entrance,
    // held off while the cover flew, does not start over behind it.
    await expect(page.locator('html')).not.toHaveAttribute('data-morph')
    const moving = await page.evaluate(async () => {
      const seen = new Set<string>()
      for (let frame = 0; frame < 12; frame += 1) {
        await new Promise(requestAnimationFrame)
        for (const element of document.querySelectorAll('[data-slot^="sheet"]')) {
          for (const animation of element.getAnimations()) {
            if (animation.playState === 'running')
              seen.add((animation as CSSAnimation).animationName)
          }
        }
      }
      return [...seen]
    })
    expect(moving).toEqual([])

    await page.goBack()
    await expect(panel(page)).toBeHidden()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const before = (await transitions(page)).count
    await firstGame(page, 'shelf').click()
    await expect(panel(page)).toBeVisible()
    expect((await transitions(page)).count).toBe(before)
  })

  test.describe('in 3D', () => {
    test.use({ dimension: '3d' })

    test('the box pulled from the wall is its cover', async ({ page, size }) => {
      test.skip(size === 'phone', 'a phone is never offered 3D')
      await openLibrary(page)
      test.skip((await shelfSettled(page)) !== '3d', 'this browser could not draw the 3D shelf')
      await page.locator('[data-box]').first().focus()
      await page.keyboard.press('Enter')
      await expect(panel(page)).toBeVisible()
      await expect(page).toHaveURL(/\/en\/game\//)
      await expect(panel(page).locator('[data-hero-cover]')).toHaveCount(0)
    })
  })

  test.describe('by the owner', () => {
    test.use({ signedIn: true })

    test('keeps its place while the editor arrives: what is below Mine never moves', async ({
      page,
    }) => {
      await openLibrary(page, '/en/library?q=bloodborne')
      // Where "About" stands in the game's page after every change to the page, from the
      // first: on each change, not each frame, since WebKit draws few frames while it opens.
      await page.evaluate(() => {
        const record = window as unknown as { states: { offset: number; skeleton: boolean }[] }
        record.states = []
        new MutationObserver(() => {
          const article = document.querySelector('[role="dialog"] article')
          const about = [...(article?.querySelectorAll('h3') ?? [])].find(
            (heading) => heading.textContent === 'About',
          )
          if (!article || !about) return
          record.states.push({
            offset: Math.round(
              about.getBoundingClientRect().top - article.getBoundingClientRect().top,
            ),
            skeleton: article.querySelector('[data-mine-skeleton]') !== null,
          })
        }).observe(document.body, { childList: true, subtree: true })
      })
      await firstGame(page, 'shelf').click()
      await expect(panel(page).getByRole('group', { name: 'Status' })).toBeVisible()
      await expect(panel(page).locator('.ghost')).toHaveCount(0)
      const states = await page.evaluate(
        () => (window as unknown as { states: { offset: number; skeleton: boolean }[] }).states,
      )
      // The editor's shape stood in for it, and the editor took exactly its room.
      expect(states.some((state) => state.skeleton)).toBe(true)
      const settled = states.at(-1)!
      expect(settled.skeleton).toBe(false)
      for (const state of states)
        expect(Math.abs(state.offset - settled.offset)).toBeLessThanOrEqual(2)
    })
  })

  for (const theme of themes) {
    test(`passes axe while open, in ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/library', theme)
      await page.locator('[data-enter]').first().waitFor({ state: 'detached', timeout: 10_000 })
      await firstGame(page, 'shelf').click()
      await expect(panel(page)).toBeVisible()
      await expect(panel(page).getByRole('heading', { name: 'Details' })).toBeVisible()
      await expectAccessible(page, '[role="dialog"]')
    })
  }
})
