import { defineConfig, type Project } from '@playwright/test'

const PORT = 3300
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`

/**
 * Three engines at three widths: nine projects.
 * The widths are the ones the spec reviews at: phone 390, tablet 820, desktop 1440.
 * Device pixel ratio stays at 1 so reference screenshots are small and stable.
 */
const browsers = ['chromium', 'firefox', 'webkit'] as const
const sizes = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false },
} as const

/** Tests that add, change or remove games. */
const WRITES = /\.writes\.spec\.ts$/

const reading: Project[] = browsers.flatMap((browserName) =>
  Object.entries(sizes).map(([size, options]) => ({
    name: `${browserName}-${size}`,
    use: { browserName, ...options },
    metadata: { size },
    testIgnore: WRITES,
  })),
)

/**
 * The same nine, for the tests that change the library. They start once
 * every test that reads it has finished, so no count or shelf a reading
 * test checks can change under it. Run one alone with `--no-deps`.
 */
const writing: Project[] = reading.map((project) => ({
  ...project,
  name: `${project.name}-writes`,
  testIgnore: undefined,
  testMatch: WRITES,
  dependencies: reading.map((each) => each.name!),
}))

const projects = [...reading, ...writing]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Reference screenshots are made on Linux only, so their names carry no platform.
  snapshotPathTemplate: 'e2e/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL,
    locale: 'en-US',
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects,
  webServer: process.env.BASE_URL
    ? undefined
    : {
        // Tests run against a production build: `pnpm build` first. IGDB, Twitch and
        // GitHub are answered by test doubles inside the server, and it serves a
        // fresh copy of the database, which the tests that add games write to.
        command: `pnpm serve:test`,
        url: `${baseURL}/en`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
