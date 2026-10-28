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

import { BASE_URL, javascriptBudgets, THREE_MARKERS, threeDBudget } from './lib/budgets.ts'

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

/**
 * The 3D bundle: the library on a desktop, once in 2D and once in 3D. What
 * the 3D visit fetches that the 2D one does not is the 3D shelf.
 */
const scriptsOf = async (dimension: '2d' | '3d'): Promise<Map<string, number>> => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // 3D is offered only with experimental views on (issue 63): on for both visits, so they differ only in 3D.
  await context.addInitScript((value) => {
    localStorage.setItem('shelf:experimental', 'on')
    localStorage.setItem('shelf:dimension', value)
  }, dimension)
  const page = await context.newPage()
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  const urls = new Map<string, string>()
  const sizes = new Map<string, number>()
  session.on('Network.responseReceived', (event) => {
    if (event.type === 'Script') urls.set(event.requestId, event.response.url)
  })
  session.on('Network.loadingFinished', (event) => {
    const url = urls.get(event.requestId)
    if (url) sizes.set(url, (sizes.get(url) ?? 0) + event.encodedDataLength)
  })
  await page.route('**/*', (route) =>
    route.request().headers()['next-router-prefetch'] ? route.abort() : route.continue(),
  )
  await page.goto(`${BASE_URL}${threeDBudget.path}`, { waitUntil: 'networkidle' })
  if (dimension === '3d') {
    // Drawn, or given way to 2D where this browser cannot draw it: either way it has loaded.
    await page
      .locator('[data-shelf-phase="3d"], [role="status"]')
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => {})
  }
  await context.close()
  return sizes
}

const flat = await scriptsOf('2d')
const deep = await scriptsOf('3d')
let threeD = 0
for (const [url, size] of deep) if (!flat.has(url)) threeD += size
const threeDKilobytes = threeD / 1024
const threeDOver = threeDKilobytes > threeDBudget.kilobytes || threeD === 0
failed ||= threeDOver
console.log(
  `${'3D shelf'.padEnd(10)} ${'when opened'.padEnd(14)} ${`${threeDKilobytes.toFixed(1)} KB of ${threeDBudget.kilobytes} KB`.padEnd(24)} ${threeD === 0 ? 'NOT LOADED' : threeDOver ? 'OVER BUDGET' : 'ok'}`,
)

await browser.close()
process.exit(failed ? 1 : 0)
