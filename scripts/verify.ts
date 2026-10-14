/**
 * pnpm verify
 *
 * Every check, run on this machine. CI on GitHub runs nothing by itself:
 * Actions minutes on a private repository are limited, and the full set of
 * checks took about 75 of the month's 2,000 each time. A build step is done
 * when this passes on its last commit.
 *
 *   1. Format, lint, types, translations, unit and component tests (pnpm check)
 *   2. A production build, served on port 3300 with the IGDB test doubles
 *   3. JavaScript budgets
 *   4. The browser tests: three engines at three widths
 *   5. The Linux pass, in Playwright's Docker image: WebKit as CI ran it
 *      (Linux WebKit is not Safari) and the reference screenshots, which are
 *      made on Linux because text renders differently on a Mac
 *   6. Lighthouse, mobile profile
 *   7. The Storybook build
 *
 *   --quick               steps 1 to 3 and the @smoke browser tests in Chromium
 *   --skip-linux          no Docker pass (it needs Docker running)
 *   --update-screenshots  the Linux pass makes new reference screenshots
 *                         instead of comparing; look at them, then commit them
 *
 * Stops at the first step that fails.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { BASE_URL } from './lib/budgets.ts'

const flags = new Set(process.argv.slice(2))
const quick = flags.has('--quick')
const linux = !quick && !flags.has('--skip-linux')
const updateScreenshots = flags.has('--update-screenshots')
const windows = process.platform === 'win32'
/** On Windows pnpm is a .cmd file, which Node starts only through a shell. */
const shellFor = (command: string) => windows && command === 'pnpm'

const { devDependencies } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  devDependencies: Record<string, string>
}
/** Playwright's image must match the installed version. */
const IMAGE = `mcr.microsoft.com/playwright:v${devDependencies['@playwright/test']}-noble`

const answers = async (url: string): Promise<boolean> => {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

const done: { step: string; seconds: number }[] = []

const run = (step: string, command: string, args: string[], env: Record<string, string> = {}) => {
  console.log(`\n── ${step}\n`)
  const started = performance.now()
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: shellFor(command),
  })
  if (result.status !== 0) {
    stopServer()
    console.error(
      `\n✗ ${step} failed. Earlier steps passed: ${done.map((d) => d.step).join(', ') || 'none'}.`,
    )
    process.exit(result.status ?? 1)
  }
  done.push({ step, seconds: Math.round((performance.now() - started) / 1000) })
}

let server: ReturnType<typeof spawn> | undefined
const stopServer = () => {
  // The server is started in a group of its own, so pnpm and the Next.js server it starts both stop.
  // Windows has no process groups; taskkill stops the whole tree instead.
  if (server?.pid && windows) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' })
  } else if (server?.pid) process.kill(-server.pid, 'SIGTERM')
  server = undefined
}
process.on('SIGINT', () => {
  stopServer()
  process.exit(130)
})

if (await answers(`${BASE_URL}/en`)) {
  console.error(
    `Something already answers at ${BASE_URL}. Stop it first: verify builds and serves its own, so it never checks an older build.`,
  )
  process.exit(1)
}

run('Format, lint, types, translations, unit and component tests', 'pnpm', ['check'])
run('Production build', 'pnpm', ['build'])

console.log(`\n── Serving the build at ${BASE_URL}\n`)
server = spawn('pnpm', ['start'], {
  env: { ...process.env, SHELF_MOCKS: '1' },
  stdio: 'ignore',
  detached: !windows,
  shell: shellFor('pnpm'),
  windowsHide: true,
})
const deadline = Date.now() + 60_000
while (!(await answers(`${BASE_URL}/en`))) {
  if (Date.now() > deadline) {
    stopServer()
    console.error('The server did not start within a minute.')
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

const browserEnv = { BASE_URL }
run('JavaScript budgets', 'pnpm', ['perf:js'])

if (quick) {
  run(
    'Smoke tests in Chromium, phone and desktop',
    'pnpm',
    ['e2e', '--project=chromium-phone', '--project=chromium-desktop', '--grep', '@smoke'],
    browserEnv,
  )
} else {
  run('Browser tests: three engines at three widths', 'pnpm', ['e2e'], browserEnv)

  if (linux) {
    const docker = spawnSync('docker', ['info'], { stdio: 'ignore' })
    if (docker.status !== 0) {
      stopServer()
      console.error(
        '\nDocker is not running. Start it, or pass --skip-linux and say so in the summary.',
      )
      process.exit(1)
    }
    const test = 'node node_modules/@playwright/test/cli.js test --output=/tmp/results'
    const screenshots = updateScreenshots ? ' --update-snapshots' : ''
    run('Linux pass: WebKit at three widths, and the reference screenshots', 'docker', [
      'run',
      '--rm',
      '--ipc=host',
      '-e',
      `BASE_URL=${BASE_URL.replace('localhost', 'host.docker.internal')}`,
      '-v',
      `${process.cwd()}:/work:ro`,
      // The only place the pass writes to, and only when asked to make new screenshots.
      '-v',
      `${process.cwd()}/e2e/__screenshots__:/work/e2e/__screenshots__${updateScreenshots ? '' : ':ro'}`,
      IMAGE,
      'bash',
      '-c',
      [
        'cd /work',
        `${test} --project=webkit-phone --project=webkit-tablet --project=webkit-desktop --grep-invert @visual`,
        `${test} e2e/visual.spec.ts --project=chromium-phone --project=chromium-desktop${screenshots}`,
      ].join(' && '),
    ])
  }

  run('Lighthouse, mobile profile', 'pnpm', ['perf:lighthouse'])
  stopServer()
  run('Storybook build', 'pnpm', ['storybook:build', '--quiet'])
}

stopServer()
console.log('\n✓ Every step passed\n')
for (const { step, seconds } of done) console.log(`  ${String(seconds).padStart(4)} s  ${step}`)
if (!quick && !linux) console.log('\n  The Linux pass was skipped.')
