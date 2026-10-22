/**
 * pnpm landing:share
 *
 * Writes the landing page's share pictures, `public/share/{locale}.jpg`: what a
 * link to Shelf shows in a chat or a post. Each is the page's own first screen
 * in the dark, its lights on, cut to the eyebrow, the headline and the shelf of
 * real covers, at the size those cards are drawn (1200 by 630).
 *
 * It photographs a running server (`pnpm serve:test`, or BASE_URL). Run it again
 * when the hero changes, and look at both pictures before committing them.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { chromium } from '@playwright/test'

import { routing } from '../src/i18n/routing.ts'
import { BASE_URL } from './lib/budgets.ts'

const out = resolve('public/share')
mkdirSync(out, { recursive: true })

// A card is a picture, not a page: no header, nothing that looks like it could be pressed.
const PICTURE_ONLY = `
  body > header, #landing-title ~ * { display: none !important; }
`

const browser = await chromium.launch()
for (const locale of routing.locales) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'dark',
    // Every bay lit at once, as the page ends.
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/${locale}`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: PICTURE_ONLY })
  await page.evaluate(() => document.fonts.ready)
  const file = `${out}/${locale}.jpg`
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 })
  console.log(`Wrote ${file}`)
  await context.close()
}
await browser.close()
