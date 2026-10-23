import { expect, locales, pages, SHELF, sidewaysOverflow, test } from './fixtures'

/**
 * What a visitor sees while the server works on the rest: the part built
 * ahead of time, served alone, cut where the streamed part begins. Without
 * script, nothing replaces it.
 */
const beforeTheFirstBoxes = () =>
  test.describe('before the first boxes arrive', () => {
    test.use({ javaScriptEnabled: false })

    for (const path of ['/en/u/sample', '/pt-BR/u/sample/shelves/short-ones']) {
      test(`${path} still fits`, async ({ page }) => {
        const html = await (await page.request.get(path)).text()
        const streamed = html.indexOf('<div hidden id="S:')
        expect(streamed).toBeGreaterThan(0)
        await page.route(`**${path}`, (route) =>
          route.fulfill({ contentType: 'text/html', body: html.slice(0, streamed) }),
        )
        await page.goto(path, { waitUntil: 'load' })
        await expect(page.locator('.ghost-case').first()).toBeVisible()
        expect(await sidewaysOverflow(page)).toBe(0)
      })
    }
  })

test.describe('layout', () => {
  for (const { name, path } of pages) {
    for (const locale of locales) {
      test(`${name} does not scroll sideways, ${locale} @smoke`, async ({ page }) => {
        await page.goto(`/${locale}${path}`)
        expect(await sidewaysOverflow(page)).toBe(0)
      })
    }
  }

  test.describe('at 320 pixels wide', () => {
    test.use({ viewport: { width: 320, height: 640 } })

    for (const { name, path } of pages) {
      for (const locale of locales) {
        test(`${name} still fits, ${locale}`, async ({ page }) => {
          await page.goto(`/${locale}${path}`)
          expect(await sidewaysOverflow(page)).toBe(0)
          await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
          await expect(page.getByRole('button', { name: /^(Theme|Tema)$/ })).toBeInViewport()
        })
      }
    }

    beforeTheFirstBoxes()
  })

  // At each project's own width too: a tablet's toolbar wraps, and its ghosts must as well.
  beforeTheFirstBoxes()

  // Spines too, in the compact shelf (spec 13).
  for (const [name, path, density] of [
    ['the landing page', '', 'covers'],
    ['the shelf', SHELF, 'covers'],
    ['the compact shelf', SHELF, 'compact'],
    ['the wall', `${SHELF}?view=wall`, 'covers'],
    ['the list', `${SHELF}?view=list`, 'covers'],
    ['a game', `${SHELF}/game/bloodborne`, 'covers'],
    ['the trophies', `${SHELF}/trophies`, 'covers'],
  ] as const) {
    test(`every control on ${name} is at least 24 by 24 pixels`, async ({ page }) => {
      await page.addInitScript((chosen) => localStorage.setItem('shelf:density', chosen), density)
      await page.goto(`/en${path}`)
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], button, [role="radio"], [role="tab"]')]
          .filter((element) => {
            const box = element.getBoundingClientRect()
            if (box.width === 0 || box.height === 0) return false
            if (getComputedStyle(element).visibility === 'hidden') return false
            // A link inside a sentence is exempt: its line of text is the target.
            if (element.closest('p')) return false
            // Visually hidden until focused.
            if (element.classList.contains('sr-only')) return false
            // A list row's title, whose target is stretched over the whole row.
            if (element.classList.contains('game-link')) return false
            return box.width < 24 || box.height < 24
          })
          .map((element) => element.outerHTML.slice(0, 80)),
      )
      expect(small).toEqual([])
    })
  }
})
