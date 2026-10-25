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
import { Checkbox } from '@/ui/checkbox'
import { cn } from '@/ui/cn'
import { Input, Textarea } from '@/ui/field'
import { Progress } from '@/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

import { BringBack } from './bring-back'
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

/** A row's select stands for a copy that is not there: Radix keeps the empty value for "nothing chosen". */
const NO_COPY = 'none'

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
          <Textarea
            data-add-search=""
            rows={10}
            spellCheck={false}
            value={text}
            readOnly={busy}
            aria-describedby={`${id}-hint ${id}-count`}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-48 p-3 font-normal"
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
            <Progress max={stage.total} value={stage.done} aria-label={t('list.progress')} />
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

      <fieldset className="grid gap-2 rounded-panel border border-line-strong p-3 sm:grid-cols-3 sm:gap-3">
        <legend className="px-1 text-sm font-semibold">{t('list.everyRow')}</legend>
        <EveryRow
          id={`${id}-every-status`}
          label={t('list.status')}
          placeholder={t('list.noChange')}
          value={every.status}
          disabled={adding}
          onChange={(value) => applyAll({ status: value as Status })}
          options={statuses.map((each) => ({ value: each, name: library(`status.${each}`) }))}
        />
        <EveryRow
          id={`${id}-every-platform`}
          label={t('list.platform')}
          placeholder={t('list.noChange')}
          value={every.platform === undefined ? undefined : String(every.platform)}
          disabled={adding}
          onChange={(value) => applyAll({ platform: Number(value) })}
          options={everyPlatform.map((platform) => ({
            value: String(platform.id),
            name: platform.name,
          }))}
        />
        <EveryRow
          id={`${id}-every-format`}
          label={t('list.format')}
          placeholder={t('list.noChange')}
          value={every.format}
          disabled={adding}
          onChange={(value) => applyAll({ format: value as Format })}
          options={formats.map((each) => ({ value: each, name: library(`format.${each}`) }))}
        />
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
            <Progress max={stage.total} value={stage.done} aria-label={t('list.progress')} />
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

type Option = { value: string; name: string }

/** One of the choices made for every row at once: nothing chosen until one is. */
function EveryRow({
  id,
  label,
  placeholder,
  value,
  disabled,
  onChange,
  options,
}: {
  id: string
  label: string
  placeholder: string
  value: string | undefined
  disabled: boolean
  onChange: (value: string) => void
  options: readonly Option[]
}) {
  return (
    // On a phone, the label beside its select; wider, above it, in three columns.
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-1 sm:gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <Select value={value ?? ''} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} className="px-2.5">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** One of a row's choices, named for its game. */
function RowSelect({
  label,
  value,
  disabled,
  onChange,
  options,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  options: readonly Option[]
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="px-2.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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
        <Checkbox
          checked={row.include}
          disabled={disabled || !candidate}
          aria-label={t('list.include', { title })}
          onChange={(event) => onChange((each) => ({ ...each, include: event.target.checked }))}
          className="mt-2.5"
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
                {candidate.onShelf.archived ? t('archived') : t('inLibrary')}
              </span>
            ) : null}
            {repeatOf === undefined ? null : (
              <span className="text-xs text-muted">{t('list.repeat', { line: repeatOf + 1 })}</span>
            )}
          </p>
          {candidate?.onShelf?.archived ? (
            <BringBack entryId={candidate.onShelf.archived} title={candidate.onShelf.title} />
          ) : null}
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
              <Input
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
          <Select
            value={String(row.pick)}
            disabled={disabled}
            onValueChange={(value) => onRepick(Number(value))}
          >
            <SelectTrigger
              aria-label={t('list.matchFor', { line: row.line.text })}
              className="col-span-2 px-2.5 sm:col-span-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[min(32rem,calc(100vw-2rem))]">
              {row.line.candidates.map((each, index) => (
                <SelectItem
                  key={each.igdbId}
                  value={String(index)}
                  media={
                    <span
                      aria-hidden="true"
                      className="relative block w-8 flex-none overflow-hidden rounded-[3px] bg-text/8"
                      style={{ aspectRatio: '3 / 4' }}
                    >
                      <Cover cover={each.cover?.id} title={each.title} sizes="32px" />
                    </span>
                  }
                  detail={aboutCandidate(each, labels)}
                >
                  {each.title}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="-1">{t('list.skip')}</SelectItem>
            </SelectContent>
          </Select>
          <RowSelect
            label={t('list.statusFor', { title })}
            value={row.status}
            disabled={disabled || !candidate}
            onChange={(value) => onChange((each) => ({ ...each, status: value as Status }))}
            options={statuses.map((each) => ({ value: each, name: library(`status.${each}`) }))}
          />
          <RowSelect
            label={t('list.platformFor', { title })}
            value={wishlist || row.platform === undefined ? NO_COPY : String(row.platform)}
            disabled={disabled || !candidate || wishlist}
            onChange={(value) =>
              onChange(({ platform: _was, ...each }) =>
                value === NO_COPY
                  ? each
                  : {
                      ...each,
                      platform: Number(value),
                      format: habits.formats[Number(value)] ?? each.format,
                    },
              )
            }
            options={[
              { value: NO_COPY, name: t('list.noCopy') },
              ...platforms.map((platform) => ({ value: String(platform.id), name: platform.name })),
            ]}
          />
          <RowSelect
            label={t('list.formatFor', { title })}
            value={row.format}
            disabled={disabled || !candidate || wishlist || row.platform === undefined}
            onChange={(value) => onChange((each) => ({ ...each, format: value as Format }))}
            options={formats.map((each) => ({ value: each, name: library(`format.${each}`) }))}
          />
        </div>
      )}
    </li>
  )
}
