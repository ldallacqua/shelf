/**
 * pnpm perf:lighthouse
 *
 * Runs Lighthouse with its mobile profile against a running production server
 * and fails if a page misses the targets in the spec, section 16. Throttling
 * is applied for real; see scripts/lib/budgets.ts for why.
 *
 * Start the server first: pnpm build && pnpm start
 */
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'

import { BASE_URL, lighthouseBudgets as budgets } from './lib/budgets.ts'

const PORT = 9333

const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] })
let failed = false

console.log(`Lighthouse, mobile profile, at ${BASE_URL}\n`)

for (const path of budgets.paths) {
  const result = await lighthouse(`${BASE_URL}${path}`, {
    port: PORT,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility'],
    throttlingMethod: 'devtools',
  })
  if (!result) throw new Error(`Lighthouse returned nothing for ${path}`)

  const { categories, audits } = result.lhr
  const performance = Math.round((categories.performance?.score ?? 0) * 100)
  const accessibility = Math.round((categories.accessibility?.score ?? 0) * 100)
  const paint = audits['largest-contentful-paint']?.numericValue ?? Infinity
  const shift = audits['cumulative-layout-shift']?.numericValue ?? Infinity

  const checks: [string, string, boolean][] = [
    [
      'Performance',
      `${performance} (at least ${budgets.performance})`,
      performance >= budgets.performance,
    ],
    [
      'Accessibility',
      `${accessibility} (at least ${budgets.accessibility})`,
      accessibility >= budgets.accessibility,
    ],
    [
      'Largest paint',
      `${(paint / 1000).toFixed(2)} s (at most ${budgets.largestContentfulPaintMs / 1000} s)`,
      paint <= budgets.largestContentfulPaintMs,
    ],
    [
      'Layout shift',
      `${shift.toFixed(3)} (at most ${budgets.cumulativeLayoutShift})`,
      shift <= budgets.cumulativeLayoutShift,
    ],
  ]

  console.log(path)
  for (const [name, value, passed] of checks) {
    console.log(`  ${name.padEnd(14)} ${value.padEnd(30)} ${passed ? 'ok' : 'MISSED'}`)
    failed ||= !passed
  }
  console.log()
}

await browser.close()
process.exit(failed ? 1 : 0)
