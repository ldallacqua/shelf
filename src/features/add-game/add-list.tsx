'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import {
  orderByHabit,
  type Added,
  type Candidate,
  type Habits,
  type PlatformLabel,
  type Refusal,
} from '@/domain/library/adding'
import {
  ADD_STEP,
  MATCH_STEP,
  MAX_LINES,
  parseList,
  startingPlatform,
  type LineMatch,
} from '@/domain/library/bulk'
import { formats, statuses, type Format, type Status } from '@/domain/library/values'
import { Cover } from '@/features/library/cover'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'

import { addGames, matchLines, type NewGame } from './list-client'

/** What a list added: how many, what Undo takes back, and the library's version after. */
export type AddedMany = { count: number; undo: Added[]; version: number }

type Row = {
  /** Its place in the list, from 0. */
  key: number
  line: LineMatch
  /** Which candidate is chosen; -1 for none. */
  pick: number
  include: boolean
  status: Status
  platform?: number
  format: Format
  /** Why adding it failed, after a try. */
  problem?: Refusal['reason']
  /** A title being typed for a line nothing matched. */
  retitle?: string
  searching?: boolean
}

type Stage =
  | { kind: 'paste' }
  | { kind: 'matching'; done: number; total: number; waiting: boolean }
  | { kind: 'review' }
  | { kind: 'adding'; done: number; total: number }

/** How long to wait when IGDB asks us to slow down (spec 4.3), longer each time. */
const WAIT_MS = 2000
const TRIES = 3

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })

const rowFor = (line: LineMatch, key: number, habits: Habits, status: Status): Row => {
  const candidate = line.candidates[0]
  const platform = candidate ? startingPlatform(candidate, habits, line.platformId) : undefined
  return {
    key,
    line,
    pick: candidate ? 0 : -1,
    // Games already in the library are skipped unless I say otherwise (spec 4.2).
    include: Boolean(candidate) && !candidate?.onShelf,
    status,
    ...(platform === undefined ? {} : { platform }),
    format: (platform === undefined ? undefined : habits.formats[platform]) ?? 'physical',
  }
}

/** A line that matches the same game as one before it starts left out. */
const leaveOutRepeats = (rows: Row[]): Row[] => {
  const seen = new Set<number>()
  return rows.map((row) => {
    const candidate = row.line.candidates[row.pick]
    if (!candidate || !row.include) return row
    if (seen.has(candidate.igdbId)) return { ...row, include: false }
    seen.add(candidate.igdbId)
    return row
  })
}

const FIELD =
  'h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 text-sm text-text disabled:opacity-50 pointer-coarse:h-11'

type AddListProps = {
  /** After an add: what was added, and whether every chosen game made it. */
  onAdded: (added: AddedMany, all: boolean) => void
}

