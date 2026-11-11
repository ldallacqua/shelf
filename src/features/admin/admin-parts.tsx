import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleSlashIcon,
  CircleXIcon,
  LockIcon,
  PlayIcon,
  SquareIcon,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useId, type FormEvent, type ReactNode } from 'react'

import {
  adminJobs,
  isGoing,
  shownState,
  type AdminFacts,
  type AdminJob,
  type AdminRun,
} from '@/domain/admin/jobs'
import { titleClass } from '@/features/settings/settings-section'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'
import { Ghost, GhostText, Loading } from '@/ui/ghost'

/**
 * The admin page's parts, each drawn from what it is given, so every state has its story: the
 * frame, the lock, the jobs with what each would read, and the runs, newest first.
 */

const listClass = 'mt-4 divide-y divide-line border-y border-line'

/** The page's title and what it is for, and the lock once it is open. */
export function AdminFrame({ onLock, children }: { onLock?: () => void; children: ReactNode }) {
  const t = useTranslations('Admin')
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h1 className={titleClass}>{t('title')}</h1>
        {onLock ? (
          <Button variant="ghost" size="sm" onClick={onLock}>
            <LockIcon aria-hidden="true" />
            {t('lock')}
          </Button>
        ) : null}
      </div>
      <p className="mt-3 max-w-2xl text-pretty text-muted">{t('intro')}</p>
      {children}
    </div>
  )
}

/** While the page asks the server whether it is open: the shape of the jobs. */
export function AdminGhost() {
  const t = useTranslations('Admin')
  return (
    <Loading label={t('checking')} className="mt-10">
      <GhostText className="w-24 text-xl sm:text-2xl" />
      <div className={listClass}>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-6 py-4">
            <div className="grid flex-1 gap-1.5">
              <GhostText order={row} className="w-48" />
              <GhostText order={row} className="w-full max-w-md text-sm" />
            </div>
            <Ghost order={row} className="h-8 w-16 rounded-control" />
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** The server has no password: the page can't open. */
export function AdminOff() {
  const t = useTranslations('Admin')
  return <p className="mt-10 max-w-xl text-pretty">{t('off')}</p>
}

export type LockProblem = 'wrong' | 'failed'

/** The password, asked once: right, the page stays open on this browser for twelve hours. */
export function AdminLock({
  busy = false,
  problem,
  onUnlock,
}: {
  busy?: boolean
  problem?: LockProblem
  onUnlock: (password: string) => void
}) {
  const t = useTranslations('Admin.locked')
  const id = useId()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const password = new FormData(event.currentTarget).get('password')
    if (typeof password === 'string' && password !== '') onUnlock(password)
  }
  return (
    <form onSubmit={submit} className="mt-10 grid max-w-md gap-2">
      <label htmlFor={`${id}-password`} className="text-sm font-semibold">
        {t('label')}
      </label>
      <div className="flex gap-2">
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={problem === 'wrong' ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
        />
        <Button type="submit" variant="primary" disabled={busy} className="flex-none">
          {busy ? t('unlocking') : t('unlock')}
        </Button>
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="text-sm">
          {t(problem)}
        </p>
      ) : null}
    </form>
  )
}

/** What a job would read now, beside it: nothing for the one that runs the others. */
function JobFact({ job, facts, now }: { job: AdminJob; facts: AdminFacts; now: number }) {
  const t = useTranslations('Admin.facts')
  const format = useFormatter()
  const fact =
    job === 'steam-pages-new'
      ? t('neverRead', { count: facts.neverRead })
      : job === 'steam-pages' || job === 'steam-reviews'
        ? t('onSteam', { count: facts.onSteam })
        : job === 'igdb'
          ? facts.oldestAsked === undefined
            ? t('noRecords')
            : t('records', {
                count: facts.records,
                when: format.relativeTime(facts.oldestAsked, now),
              })
          : job === 'sync'
            ? t('linked', { count: facts.linked })
            : undefined
  return fact ? <p className="readout text-xs text-muted">{fact}</p> : null
}

