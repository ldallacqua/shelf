import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { AdminFacts, AdminRun } from '@/domain/admin/jobs'

import { AdminFrame, AdminGhost, AdminJobs, AdminLock, AdminOff, AdminRuns } from './admin-parts'

/**
 * The admin page (`/admin`), each of its states: asking the server, off, locked, and open with
 * its jobs and their runs. The numbers are made up.
 */

const NOW = Date.UTC(2026, 10, 10, 22, 0)
const minutes = (count: number) => count * 60_000

const facts: AdminFacts = {
  onSteam: 1_284,
  neverRead: 312,
  records: 2_406,
  oldestAsked: NOW - minutes(60 * 26),
  linked: 3,
}

const runs: AdminRun[] = [
  {
    id: 'running',
    job: 'steam-pages',
    state: 'running',
    steps: 2,
    checked: 2_150,
    changed: 1_904,
    startedAt: NOW - minutes(7),
    updatedAt: NOW - minutes(1),
  },
  {
    id: 'done',
    job: 'steam-pages-new',
    state: 'done',
    steps: 1,
    checked: 312,
    changed: 298,
    startedAt: NOW - minutes(60 * 3),
    updatedAt: NOW - minutes(60 * 3 - 2),
    finishedAt: NOW - minutes(60 * 3 - 2),
  },
  {
    id: 'failed',
    job: 'igdb',
    state: 'failed',
    steps: 3,
    checked: 1_500,
    changed: 41,
    startedAt: NOW - minutes(60 * 20),
    updatedAt: NOW - minutes(60 * 20 - 9),
    finishedAt: NOW - minutes(60 * 20 - 9),
    error: 'igdb: IGDB answered 429 three times.',
  },
  {
    id: 'stopped',
    job: 'everything',
    state: 'stopped',
    steps: 4,
    checked: 3_020,
    changed: 160,
    startedAt: NOW - minutes(60 * 24 * 2),
    updatedAt: NOW - minutes(60 * 24 * 2 - 12),
    finishedAt: NOW - minutes(60 * 24 * 2 - 12),
  },
  {
    id: 'stale',
    job: 'sync',
    state: 'running',
    steps: 0,
    checked: 0,
    changed: 0,
    startedAt: NOW - minutes(60 * 24 * 3),
    updatedAt: NOW - minutes(60 * 24 * 3),
  },
]

const nothing = () => undefined

const meta = {
  title: 'Features/Admin',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Built ahead as this, while the page asks the server whether it may open. */
export const Checking: Story = {
  render: () => (
    <AdminFrame>
      <AdminGhost />
    </AdminFrame>
  ),
}

/** The server has no password: nobody gets in. */
export const Off: Story = {
  render: () => (
    <AdminFrame>
      <AdminOff />
    </AdminFrame>
  ),
}

/** Asking for the password. */
export const Locked: Story = {
  render: () => (
    <AdminFrame>
      <AdminLock onUnlock={nothing} />
    </AdminFrame>
  ),
}

/** While the server checks it. */
export const Unlocking: Story = {
  render: () => (
    <AdminFrame>
      <AdminLock busy onUnlock={nothing} />
    </AdminFrame>
  ),
}

/** A wrong password, said in words and by the field's dashed border. */
export const WrongPassword: Story = {
  render: () => (
    <AdminFrame>
      <AdminLock problem="wrong" onUnlock={nothing} />
    </AdminFrame>
  ),
}

/** Open, before anything has run from here. */
export const NothingRunYet: Story = {
  render: () => (
    <AdminFrame onLock={nothing}>
      <AdminJobs facts={facts} runs={[]} now={NOW} onRun={nothing} />
      <AdminRuns runs={[]} now={NOW} onStop={nothing} />
    </AdminFrame>
  ),
}

/**
 * Open: a run going (its job can't be started twice), one done, one failed, one stopped, and one
 * whose steps stopped answering.
 */
export const Runs: Story = {
  render: () => (
    <AdminFrame onLock={nothing}>
      <AdminJobs facts={facts} runs={runs} now={NOW} onRun={nothing} />
      <AdminRuns runs={runs} now={NOW} onStop={nothing} />
    </AdminFrame>
  ),
}

/** A job just pressed, and a run being stopped. */
export const StartingAndStopping: Story = {
  render: () => (
    <AdminFrame onLock={nothing}>
      <AdminJobs facts={facts} runs={runs} now={NOW} starting="igdb" onRun={nothing} />
      <AdminRuns runs={runs} now={NOW} stopping="running" onStop={nothing} />
    </AdminFrame>
  ),
}

/** A start the server refused, or never answered. */
export const StartFailed: Story = {
  render: () => (
    <AdminFrame onLock={nothing}>
      <AdminJobs facts={facts} runs={[]} now={NOW} failed onRun={nothing} />
      <AdminRuns runs={[]} now={NOW} onStop={nothing} />
    </AdminFrame>
  ),
}
