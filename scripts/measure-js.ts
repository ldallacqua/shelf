/**
 * pnpm perf:js
 *
 * Opens each page in a real browser against a running production server and
 * adds up the JavaScript that page downloads before it is idle: the first-load
 * cost a visitor pays. Fails if a page is over its budget, or if three.js
 * shows up in any first load.
 *
 * Start the server first: pnpm build && pnpm start
 */
import { chromium } from '@playwright/test'

import { BASE_URL, javascriptBudgets, THREE_MARKERS } from './lib/budgets.ts'

const browser = await chromium.launch()
let failed = false

console.log(`First-load JavaScript at ${BASE_URL} (compressed)\n`)

for (const budget of javascriptBudgets) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')

  const scripts = new Set<string>()
  let bytes = 0
  session.on('Network.responseReceived', (event) => {
    if (event.type === 'Script') scripts.add(event.requestId)
  })
  session.on('Network.loadingFinished', (event) => {
    if (scripts.has(event.requestId)) bytes += event.encodedDataLength
  })

  const bodies: string[] = []
  page.on('response', async (response) => {
    if (response.request().resourceType() !== 'script') return
    bodies.push(await response.text().catch(() => ''))
  })

  // Links in view prefetch the pages they point to, and that pulls in those
  // pages' JavaScript too. It is real traffic, but it is not what this page
  // needs, so prefetches are held back and each page is measured on its own.
  await page.route('**/*', (route) =>
    route.request().headers()['next-router-prefetch'] ? route.abort() : route.continue(),
  )

  await page.goto(`${BASE_URL}${budget.path}`, { waitUntil: 'networkidle' })

  const kilobytes = bytes / 1024
  const hasThree = bodies.some((body) => THREE_MARKERS.some((marker) => body.includes(marker)))
  const over = kilobytes > budget.kilobytes
  failed ||= over || hasThree

  const size = `${kilobytes.toFixed(1)} KB of ${budget.kilobytes} KB`
  const verdict = over ? 'OVER BUDGET' : 'ok'
  console.log(`${budget.name.padEnd(10)} ${budget.path.padEnd(14)} ${size.padEnd(24)} ${verdict}`)
  if (hasThree) console.log(`           three.js is in the first load of ${budget.path}`)

  await context.close()
}

await browser.close()
process.exit(failed ? 1 : 0)