/** Many games (spec 4.2): paste titles, see each matched, check them, add them together. */
export function AddList({ onAdded }: AddListProps) {
  const t = useTranslations('Add')
  const library = useTranslations('Library')
  const id = useId()

  const [text, setText] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'paste' })
  const [rows, setRows] = useState<Row[]>([])
  const [labels, setLabels] = useState<Map<number, PlatformLabel>>(new Map())
  const [habits, setHabits] = useState<Habits>({ order: [], formats: {} })
  const [every, setEvery] = useState<{ status?: Status; platform?: number; format?: Format }>({})
  const [problem, setProblem] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const running = useRef<AbortController | undefined>(undefined)

  // Leaving the sheet stops a match on its way.
  useEffect(() => () => running.current?.abort(), [])

  const lines = parseList(text)
  const tooMany = lines.length > MAX_LINES

  const learn = (platforms: readonly PlatformLabel[]) =>
    setLabels((known) => {
      const next = new Map(known)
      for (const platform of platforms) next.set(platform.id, platform)
      return next
    })

  /** A step of lines matched, waiting and trying again when IGDB asks us to slow down. */
  const matchStep = async (texts: string[], signal: AbortSignal, onWait: () => void) => {
    let answer = await matchLines(texts, signal)
    for (let tried = 1; !answer.ok && answer.reason === 'igdb' && tried < TRIES; tried += 1) {
      if (signal.aborted) break
      onWait()
      await pause(WAIT_MS * tried, signal)
      if (signal.aborted) break
      answer = await matchLines(texts, signal)
    }
    return answer
  }

  const match = async () => {
    if (lines.length === 0 || tooMany) return
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    setProblem(undefined)
    setNotice(undefined)
    setStage({ kind: 'matching', done: 0, total: lines.length, waiting: false })

    const matched: LineMatch[] = []
    let mine: Habits = { order: [], formats: {} }
    for (let at = 0; at < lines.length; at += MATCH_STEP) {
      const step = lines.slice(at, at + MATCH_STEP).map((line) => line.text)
      const answer = await matchStep(step, controller.signal, () =>
        setStage({ kind: 'matching', done: matched.length, total: lines.length, waiting: true }),
      )
      // Canceled: the list is back as it was pasted.
      if (controller.signal.aborted) return
      if (!answer.ok) {
        setProblem(answer.reason === 'igdb' ? t('unavailable') : t(`errors.${answer.reason}`))
        setStage({ kind: 'paste' })
        return
      }
      matched.push(...answer.value.lines)
      learn(answer.value.platforms)
      mine = answer.value.habits
      setStage({ kind: 'matching', done: matched.length, total: lines.length, waiting: false })
    }
    running.current = undefined
    setHabits(mine)
    setEvery({})
    setRows(leaveOutRepeats(matched.map((line, key) => rowFor(line, key, mine, 'backlog'))))
    setStage({ kind: 'review' })
  }

  const cancel = () => {
    running.current?.abort()
    running.current = undefined
    setStage({ kind: 'paste' })
  }

  const change = (key: number, update: (row: Row) => Row) =>
    setRows((list) => list.map((row) => (row.key === key ? update(row) : row)))

  /** A row's new match, left out if another row already adds that game. */
  const rematch = (key: number, next: (row: Row) => Row) =>
    setRows((list) =>
      list.map((row) => {
        if (row.key !== key) return row
        const changed = next(row)
        const igdbId = changed.line.candidates[changed.pick]?.igdbId
        const taken = list.some(
          (other) =>
            other.key !== key &&
            other.include &&
            other.line.candidates[other.pick]?.igdbId === igdbId,
        )
        return taken ? { ...changed, include: false } : changed
      }),
    )

  const repick = (row: Row, pick: number): Row => {
    const candidate = row.line.candidates[pick]
    if (!candidate) return { ...row, pick: -1, include: false }
    const platform = startingPlatform(candidate, habits, row.line.platformId)
    const { platform: _was, ...rest } = row
    return {
      ...rest,
      pick,
      include: !candidate.onShelf,
      ...(platform === undefined ? {} : { platform }),
      format: (platform === undefined ? undefined : habits.formats[platform]) ?? row.format,
    }
  }

  /** A line nothing matched, searched again with the title as I retyped it. */
  const searchAgain = async (row: Row) => {
    const title = (row.retitle ?? row.line.title).trim()
    if (!title) return
    change(row.key, (each) => ({ ...each, searching: true }))
    const answer = await matchLines([title])
    const line = answer.ok ? answer.value.lines[0] : undefined
    if (!answer.ok || !line) {
      change(row.key, (each) => ({ ...each, searching: false }))
      setNotice(answer.ok ? undefined : t(`errors.${answer.reason}`))
      return
    }
    learn(answer.value.platforms)
    rematch(row.key, () => rowFor(line, row.key, habits, every.status ?? row.status))
  }

  /** "On every row" (spec 4.2): one choice for all of them, each still its own to change. */
  const applyAll = (choice: { status?: Status; platform?: number; format?: Format }) => {
    setEvery((was) => ({ ...was, ...choice }))
    setRows((list) =>
      list.map((row) => {
        const candidate = row.line.candidates[row.pick]
        const on = candidate ? [...candidate.platforms, ...candidate.alsoOn] : []
        return {
          ...row,
          ...(choice.status ? { status: choice.status } : {}),
          ...(choice.format ? { format: choice.format } : {}),
          ...(choice.platform !== undefined && on.includes(choice.platform)
            ? { platform: choice.platform }
            : {}),
        }
      }),
    )
  }

  const chosen = rows.filter((row) => row.include && row.pick >= 0)

  const add = async () => {
    if (chosen.length === 0) return
    setNotice(undefined)
    setStage({ kind: 'adding', done: 0, total: chosen.length })
    const added: Added[] = []
    const failed = new Map<number, Refusal['reason']>()
    let version = 0
    for (let at = 0; at < chosen.length; at += ADD_STEP) {
      const step = chosen.slice(at, at + ADD_STEP)
      const answer = await addGames(step.map(toNewGame))
      if (!answer.ok) {
        // Refused as a whole (signed out, nothing kept): none of the rest is tried.
        for (const row of chosen.slice(at)) failed.set(row.key, answer.reason)
        break
      }
      answer.value.results.forEach((result, index) => {
        if (result.added) added.push(result.undo)
        else failed.set(step[index]!.key, result.error)
      })
      version = answer.value.version
      setStage({ kind: 'adding', done: at + step.length, total: chosen.length })
    }
    if (added.length > 0) onAdded({ count: added.length, undo: added, version }, failed.size === 0)
    if (failed.size === 0) {
      setText('')
      setRows([])
      setStage({ kind: 'paste' })
      return
    }
    // What did not make it stays, each with why.
    setRows((list) =>
      list
        .filter((row) => failed.has(row.key))
        .map((row) => ({ ...row, problem: failed.get(row.key) })),
    )
    setNotice(t('list.failedRows', { count: failed.size }))
    setStage({ kind: 'review' })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void match()
    }
  }

  if (stage.kind === 'paste' || stage.kind === 'matching') {
    const busy = stage.kind === 'matching'
    return (
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          {t('list.label')}
          <textarea
            data-add-search=""
            rows={10}
            spellCheck={false}
            value={text}
            readOnly={busy}
            aria-describedby={`${id}-hint ${id}-count`}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-48 rounded-control border border-line-strong bg-surface p-3 text-base font-normal text-text read-only:opacity-70"
          />
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {t('list.hint')}
        </p>
        <p id={`${id}-count`} className="min-h-5 text-sm" aria-live="polite">
          {tooMany
            ? t('list.tooMany', { count: lines.length, max: MAX_LINES })
            : t('list.count', { count: lines.length })}
        </p>
        {problem ? (
          <p role="alert" className="rounded-control border border-line-strong p-3 text-sm">
            {problem}
          </p>
        ) : null}
        {busy ? (
          <div className="grid gap-2">
            <progress
              max={stage.total}
              value={stage.done}
              aria-label={t('list.progress')}
              className="h-2 w-full accent-[var(--color-accent)]"
            />
            <p className="text-sm text-muted" aria-live="polite">
              {stage.waiting
                ? t('list.waiting')
                : t('list.matching', { done: stage.done, total: stage.total })}
            </p>
            <Button variant="secondary" className="justify-self-start" onClick={cancel}>
              {t('list.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            className="justify-self-start"
            disabled={lines.length === 0 || tooMany}
            onClick={() => void match()}
          >
            {t('list.match', { count: lines.length })}
          </Button>
        )}
      </div>
    )
  }

  const adding = stage.kind === 'adding'
  const counts = { exact: 0, close: 0, none: 0 }
  for (const row of rows) counts[row.line.confidence] += 1
  // The first line each game was matched on, for "also on line".
  const firstLine = new Map<number, number>()
  const repeatOf = new Map<number, number>()
  for (const row of rows) {
    const candidate = row.line.candidates[row.pick]
    if (!candidate) continue
    const first = firstLine.get(candidate.igdbId)
    if (first === undefined) firstLine.set(candidate.igdbId, row.key)
    else repeatOf.set(row.key, first)
  }
  const everyPlatform = orderByHabit(
    rows.flatMap((row) => {
      const candidate = row.line.candidates[row.pick]
      return candidate ? [...candidate.platforms, ...candidate.alsoOn] : []
    }),
    habits,
  ).flatMap((platformId) => labels.get(platformId) ?? [])

  return (
    <div className="grid gap-4">
      <p className="text-sm" aria-live="polite">
        {t('list.summary', { total: rows.length, ...counts })}
      </p>
      {notice ? (
        <p role="alert" className="rounded-control border border-line-strong p-3 text-sm">
          {notice}
        </p>
      ) : null}

      <fieldset className="grid grid-cols-3 gap-2 rounded-control border border-line-strong p-3 sm:gap-3">
        <legend className="px-1 text-sm font-semibold">{t('list.everyRow')}</legend>
        <label className="grid gap-1 text-sm">
          {t('list.status')}
          <select
            className={FIELD}
            value={every.status ?? ''}
            disabled={adding}
            onChange={(event) => applyAll({ status: event.target.value as Status })}
          >
            <option value="" disabled>
              {t('list.noChange')}
            </option>
            {statuses.map((each) => (
              <option key={each} value={each}>
                {library(`status.${each}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('list.platform')}
          <select
            className={FIELD}
            value={every.platform ?? ''}
            disabled={adding}
            onChange={(event) => applyAll({ platform: Number(event.target.value) })}
          >
            <option value="" disabled>
              {t('list.noChange')}
            </option>
            {everyPlatform.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('list.format')}
          <select
            className={FIELD}
            value={every.format ?? ''}
            disabled={adding}
            onChange={(event) => applyAll({ format: event.target.value as Format })}
          >
            <option value="" disabled>
              {t('list.noChange')}
            </option>
            {formats.map((each) => (
              <option key={each} value={each}>
                {library(`format.${each}`)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <ol aria-label={t('list.rows')} className="grid">
        {rows.map((row) => (
          <ListRow
            key={row.key}
            row={row}
            labels={labels}
            habits={habits}
            repeatOf={repeatOf.get(row.key)}
            disabled={adding}
            onChange={(update) => change(row.key, update)}
            onRepick={(pick) => rematch(row.key, (each) => repick(each, pick))}
            onSearchAgain={() => void searchAgain(row)}
          />
        ))}
      </ol>

      {/* Down over the sheet's own bottom padding, so no row shows beneath it. */}
      <div className="sticky -bottom-6 -mx-5 -mb-6 grid gap-2 border-t border-line bg-surface px-5 pt-3 pb-6">
        {adding ? (
          <>
            <progress
              max={stage.total}
              value={stage.done}
              aria-label={t('list.progress')}
              className="h-2 w-full accent-[var(--color-accent)]"
            />
            <p className="text-sm text-muted" aria-live="polite">
              {t('list.adding', { done: stage.done, total: stage.total })}
            </p>
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" disabled={chosen.length === 0} onClick={() => void add()}>
              {t('list.add', { count: chosen.length })}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setRows([])
                setNotice(undefined)
                setStage({ kind: 'paste' })
              }}
            >
              {t('list.startOver')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

const toNewGame = (row: Row): NewGame => {
  const candidate = row.line.candidates[row.pick]!
  const owned = row.status !== 'wishlist' && row.platform !== undefined
  return {
    igdbId: candidate.igdbId,
    status: row.status,
    copies: owned ? [{ platform: row.platform!, format: row.format }] : [],
  }
}

const aboutCandidate = (candidate: Candidate, labels: ReadonlyMap<number, PlatformLabel>) =>
  [
    candidate.year,
    [...candidate.platforms, ...candidate.alsoOn]
      .map((id) => labels.get(id)?.short)
      .filter(Boolean)
      .join(', '),
  ]
    .filter(Boolean)
    .join(' · ')

type ListRowProps = {
  row: Row
  labels: ReadonlyMap<number, PlatformLabel>
  habits: Habits
  repeatOf: number | undefined
  disabled: boolean
  onChange: (update: (row: Row) => Row) => void
  onRepick: (pick: number) => void
  onSearchAgain: () => void
}

/** One line of the list: what it matched, how sure, and how I own it. */
function ListRow({
  row,
  labels,
  habits,
  repeatOf,
  disabled,
  onChange,
  onRepick,
  onSearchAgain,
}: ListRowProps) {
  const t = useTranslations('Add')
  const library = useTranslations('Library')
  const candidate = row.line.candidates[row.pick]
  const title = candidate?.title ?? row.line.title
  const platforms = candidate
    ? orderByHabit([...candidate.platforms, ...candidate.alsoOn], habits).flatMap(
        (id) => labels.get(id) ?? [],
      )
    : []
  const wishlist = row.status === 'wishlist'

  return (
    <li
      data-confidence={row.line.confidence}
      className={cn('grid gap-2 border-b border-line py-3', !row.include && 'text-muted')}
    >
      <div className="flex items-start gap-3">
        <span className="mt-3 w-6 flex-none text-right readout text-[0.625rem] text-muted">
          {row.key + 1}
        </span>
        <input
          type="checkbox"
          checked={row.include}
          disabled={disabled || !candidate}
          aria-label={t('list.include', { title })}
          onChange={(event) => onChange((each) => ({ ...each, include: event.target.checked }))}
          className="mt-3 size-4 flex-none accent-[var(--color-accent)]"
        />
        <span
          aria-hidden="true"
          className="relative block w-10 flex-none overflow-hidden rounded-[3px] bg-text/8"
          style={{ aspectRatio: '3 / 4' }}
        >
          {candidate ? (
            <Cover cover={candidate.cover?.id} title={candidate.title} sizes="40px" />
          ) : null}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn('font-semibold', row.include && 'text-text')}>{title}</span>
            {candidate?.year ? (
              <span className="readout text-[0.6875rem] text-muted">{candidate.year}</span>
            ) : null}
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                row.line.confidence === 'exact'
                  ? 'border-line text-muted'
                  : 'border-accent font-semibold text-accent',
              )}
            >
              {t(`list.confidence.${row.line.confidence}`)}
            </span>
            {candidate?.onShelf ? (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                {t('inLibrary')}
              </span>
            ) : null}
            {repeatOf === undefined ? null : (
              <span className="text-xs text-muted">{t('list.repeat', { line: repeatOf + 1 })}</span>
            )}
          </p>
          {row.line.text === candidate?.title ? null : (
            <p className="text-xs break-words text-muted">
              {t('list.asWritten', { line: row.line.text })}
            </p>
          )}
          {row.problem ? (
            <p role="alert" className="text-sm text-text">
              {t(`errors.${row.problem}`)}
            </p>
          ) : null}
        </div>
      </div>

      {row.line.candidates.length === 0 ? (
        <div className="grid gap-2 sm:pl-[4.75rem]">
          <p className="text-sm">{t('list.notFound')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm">
              {t('list.retitle')}
              <input
                className={FIELD}
                value={row.retitle ?? row.line.title}
                disabled={disabled || row.searching}
                onChange={(event) => onChange((each) => ({ ...each, retitle: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onSearchAgain()
                  }
                }}
              />
            </label>
            <Button
              variant="secondary"
              disabled={disabled || row.searching}
              onClick={onSearchAgain}
            >
              {row.searching ? t('searching') : t('list.searchAgain')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] sm:pl-[4.75rem]">
          <select
            className={cn(FIELD, 'col-span-2 sm:col-span-1')}
            value={row.pick}
            disabled={disabled}
            aria-label={t('list.matchFor', { line: row.line.text })}
            onChange={(event) => onRepick(Number(event.target.value))}
          >
            {row.line.candidates.map((each, index) => (
              <option key={each.igdbId} value={index}>
                {[each.title, aboutCandidate(each, labels)].filter(Boolean).join(' · ')}
              </option>
            ))}
            <option value={-1}>{t('list.skip')}</option>
          </select>
          <select
            className={FIELD}
            value={row.status}
            disabled={disabled || !candidate}
            aria-label={t('list.statusFor', { title })}
            onChange={(event) =>
              onChange((each) => ({ ...each, status: event.target.value as Status }))
            }
          >
            {statuses.map((each) => (
              <option key={each} value={each}>
                {library(`status.${each}`)}
              </option>
            ))}
          </select>
          <select
            className={FIELD}
            value={wishlist ? '' : (row.platform ?? '')}
            disabled={disabled || !candidate || wishlist}
            aria-label={t('list.platformFor', { title })}
            onChange={(event) => {
              const value = event.target.value
              onChange(({ platform: _was, ...each }) =>
                value === ''
                  ? each
                  : {
                      ...each,
                      platform: Number(value),
                      format: habits.formats[Number(value)] ?? each.format,
                    },
              )
            }}
          >
            <option value="">{t('list.noCopy')}</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
          <select
            className={FIELD}
            value={row.format}
            disabled={disabled || !candidate || wishlist || row.platform === undefined}
            aria-label={t('list.formatFor', { title })}
            onChange={(event) =>
              onChange((each) => ({ ...each, format: event.target.value as Format }))
            }
          >
            {formats.map((each) => (
              <option key={each} value={each}>
                {library(`format.${each}`)}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  )
}
