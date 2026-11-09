import type { Page } from '@playwright/test'

import {
  expect,
  expectAccessible,
  isSnapshot,
  libraryKey,
  openLibrary,
  openWithTheme,
  shelfSettled,
  test,
  themes,
} from './fixtures'

/**
 * A game's page (spec 7), at its own address however it is reached (ADR 009).
 * Opened from the library, its cover grows out of its box; Back is the
 * library again, where it was left.
 */

/** The game's title: the page's one first-level heading that is shown. */
const title = (page: Page) => page.getByRole('heading', { level: 1 }).locator('visible=true')

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
      if (isSnapshot(request.url())) files.push(request.url())
    })
    await page.goto('/en/u/sample/game/bloodborne')

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
    const html = await (await page.request.get('/en/u/sample/game/bloodborne')).text()
    expect(html).toContain('<h1')
    expect(html).toContain('Bloodborne')
    await page.goto('/en/u/sample/game/bloodborne')
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
    expect(data.url).toMatch(/\/en\/u\/sample\/game\/bloodborne$/)
  })

  test('each value under Details opens the library filtered by it', async ({ page }) => {
    await page.goto('/en/u/sample/game/bloodborne')
    await page.getByRole('main').getByRole('link', { name: 'FromSoftware' }).last().click()
    await expect(page).toHaveURL(/\/en\/u\/sample\?q=developer%3Afromsoftware$/)
    await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveValue(
      'developer:fromsoftware',
    )
  })

  test('leads back to the library', async ({ page }) => {
    await page.goto('/en/u/sample/game/bloodborne')
    const back = page.getByRole('main').getByRole('link', { name: 'Library' })
    await expect(back).toHaveAttribute('href', '/en/u/sample')
  })

  test('marks IGDB’s English as English on the Portuguese site', async ({ page }) => {
    await page.goto('/pt-BR/u/sample/game/bloodborne')
    await expect(page.getByRole('heading', { name: 'Sobre' })).toBeVisible()
    await expect(page.getByText(/^An action RPG/).locator('xpath=..')).toHaveAttribute('lang', 'en')
  })

  test('an address with no game behind it says so, and is not indexed', async ({ page }) => {
    await page.goto('/en/u/sample/game/not-a-game')
    await expect(
      page.getByRole('main').getByText('There is no game at this address.'),
    ).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/Game not found/)
  })

  test('a visitor never sees a private note, in the page or in any file', async ({ page }) => {
    // The sample library gives Donkey Kong Country a note kept private.
    const note = 'Played it through twice, back to back.'
    const html = await (await page.request.get('/en/u/sample/game/donkey-kong-country')).text()
    expect(html).not.toContain(note)
    const api = await (await page.request.get('/api/v1/u/sample/games/donkey-kong-country')).json()
    expect(api.notes).toBeNull()
    const key = await libraryKey(page)
    const facts = await page.request.get(`/api/v1/libraries/${key}/games/0/donkey-kong-country`)
    expect(JSON.stringify(await facts.json())).not.toContain(note)
    // A public note is shown.
    await page.goto('/en/u/sample/game/bloodborne')
    await expect(
      page.getByText('Borrowed this years ago and finally bought my own copy.'),
    ).toBeVisible()
  })

  test('its screenshots open full screen, and the arrow keys step through them', async ({
    page,
  }) => {
    await page.goto('/en/u/sample/game/bloodborne')
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
    test(`from the ${view}, is its page; Back is the ${view} as it was`, async ({ page }) => {
      await openLibrary(page, `/en/u/sample?view=${view}&group=status`)
      await page.mouse.wheel(0, 600)
      const scrolled = await page.evaluate(() => window.scrollY)
      const box = firstGame(page, view)
      const key = await box.getAttribute('data-flip')
      const slug = key!.split(':')[0]!
      const name = (await box.getAttribute('aria-label'))!.split(',')[0]!
      await box.click()

      // The game's address is its own: the library's arrangement stays with the library.
      await expect(page).toHaveURL(new RegExp(`/en/u/sample/game/${slug}$`))
      await expect(title(page)).toHaveText(name)

      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`/en/u/sample\\?view=${view}&group=status$`))
      await expect(page.locator(`.library[data-view="${view}"]`)).toBeVisible()
      await expect(page.locator(`[data-flip="${key}"]`).first()).toBeFocused()
      expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)

      // Forward is the game again.
      await page.goForward()
      await expect(title(page)).toHaveText(name)
    })
  }

  test('its Library link is Back when the library was the page before @smoke', async ({ page }) => {
    await openLibrary(page, '/en/u/sample?q=bloodborne')
    await firstGame(page, 'shelf').click()
    await expect(title(page)).toHaveText('Bloodborne')
    const before = await page.evaluate(() => window.history.length)
    await page.getByRole('link', { name: 'Library' }).click()
    await expect(page).toHaveURL(/\/en\/u\/sample\?q=bloodborne$/)
    // A step back, not a new one.
    expect(await page.evaluate(() => window.history.length)).toBe(before)

    // Opened at its own address, the link leads to the library.
    await page.goto('/en/u/sample/game/bloodborne')
    await page.getByRole('link', { name: 'Library' }).click()
    await expect(page).toHaveURL(/\/en\/u\/sample$/)
  })

  test('draws what the library knows at once, and the rest when it arrives', async ({ page }) => {
    await openLibrary(page)
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    // The page's own answer from the server, held back.
    await page.route(
      (url) => url.pathname.includes('/game/'),
      async (route) => {
        await held
        await route.continue()
      },
    )
    await firstGame(page, 'shelf').click()
    await expect(title(page)).not.toBeEmpty()
    await expect(page.getByRole('heading', { name: 'Mine' })).toBeVisible()
    await expect(page.locator('article.game .ghost').first()).toBeAttached()
    release()
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(page.locator('article.game .ghost')).toHaveCount(0)
  })

  test('a value on it opens the library filtered by it', async ({ page }) => {
    await openLibrary(page, '/en/u/sample?q=bloodborne')
    await firstGame(page, 'shelf').click()
    await page.getByRole('link', { name: 'Role-playing (RPG)' }).click()
    await expect(page).toHaveURL(/\/en\/u\/sample\?q=genre%3Arpg$/)
    await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveValue(
      'genre:rpg',
    )
  })

  test('its cover grows out of its box, never flies back, and simply appears under reduced motion', async ({
    page,
  }) => {
    await countTransitions(page)
    await openLibrary(page)
    await firstGame(page, 'shelf').click()
    await expect(title(page)).not.toBeEmpty()
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

    // Out of its box, and not back: WebKit's page crashed as a cover flew home.
    await page.goBack()
    await expect(page.locator('.library')).toBeVisible()
    expect((await transitions(page)).count).toBe(opened.count)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await firstGame(page, 'shelf').click()
    await expect(title(page)).not.toBeEmpty()
    expect((await transitions(page)).count).toBe(opened.count)
  })

  test('the header is the same on the library and on a game, on a very wide window', async ({
    page,
    size,
  }) => {
    test.skip(size === 'phone', 'the window is set by the test, and a phone is never this wide')
    await page.setViewportSize({ width: 2560, height: 1440 })
    await openLibrary(page)
    const header = page.locator('header > div').first()
    const onLibrary = await header.boundingBox()
    await firstGame(page, 'shelf').click()
    await expect(title(page)).not.toBeEmpty()
    expect(await header.boundingBox()).toEqual(onLibrary)
  })

  test.describe('in 3D', () => {
    test.use({ dimension: '3d' })

    test('a box is pulled from the wall first, with its title and Open', async ({ page, size }) => {
      test.skip(size === 'phone', 'a phone is never offered 3D')
      await openLibrary(page)
      test.skip((await shelfSettled(page)) !== '3d', 'this browser could not draw the 3D shelf')
      const box = page.locator('[data-box]').first()
      const name = (await box.getAttribute('aria-label'))!.split(',')[0]!
      await box.focus()
      await page.keyboard.press('Enter')
      const pulled = page.getByRole('group', { name })
      await expect(pulled).toBeVisible()
      await expect(page).toHaveURL(/\/en\/u\/sample$/)

      await page.keyboard.press('Escape')
      await expect(pulled).toBeHidden()

      // Chosen again once pulled, it opens.
      await box.focus()
      await page.keyboard.press('Enter')
      await expect(pulled).toBeVisible()
      await box.focus()
      await page.keyboard.press('Enter')
      await expect(title(page)).toHaveText(name)
      await expect(page).toHaveURL(/\/en\/u\/sample\/game\//)
    })
  })

  test.describe('by the owner', () => {
    test.use({ signedIn: true })

    test('keeps its place while the editor arrives: what is below Mine never moves', async ({
      page,
    }) => {
      await openLibrary(page, '/en/u/sample?q=bloodborne')
      // Where "About" stands in the game's page after every change to the page, from the
      // first: on each change, not each frame, since WebKit draws few frames while it opens.
      await page.evaluate(() => {
        const record = window as unknown as { states: { offset: number; skeleton: boolean }[] }
        record.states = []
        new MutationObserver(() => {
          const article = [...document.querySelectorAll('article.game')].find(
            (each) => each.getClientRects().length > 0,
          )
          const about = [...(article?.querySelectorAll('h2') ?? [])].find(
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
      await expect(page.getByRole('group', { name: 'Status' })).toBeVisible()
      await expect(page.locator('article.game .ghost')).toHaveCount(0)
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
    test(`passes axe once opened, in ${theme}`, async ({ page }) => {
      await openWithTheme(page, '/en/u/sample', theme)
      await page.locator('[data-enter]').first().waitFor({ state: 'detached', timeout: 10_000 })
      await firstGame(page, 'shelf').click()
      await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
      await expectAccessible(page)
    })
  }
})
