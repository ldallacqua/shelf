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
