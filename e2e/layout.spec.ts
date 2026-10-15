import { expect, locales, pages, sidewaysOverflow, test } from './fixtures'

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

    test.describe('before the first boxes arrive', () => {
      // What a visitor sees while the server works on the rest: the part built ahead of time,
      // served alone, cut where the streamed part begins. Without script, nothing replaces it.
      test.use({ javaScriptEnabled: false })

      for (const path of ['/en/library', '/en/shelves/short-ones']) {
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
  })

  test('every control is at least 24 by 24 pixels', async ({ page }) => {
    await page.goto('/en')
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button, [role="radio"]')]
        .filter((element) => {
          const box = element.getBoundingClientRect()
          if (box.width === 0 || box.height === 0) return false
          // A link inside a sentence is exempt: its line of text is the target.
          if (element.closest('p')) return false
          // Visually hidden until focused.
          if (element.classList.contains('sr-only')) return false
          return box.width < 24 || box.height < 24
        })
        .map((element) => element.outerHTML.slice(0, 80)),
    )
    expect(small).toEqual([])
  })
})
