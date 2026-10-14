/**
 * pnpm perf:lighthouse
 *
 * Runs Lighthouse with its mobile profile against a running production server
 * and fails if a page misses the targets in the spec, section 16. Each page is
 * run three times and judged by the middle run, as Lighthouse's own notes on
 * variability advise. Throttling
 * is applied for real, and the processor's slowdown is set from how fast this
 * machine is; see scripts/lib/budgets.ts for why.
 *
 * Start the server first: pnpm build && pnpm start
 */
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { throttling as lighthouseThrottling } from 'lighthouse/core/config/constants.js'

import { BASE_URL, cpuSlowdownFor, lighthouseBudgets as budgets } from './lib/budgets.ts'

const PORT = 9333

/** Lighthouse's own slow-4G numbers. Only the processor's slowdown is ours to set. */
const mobileThrottling = lighthouseThrottling.mobileSlow4G

const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] })
let failed = false

const options = {
  port: PORT,
  output: 'json',
  logLevel: 'error',
  throttlingMethod: 'devtools',
} as const

// How fast is this machine? Lighthouse measures that on every run. One run
// that is not scored reads it, and warms the server up while it is there.
const warmUp = await lighthouse(`${BASE_URL}${budgets.paths[0]}`, {
  ...options,
  onlyAudits: ['first-contentful-paint'],
})
const benchmark = warmUp?.lhr.environment.benchmarkIndex ?? 0
const slowdown = cpuSlowdownFor(benchmark)
if (slowdown === undefined) {
  throw new Error(
    `This machine is too slow to stand in for a mid-range phone (benchmark ${Math.round(benchmark)}).`,
  )
}

console.log(`Lighthouse, mobile profile, at ${BASE_URL}`)
console.log(
  `This machine's benchmark is ${Math.round(benchmark)}: processor slowed ${slowdown.toFixed(1)} times\n`,
)

type Run = NonNullable<Awaited<ReturnType<typeof lighthouse>>>

/** The middle run of three, by performance score. One run of Lighthouse is a noisy thing to judge by. */
const RUNS = 3

for (const path of budgets.paths) {
  const runs: Run[] = []
  for (let run = 0; run < RUNS; run += 1) {
    const attempt = await lighthouse(`${BASE_URL}${path}`, {
      ...options,
      onlyCategories: ['performance', 'accessibility'],
      throttling: { ...mobileThrottling, cpuSlowdownMultiplier: slowdown },
    })
    if (!attempt) throw new Error(`Lighthouse returned nothing for ${path}`)
    runs.push(attempt)
  }
  const score = (run: Run) => run.lhr.categories.performance?.score ?? 0
  const result = runs.toSorted((a, b) => score(a) - score(b))[Math.floor(RUNS / 2)]
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

  console.log(
    `${path}   (runs scored ${runs.map((run) => Math.round(score(run) * 100)).join(', ')})`,
  )
  for (const [name, value, passed] of checks) {
    console.log(`  ${name.padEnd(14)} ${value.padEnd(30)} ${passed ? 'ok' : 'MISSED'}`)
    failed ||= !passed
  }
  // Not targets of their own, but they are what the performance score is made of.
  const parts: [string, string, string][] = [
    ['First paint', 'first-contentful-paint', 's'],
    ['Speed index', 'speed-index', 's'],
    ['Blocked', 'total-blocking-time', 'ms'],
  ]
  for (const [name, audit, unit] of parts) {
    const value = audits[audit]?.numericValue
    const score = audits[audit]?.score
    if (value === undefined) continue
    const shown = unit === 's' ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
    console.log(`  ${name.padEnd(14)} ${shown.padEnd(30)} ${Math.round((score ?? 0) * 100)}/100`)
  }
  console.log()
}

await browser.close()
process.exit(failed ? 1 : 0)
