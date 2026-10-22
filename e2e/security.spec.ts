import type { Page } from '@playwright/test'

import { expect, libraryViews, pages, test } from './fixtures'

/**
 * The security headers (architecture, section 20): what a page may load,
 * and that nothing the site does itself is refused by them.
 */

/** Every refusal the page's content security policy makes, as the page reports it. */
async function watchRefusals(page: Page): Promise<string[]> {
  const refused: string[] = []
  await page.exposeFunction('reportRefusal', (what: string) => refused.push(what))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { reportRefusal: (what: string) => void }).reportRefusal
      report(`${event.effectiveDirective} ${event.blockedURI}`)
    })
  })
  return refused
}

test.describe('security headers', () => {
  test('every answer says what a page may load, and that no other site may frame it', async ({
    request,
  }) => {
    for (const address of ['/en', '/en/no-such-page', '/api/v1/u/sample/library', '/robots.txt']) {
      const headers = (await request.get(address)).headers()
      const policy = headers['content-security-policy'] ?? ''
      expect(policy, address).toContain("frame-ancestors 'none'")
      expect(policy, address).toContain("object-src 'none'")
      expect(policy, address).toContain('img-src')
      expect(policy, address).not.toContain('unsafe-eval')
      expect(headers['x-content-type-options'], address).toBe('nosniff')
      expect(headers['referrer-policy'], address).toBe('strict-origin-when-cross-origin')
      expect(headers['x-frame-options'], address).toBe('DENY')
    }
  })

  test('nothing the site does is refused by its own policy', async ({ page }) => {
    const refused = await watchRefusals(page)
    for (const { path } of [...pages, ...libraryViews]) {
      await page.goto(`/en${path}`)
      await page.waitForLoadState('networkidle')
    }
    // A game's panel over the shelf, with its covers and screenshots.
    await page.goto('/en/u/sample')
    await page.getByRole('button', { name: /^Astro Bot/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(refused).toEqual([])
  })
})