/** Every job, each with a line of what it does and a button that starts it on the server. */
export function AdminJobs({
  facts,
  runs,
  now,
  starting,
  failed = false,
  focus = false,
  onRun,
}: {
  facts: AdminFacts
  runs: readonly AdminRun[]
  now: number
  /** The job whose start was just pressed, while the server is asked. */
  starting?: AdminJob
  /** The last start was refused, or never answered. */
  failed?: boolean
  /** Just unlocked: the form that had the focus is gone, so the jobs' heading takes it. */
  focus?: boolean
  onRun: (job: AdminJob) => void
}) {
  const t = useTranslations('Admin')
  const id = useId()
  const heading = useCallback(
    (element: HTMLHeadingElement | null) => {
      if (focus) element?.focus()
    },
    [focus],
  )
  return (
    <section aria-labelledby={`${id}-jobs`} className="mt-10">
      <h2 id={`${id}-jobs`} ref={heading} tabIndex={-1} className="title text-xl sm:text-2xl">
        {t('jobs.title')}
      </h2>
      {failed ? (
        <p role="alert" className="mt-2 text-sm">
          {t('jobs.failed')}
        </p>
      ) : null}
      <ul className={listClass}>
        {adminJobs.map((job) => {
          const going = runs.some((run) => run.job === job && isGoing(run, now))
          return (
            <li key={job} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
              <div className="grid min-w-0 flex-1 basis-64 gap-1">
                <h3 id={`${id}-${job}`} className="font-semibold">
                  {t(`job.${job}.name`)}
                </h3>
                <p className="text-sm text-pretty text-muted">{t(`job.${job}.what`)}</p>
                <JobFact job={job} facts={facts} now={now} />
              </div>
              <Button
                size="sm"
                disabled={going || starting !== undefined}
                aria-describedby={`${id}-${job}`}
                onClick={() => onRun(job)}
              >
                <PlayIcon aria-hidden="true" />
                {going ? t('jobs.running') : starting === job ? t('jobs.starting') : t('jobs.run')}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const STATE_ICONS = {
  running: CircleDotIcon,
  done: CircleCheckIcon,
  failed: CircleXIcon,
  stopped: CircleSlashIcon,
  stale: CircleAlertIcon,
}

/** The latest runs, newest first: how each went, in words beside its mark. */
export function AdminRuns({
  runs,
  now,
  stopping,
  onStop,
}: {
  runs: readonly AdminRun[]
  now: number
  /** The run whose stop was just pressed. */
  stopping?: string
  onStop: (id: string) => void
}) {
  const t = useTranslations('Admin')
  const format = useFormatter()
  const id = useId()
  const minutes = (ms: number) => t('duration', { minutes: Math.floor(ms / 60_000) })
  return (
    <section aria-labelledby={`${id}-runs`} className="mt-12">
      <h2 id={`${id}-runs`} className="title text-xl sm:text-2xl">
        {t('runs.title')}
      </h2>
      {runs.length === 0 ? (
        <p className="mt-3 text-muted">{t('runs.empty')}</p>
      ) : (
        <ul className={listClass}>
          {runs.map((run) => {
            const state = shownState(run, now)
            const Icon = STATE_ICONS[state]
            const facts = [
              t('runs.started', { when: format.relativeTime(run.startedAt, now) }),
              run.finishedAt === undefined
                ? t('runs.sofar', { duration: minutes(now - run.startedAt) })
                : t('runs.took', { duration: minutes(run.finishedAt - run.startedAt) }),
              t('runs.steps', { count: run.steps }),
              t('runs.counts', { checked: run.checked, changed: run.changed }),
            ]
            return (
              <li key={run.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                <span
                  data-state={state}
                  className="flex w-36 flex-none items-center gap-2 pt-0.5 text-sm font-semibold"
                >
                  <Icon aria-hidden="true" className="size-4 flex-none" />
                  {t(`runs.state.${state}`)}
                </span>
                <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                  <p id={`${id}-${run.id}`} className="font-medium">
                    {t(`job.${run.job}.name`)}
                  </p>
                  <p className="text-xs text-muted">{facts.join(' · ')}</p>
                  {run.error ? (
                    // The server's own words, in English.
                    <p lang="en" className="text-xs break-words text-muted">
                      {run.error}
                    </p>
                  ) : null}
                  {state === 'stale' ? (
                    <p className="text-xs text-pretty text-muted">{t('runs.stale')}</p>
                  ) : null}
                </div>
                {state === 'running' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={stopping === run.id}
                    aria-describedby={`${id}-${run.id}`}
                    onClick={() => onStop(run.id)}
                  >
                    <SquareIcon aria-hidden="true" />
                    {stopping === run.id ? t('runs.stopping') : t('runs.stop')}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
