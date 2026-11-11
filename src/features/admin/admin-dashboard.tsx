'use client'

import { useNow, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  isGoing,
  type AdminAccess,
  type AdminJob,
  type AdminRun,
  type AdminState,
} from '@/domain/admin/jobs'

import {
  AdminFrame,
  AdminGhost,
  AdminJobs,
  AdminLock,
  AdminOff,
  AdminRuns,
  type LockProblem,
} from './admin-parts'

/**
 * The admin page (`/admin`): built ahead as its ghosts, it asks the server whether this browser
 * may open it, and then shows the jobs and their runs, asking again every few seconds while one
 * runs. Everything it does is the server's to do; the page only starts, stops and watches.
 */

type View =
  | { kind: 'checking' }
  | { kind: 'off' }
  | { kind: 'locked'; busy: boolean; problem?: LockProblem }
  | { kind: 'open'; state: AdminState }

/** How often the page asks again while a run is going. */
const WATCH_MS = 5_000

const ask = (path: string, init?: RequestInit) =>
  fetch(`/api/admin${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

/** What the server says of the page, as the page shows it. Nothing when it didn't answer. */
const viewOf = async (answer: Response): Promise<View | undefined> => {
  if (!answer.ok) return undefined
  const said = (await answer.json()) as AdminAccess
  return said.access === 'open'
    ? { kind: 'open', state: { facts: said.facts, runs: said.runs } }
    : said.access === 'off'
      ? { kind: 'off' }
      : { kind: 'locked', busy: false }
}

/**
 * The page once open: its jobs and runs, on a clock read here only, as nothing open is built
 * ahead. While a run is going, it asks again every few seconds.
 */
function OpenAdmin({
  state,
  unlocked,
  reload,
  onLocked,
}: {
  state: AdminState
  /** Just unlocked here: the jobs' heading takes the focus the form had. */
  unlocked: boolean
  reload: () => Promise<void>
  onLocked: () => void
}) {
  const now = useNow({ updateInterval: WATCH_MS }).getTime()
  const [starting, setStarting] = useState<AdminJob>()
  const [failed, setFailed] = useState(false)
  const [stopping, setStopping] = useState<string>()

  const going = state.runs.some((run) => isGoing(run, now))
  useEffect(() => {
    if (!going) return
    const timer = setInterval(() => void reload(), WATCH_MS)
    return () => clearInterval(timer)
  }, [going, reload])

  const run = async (job: AdminJob) => {
    setStarting(job)
    setFailed(false)
    try {
      const answer = await ask('/runs', { method: 'POST', body: JSON.stringify({ job }) })
      if (answer.status === 401) return onLocked()
      if (!answer.ok) setFailed(true)
      await reload()
    } catch {
      setFailed(true)
    } finally {
      setStarting(undefined)
    }
  }

  const stop = async (id: string) => {
    setStopping(id)
    try {
      await ask(`/runs/${encodeURIComponent(id)}/stop`, { method: 'POST' })
      await reload()
    } catch {
      // The next look shows whether it stopped.
    } finally {
      setStopping(undefined)
    }
  }

  return (
    <>
      <AdminJobs
        facts={state.facts}
        runs={state.runs}
        now={now}
        failed={failed}
        focus={unlocked}
        {...(starting ? { starting } : {})}
        onRun={(job) => void run(job)}
      />
      <AdminRuns
        runs={state.runs}
        now={now}
        {...(stopping ? { stopping } : {})}
        onStop={(id) => void stop(id)}
      />
    </>
  )
}

export function AdminDashboard() {
  const t = useTranslations('Admin')
  const [view, setView] = useState<View>({ kind: 'checking' })
  const [unlocked, setUnlocked] = useState(false)
  // A run that ends while the page watches is said aloud, as the list changes without a word.
  const [announced, setAnnounced] = useState('')
  const seen = useRef<readonly AdminRun[]>([])

  const show = useCallback(
    async (answer: Response) => {
      const next = await viewOf(answer)
      if (!next) return
      if (next.kind === 'open') {
        const before = new Map(seen.current.map((run) => [run.id, run.state]))
        const ended = next.state.runs.find(
          (run) => before.get(run.id) === 'running' && run.state !== 'running',
        )
        if (ended) {
          setAnnounced(
            t('runs.ended', {
              job: t(`job.${ended.job}.name`),
              state: t(`runs.state.${ended.state}`),
            }),
          )
        }
        seen.current = next.state.runs
      }
      setView(next)
    },
    [t],
  )

  // Offline for a moment, a look changes nothing: the next one tries again.
  const reload = useCallback(() => ask('').then(show, () => undefined), [show])

  useEffect(() => {
    // Asking the server is the page's whole start: it is built ahead, the same for everyone.
    void ask('').then(show, () => undefined)
  }, [show])

  const unlock = async (password: string) => {
    setView({ kind: 'locked', busy: true })
    try {
      const answer = await ask('/session', { method: 'POST', body: JSON.stringify({ password }) })
      const said = answer.ok
        ? ((await answer.json()) as { ok: boolean; error?: string })
        : undefined
      if (said?.ok) {
        setUnlocked(true)
        return await reload()
      }
      if (said?.error === 'off') return setView({ kind: 'off' })
      setView({ kind: 'locked', busy: false, problem: said ? 'wrong' : 'failed' })
    } catch {
      setView({ kind: 'locked', busy: false, problem: 'failed' })
    }
  }

  const lock = async () => {
    await ask('/session', { method: 'DELETE' }).catch(() => undefined)
    setView({ kind: 'locked', busy: false })
  }

  return (
    <AdminFrame {...(view.kind === 'open' ? { onLock: () => void lock() } : {})}>
      <p role="status" className="sr-only">
        {announced}
      </p>
      {view.kind === 'checking' ? (
        <AdminGhost />
      ) : view.kind === 'off' ? (
        <AdminOff />
      ) : view.kind === 'locked' ? (
        <AdminLock
          busy={view.busy}
          {...(view.problem ? { problem: view.problem } : {})}
          onUnlock={(password) => void unlock(password)}
        />
      ) : (
        <OpenAdmin
          state={view.state}
          unlocked={unlocked}
          reload={reload}
          onLocked={() => setView({ kind: 'locked', busy: false })}
        />
      )}
    </AdminFrame>
  )
}
