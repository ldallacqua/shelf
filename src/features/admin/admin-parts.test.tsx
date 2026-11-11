import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AdminFacts, AdminRun } from '@/domain/admin/jobs'
import { renderWithIntl } from '@/test/render'

import { AdminJobs, AdminLock, AdminRuns } from './admin-parts'

const NOW = Date.UTC(2026, 10, 10, 22, 0)
const facts: AdminFacts = { onSteam: 40, neverRead: 3, records: 90, linked: 1 }

const run = (over: Partial<AdminRun>): AdminRun => ({
  id: 'run',
  job: 'steam-pages',
  state: 'running',
  steps: 1,
  checked: 120,
  changed: 30,
  startedAt: NOW - 120_000,
  updatedAt: NOW - 60_000,
  ...over,
})

describe('the admin page', () => {
  it('hands the typed password over, and says when it is wrong, not by color alone', async () => {
    const onUnlock = vi.fn()
    const { unmount } = renderWithIntl(<AdminLock onUnlock={onUnlock} />)
    await userEvent.type(screen.getByLabelText('Password'), 'opensesame')
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(onUnlock).toHaveBeenCalledWith('opensesame')

    unmount()
    renderWithIntl(<AdminLock problem="wrong" onUnlock={onUnlock} />)
    expect(screen.getByRole('alert')).toHaveTextContent('That isn’t the password.')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('starts a job, and offers none that is running already', async () => {
    const onRun = vi.fn()
    renderWithIntl(<AdminJobs facts={facts} runs={[run({})]} now={NOW} onRun={onRun} />)
    const running = screen.getByRole('button', { name: 'Running', description: 'Every Steam page' })
    expect(running).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Run', description: 'Steam scores' }))
    expect(onRun).toHaveBeenCalledWith('steam-reviews')
    expect(screen.getByText('3 pages never read')).toBeInTheDocument()
  })

  it('says how each run went in words, and stops one that is going', async () => {
    const onStop = vi.fn()
    renderWithIntl(
      <AdminRuns
        runs={[
          run({}),
          run({ id: 'old', job: 'sync', updatedAt: NOW - 11 * 60_000 }),
          run({ id: 'done', job: 'igdb', state: 'done', finishedAt: NOW - 60_000 }),
        ]}
        now={NOW}
        onStop={onStop}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText('Running')).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/120 read · 30 changed/)).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Not answering')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Done')).toBeInTheDocument()
    expect(within(rows[2]!).queryByRole('button')).toBeNull()
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop', description: 'Every Steam page' }),
    )
    expect(onStop).toHaveBeenCalledWith('run')
  })
})
