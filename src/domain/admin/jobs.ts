/**
 * The jobs the admin page starts by hand, on the server, instead of waiting for the night's
 * run. A job is one or more stages; a stage runs in steps of a few minutes, each its own request,
 * until it says it is done, so nothing is held to one request's time.
 */

/** What runs in steps. */
export const stages = ['igdb', 'steam-reviews', 'steam-pages-new', 'steam-pages', 'sync'] as const
export type Stage = (typeof stages)[number]

/** What the page offers, each the stages it runs, in order. */
export const jobStages = {
  'steam-pages-new': ['steam-pages-new'],
  'steam-pages': ['steam-pages'],
  'steam-reviews': ['steam-reviews'],
  igdb: ['igdb'],
  sync: ['sync'],
  everything: ['igdb', 'steam-reviews', 'steam-pages'],
} as const satisfies Record<string, readonly Stage[]>

export type AdminJob = keyof typeof jobStages
export const adminJobs = Object.keys(jobStages) as AdminJob[]

export const isAdminJob = (value: unknown): value is AdminJob =>
  typeof value === 'string' && Object.hasOwn(jobStages, value)

export const runStates = ['running', 'done', 'failed', 'stopped'] as const
export type RunState = (typeof runStates)[number]

/** A run of a job, as the page lists it. Times are milliseconds since 1970. */
export type AdminRun = {
  id: string
  job: AdminJob
  state: RunState
  /** Steps taken, across its stages. */
  steps: number
  /** Games read, across its stages, and of those, the ones that changed. */
  checked: number
  changed: number
  startedAt: number
  updatedAt: number
  finishedAt?: number
  /** Why it failed, in the server's words. */
  error?: string
}

/** How long a step may go without a word before the run is taken to have stopped answering. */
export const STALE_MS = 10 * 60_000

/** What the page says of a run: its state, or that a running one stopped answering. */
export const shownState = (run: AdminRun, now: number): RunState | 'stale' =>
  run.state === 'running' && now - run.updatedAt > STALE_MS ? 'stale' : run.state

/** Whether a run is still going, as far as anyone can tell. */
export const isGoing = (run: AdminRun, now: number): boolean => shownState(run, now) === 'running'

/** What the page shows beside each job: counts the server keeps, to see what a run would do. */
export type AdminFacts = {
  /** Games IGDB has with a page on Steam, and of those, the ones whose page was never read. */
  onSteam: number
  neverRead: number
  /** IGDB's records, and when the one asked longest ago was asked. */
  records: number
  oldestAsked?: number
  /** Platform accounts the night's sync reads. */
  linked: number
}

/** What the admin page reads: the facts, and the latest runs, newest first. */
export type AdminState = { facts: AdminFacts; runs: AdminRun[] }

/**
 * What the admin page is told first: whether this browser may open it. "off" while the server has
 * no password, so nobody may. Said in a plain answer, so a locked page logs no error.
 */
export type AdminAccess = ({ access: 'open' } & AdminState) | { access: 'locked' | 'off' }
