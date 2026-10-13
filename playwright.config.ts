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

const projects: Project[] = browsers.flatMap((browserName) =>
  Object.entries(sizes).map(([size, options]) => ({
    name: `${browserName}-${size}`,
    use: { browserName, ...options },
    metadata: { size },
  })),
)

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
        // Tests run against a production build: `pnpm build` first.
        command: `pnpm start`,
        url: `${baseURL}/en`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
