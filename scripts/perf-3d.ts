/**
 * pnpm perf:3d
 *
 * How fast the 3D shelf draws on this machine's own graphics card: the frame
 * times while the camera walks the length of the wall and the pointer sweeps
 * across the boxes, and what the scene reports about itself (draw calls,
 * texture memory). The target is 60 frames a second with 500 games on a
 * mid-range laptop (spec 3.6), so the middle frame must take under 16.7 ms.
 *
 * Test browsers draw WebGL in software, which says nothing about a real
 * screen, so this one asks for the graphics card. Measure the stress set:
 *
 *   pnpm seed stress && pnpm build && pnpm start
 *   pnpm perf:3d
 *   pnpm seed && pnpm build        (back to the default set)
 */
import { chromium } from '@playwright/test'

import { BASE_URL } from './lib/budgets.ts'

/** 60 frames a second. */
const FRAME_MS = 1000 / 60
const DRAW_CALLS = 40
const TEXTURE_BYTES = 256 * 1024 * 1024

const browser = await chromium.launch({
  args: ['--enable-gpu', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  localStorage.setItem('shelf:dimension', '3d')
  window.__shelf3dProbe = {}
})
const page = await context.newPage()
await page.goto(`${BASE_URL}/en/library`)
await page.locator('[data-shelf-phase="3d"]').waitFor({ timeout: 60_000 })
await page.waitForTimeout(1500)

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown'
})

/** Frame times, in milliseconds, while `act` runs. */
const framesDuring = async (act: () => Promise<void>): Promise<number[]> => {
  await page.evaluate(() => {
    const times: number[] = []
    let last = performance.now()
    const tick = (now: number) => {
      times.push(now - last)
      last = now
      if ((window as { __recording?: boolean }).__recording) requestAnimationFrame(tick)
    }
    ;(window as { __recording?: boolean; __times?: number[] }).__recording = true
    ;(window as { __times?: number[] }).__times = times
    requestAnimationFrame(tick)
  })
  await act()
  return page.evaluate(() => {
    ;(window as { __recording?: boolean }).__recording = false
    return ((window as { __times?: number[] }).__times ?? []).slice(1)
  })
}

const canvas = (await page.locator('.shelf-3d-canvas').boundingBox())!
const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }

// The camera walks the wall end to end and back, as fast as a wheel turns.
const walking = await framesDuring(async () => {
  await page.mouse.move(middle.x, middle.y)
  for (const direction of [1, -1]) {
    for (let step = 0; step < 90; step += 1) {
      await page.mouse.wheel(0, 120 * direction)
      await page.waitForTimeout(16)
    }
  }
  await page.waitForTimeout(600)
})

// The pointer sweeps across the boxes, so they come forward and the LEDs glide.
const pointing = await framesDuring(async () => {
  for (let sweep = 0; sweep < 3; sweep += 1) {
    for (let at = 0; at <= 60; at += 1) {
      const across = sweep % 2 === 0 ? at / 60 : 1 - at / 60
      await page.mouse.move(
        canvas.x + canvas.width * (0.05 + across * 0.9),
        canvas.y + canvas.height * (0.3 + sweep * 0.2),
      )
      await page.waitForTimeout(16)
    }
  }
  await page.waitForTimeout(600)
})

const stats = (await page.evaluate(() => window.__shelf3dProbe)) as {
  boxes: number
  calls: number
  textureBytes: number
  pixelRatio: number
}
await browser.close()

const percentile = (values: number[], share: number) => {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
}

let failed = false
console.log(`3D shelf at ${BASE_URL}, ${stats.boxes} boxes, on ${gpu}\n`)
for (const [name, times] of [
  ['Walking', walking],
  ['Pointing', pointing],
] as const) {
  const median = percentile(times, 0.5)
  const slow = percentile(times, 0.95)
  const ok = median <= FRAME_MS + 0.5
  failed ||= !ok
  console.log(
    `${name.padEnd(9)} middle frame ${median.toFixed(1)} ms, 95th ${slow.toFixed(1)} ms, ${times.length} frames   ${ok ? 'ok' : 'SLOW'}`,
  )
}
const calls = stats.calls < DRAW_CALLS
const memory = stats.textureBytes < TEXTURE_BYTES
failed ||= !calls || !memory
console.log(`Draw calls  ${stats.calls} (under ${DRAW_CALLS})   ${calls ? 'ok' : 'OVER'}`)
console.log(
  `Textures    ${(stats.textureBytes / 1024 / 1024).toFixed(0)} MB (under ${TEXTURE_BYTES / 1024 / 1024} MB)   ${memory ? 'ok' : 'OVER'}`,
)
console.log(`Resolution  ${stats.pixelRatio}× (it steps down if frames run slow)`)
process.exit(failed ? 1 : 0)
