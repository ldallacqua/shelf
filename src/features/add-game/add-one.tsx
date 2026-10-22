'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from 'react'

import {
  MIN_SEARCH,
  orderByHabit,
  type AddedGame,
  type Candidate,
  type Grouping,
  type PlatformLabel,
  type Refusal,
  type SearchAnswer,
} from '@/domain/library/adding'
import { formats, statuses, type Format, type Status } from '@/domain/library/values'
import { Cover } from '@/features/library/cover'
import { gameHref } from '@/features/library/shelf-address'
import { signedInAccount } from '@/features/owner/account'
import { DayField, RatingField, TagsField, today } from '@/features/owner/fields'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Radio } from '@/ui/checkbox'
import { ChoiceChip, ToggleChip } from '@/ui/chip'
import { cn } from '@/ui/cn'
import { Input } from '@/ui/field'
import { Segmented, SegmentedItem } from '@/ui/segmented'

import type { AddActions } from './actions'

/** A short pause after typing before IGDB is asked (spec 4.1). */
const PAUSE_MS = 250

type Search =
  | { state: 'idle' }
  | { state: 'searching'; text: string; answer?: SearchAnswer }
  | { state: 'ready'; text: string; answer: SearchAnswer }
  | { state: 'failed'; text: string; reason: Refusal['reason'] }

type AddOneProps = {
  actions: AddActions
  /** After an add: what was added, and whether to keep the sheet open for the next. */
  onAdded: (added: AddedGame, again: boolean) => void
  /** A result already on the shelf was picked: its page opens instead. */
  onOpenOwned: () => void
}

/** One game (spec 4.1): type, read the results, choose, fill three things, add. */
export function AddOne({ actions, onAdded, onOpenOwned }: AddOneProps) {
  const t = useTranslations('Add')
  const router = useRouter()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [search, setSearch] = useState<Search>({ state: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [active, setActive] = useState(0)
  const [chosen, setChosen] = useState<Candidate>()
  const asked = useRef(0)

  // Results as I type, from two characters, after a short pause. A newer
  // keystroke makes the older answer no one's: it is dropped when it comes.
  useEffect(() => {
    const wanted = text.trim()
    if (wanted.length < MIN_SEARCH) return
    const ask = ++asked.current
    const timer = window.setTimeout(async () => {
      setSearch((was) => ({
        state: 'searching',
        text: wanted,
        ...('answer' in was && was.answer ? { answer: was.answer } : {}),
      }))
      const result = await actions.search(wanted)
      if (ask !== asked.current) return
      setActive(0)
      setSearch(
        result.ok
          ? { state: 'ready', text: wanted, answer: result.value }
          : { state: 'failed', text: wanted, reason: result.reason },
      )
    }, PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [text, attempt, actions])

  const answer =
    search.state === 'ready' || search.state === 'searching' ? search.answer : undefined
  const results = text.trim().length >= MIN_SEARCH ? (answer?.results ?? []) : []
  const labels = new Map((answer?.platforms ?? []).map((platform) => [platform.id, platform]))

  const choose = (candidate: Candidate) => {
    const mine = signedInAccount()
    if (candidate.onShelf && mine) {
      onOpenOwned()
      router.push(gameHref(mine.handle, candidate.onShelf.slug))
      return
    }
    setChosen(candidate)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(results.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const candidate = results[active]
      if (candidate) choose(candidate)
    }
  }

  if (chosen && answer) {
    return (
      <AddForm
        key={chosen.igdbId}
        candidate={chosen}
        answer={answer}
        labels={labels}
        actions={actions}
        onBack={() => {
          setChosen(undefined)
          requestAnimationFrame(() => input.current?.focus())
        }}
        onAdded={(added, again) => {
          onAdded(added, again)
          if (again) {
            setChosen(undefined)
            setText('')
            setSearch({ state: 'idle' })
            requestAnimationFrame(() => input.current?.focus())
          }
        }}
      />
    )
  }

  const optionId = (index: number) => `${listId}-${index}`
  const status =
    text.trim().length < MIN_SEARCH
      ? t('typeMore')
      : search.state === 'searching' && results.length === 0
        ? t('searching')
        : search.state === 'ready' && results.length === 0
          ? t('noResults', { text: search.text })
          : search.state === 'ready'
            ? t('resultCount', { count: results.length })
            : ''

  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium">
        {t('searchLabel')}
        <Input
          ref={input}
          type="search"
          role="combobox"
          data-add-search=""
          autoComplete="off"
          spellCheck={false}
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
          placeholder={t('searchPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="h-11 font-normal"
        />
      </label>
      <p className="min-h-5 text-sm text-muted" aria-live="polite">
        {status}
      </p>
      {search.state === 'failed' ? (
        <div
          role="alert"
          className="grid justify-items-start gap-3 rounded-control border border-line-strong p-4"
        >
          <p>{t(search.reason === 'igdb' ? 'unavailable' : `errors.${search.reason}`)}</p>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={t('results')}
        className={cn('grid gap-1', search.state === 'searching' && 'opacity-70')}
      >
        {results.map((candidate, index) => (
          // The keys stay in the field above, which points at the active result
          // (`aria-activedescendant`): a click is the pointer's way to choose.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={candidate.igdbId}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            data-active={index === active ? '' : undefined}
            onPointerMove={() => setActive(index)}
            onClick={() => choose(candidate)}
            className="flex cursor-pointer items-center gap-3 rounded-control p-2 data-[active]:bg-text/8"
          >
            <ResultCover candidate={candidate} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{candidate.title}</span>
                {candidate.year ? (
                  <span className="readout text-[0.6875rem] text-muted">{candidate.year}</span>
                ) : null}
              </span>
              <span className="text-xs text-muted">
                {names(candidate.platforms, labels)}
                {candidate.alsoOn.length > 0
                  ? ` · ${t('alsoOn', { platforms: names(candidate.alsoOn, labels) })}`
                  : ''}
              </span>
            </span>
            {candidate.kind !== 'main' ? (
              <span className="flex-none rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                {t(`kinds.${candidate.kind}`)}
              </span>
            ) : null}
            {candidate.onShelf ? (
              <span className="flex-none rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                {t('inLibrary')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

const names = (ids: readonly number[], labels: ReadonlyMap<number, PlatformLabel>) =>
  ids
    .map((id) => labels.get(id)?.short)
    .filter(Boolean)
    .join(' · ')

function ResultCover({ candidate }: { candidate: Candidate }) {
  return (
    // The title is beside it, in words.
    <span
      aria-hidden="true"
      className="relative block w-10 flex-none overflow-hidden rounded-[3px]"
      style={{ aspectRatio: '3 / 4' }}
    >
      <Cover cover={candidate.cover?.id} title={candidate.title} sizes="40px" />
    </span>
  )
}

type AddFormProps = {
  candidate: Candidate
  answer: SearchAnswer
  labels: ReadonlyMap<number, PlatformLabel>
  actions: AddActions
  onBack: () => void
  onAdded: (added: AddedGame, again: boolean) => void
}

/** Three things to fill (spec 4.1): status, platforms owned, and the optional rest. */
function AddForm({ candidate, answer, labels, actions, onBack, onAdded }: AddFormProps) {
  const t = useTranslations('Add')
  const library = useTranslations('Library')
  const formId = useId()
  const [status, setStatus] = useState<Status>('backlog')
  const [owned, setOwned] = useState<{ platformId: number; format: Format }[]>([])
  // Out of ten, as the field shows it; none until it is moved.
  const [rating, setRating] = useState<number>()
  const [tags, setTags] = useState<string[]>([])
  const [completedOn, setCompletedOn] = useState<string | undefined>(today)
  const [grouping, setGrouping] = useState<Grouping>()
  const [together, setTogether] = useState<boolean>()
  const [problem, setProblem] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useRef<HTMLFormElement>(null)

  // Chosen with Enter, the next thing to do is say where it is owned.
  useEffect(() => {
    const first =
      form.current?.querySelector<HTMLElement>('[aria-pressed]') ??
      form.current?.querySelector<HTMLElement>('input[type="radio"]:checked')
    first?.focus({ preventScroll: true })
  }, [])

  // Whether it belongs with a game already on the shelf (ADR 001), asked as soon as it is chosen.
  useEffect(() => {
    let current = true
    void actions.grouping(candidate.igdbId).then((result) => {
      if (!current || !result.ok) return
      setGrouping(result.value)
    })
    return () => {
      current = false
    }
  }, [actions, candidate.igdbId])

  const platforms = orderByHabit([...candidate.platforms, ...candidate.alsoOn], answer.habits)
  const related =
    grouping?.action === 'join' || grouping?.action === 'separate' ? grouping : undefined
  const joins = related ? (together ?? related.action === 'join') : false

  const toggle = (platformId: number) =>
    setOwned((list) =>
      list.some((copy) => copy.platformId === platformId)
        ? list.filter((copy) => copy.platformId !== platformId)
        : [...list, { platformId, format: answer.habits.formats[platformId] ?? 'physical' }],
    )

  const submit = (again: boolean) => {
    startTransition(async () => {
      setProblem(undefined)
      const result = await actions.add({
        igdbId: candidate.igdbId,
        status,
        copies: status === 'wishlist' ? [] : owned,
        // Stored out of a hundred.
        ...(rating === undefined ? {} : { rating: Math.round(rating * 10) }),
        ...(tags.length > 0 ? { tags } : {}),
        ...(status === 'completed' && completedOn ? { completedOn } : {}),
        ...(related ? { grouping: joins ? ('join' as const) : ('separate' as const) } : {}),
      })
      if (result.ok) onAdded(result.value, again)
      else setProblem(t(`errors.${result.reason}`))
    })
  }

  // Command or Control and Enter, wherever focus is in the sheet: add, and
  // stay for the next game. Not the form's own key: Safari leaves focus on the
  // page when a choice is clicked, and a choice can hide what had it.
  const latest = useRef(submit)
  useEffect(() => {
    latest.current = submit
  })
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
      const inSheet = event.target instanceof Element && event.target.closest('[role="dialog"]')
      if (!inSheet && event.target !== document.body) return
      // Not while the list's tab is the one shown.
      if (form.current?.closest('[data-state="inactive"]')) return
      event.preventDefault()
      latest.current(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form
      ref={form}
      id={formId}
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        submit(false)
      }}
    >
      <div className="flex items-center gap-3">
        <ResultCover candidate={candidate} />
        <p className="grid min-w-0 flex-1">
          <span className="title text-lg text-balance">{candidate.title}</span>
          <span className="text-sm text-muted">
            {[candidate.year, names(candidate.platforms, labels)].filter(Boolean).join(' · ')}
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t('change')}
        </Button>
      </div>

      {related ? (
        <fieldset className="grid gap-2 rounded-control border border-line-strong p-3 text-sm">
          <legend className="px-1 font-semibold">
            {related.entry.platforms.length > 0
              ? t('related', {
                  title: related.entry.title,
                  platforms: names(related.entry.platforms, labels),
                })
              : t('relatedNoCopies', { title: related.entry.title })}
          </legend>
          {[true, false].map((join) => (
            <label key={String(join)} className="flex min-h-10 cursor-pointer items-center gap-2.5">
              <Radio
                name={`${formId}-grouping`}
                checked={joins === join}
                onChange={() => setTogether(join)}
              />
              {join ? t('joinChoice', { title: related.entry.title }) : t('separateChoice')}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('status')}</legend>
        <div className="flex flex-wrap gap-2">
          {statuses.map((each) => (
            <ChoiceChip
              key={each}
              type="radio"
              name={`${formId}-status`}
              value={each}
              checked={status === each}
              onChange={() => setStatus(each)}
            >
              {library(`status.${each}`)}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      {status === 'wishlist' ? (
        <p className="text-sm text-muted">{t('wishlistNone')}</p>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('owned')}</legend>
          <div className="flex flex-wrap gap-2">
            {platforms.map((id) => {
              const platform = labels.get(id)
              if (!platform) return null
              const picked = owned.some((copy) => copy.platformId === id)
              return (
                <ToggleChip key={id} pressed={picked} onClick={() => toggle(id)}>
                  {platform.name}
                </ToggleChip>
              )
            })}
          </div>
          {owned.length > 0 ? (
            <ul className="mt-1 grid gap-2">
              {owned.map((copy) => {
                const platform = labels.get(copy.platformId)
                if (!platform) return null
                return (
                  <li
                    key={copy.platformId}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm"
                  >
                    <span className="text-muted">{platform.name}</span>
                    <Segmented
                      aria-label={t('formatFor', { platform: platform.name })}
                      value={copy.format}
                      onValueChange={(format: Format) =>
                        setOwned((list) =>
                          list.map((each) =>
                            each.platformId === copy.platformId ? { ...each, format } : each,
                          ),
                        )
                      }
                    >
                      {formats.map((format) => (
                        <SegmentedItem key={format} value={format}>
                          {library(`format.${format}`)}
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </fieldset>
      )}

      <RatingField value={rating} onChange={setRating} />
      {status === 'completed' ? (
        <DayField
          label={t('completedOn')}
          value={completedOn}
          onChange={setCompletedOn}
          className="grid gap-1.5 sm:max-w-64"
        />
      ) : null}
      <TagsField value={tags} onChange={setTags} />

      {problem ? (
        <p role="alert" className="text-sm">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('adding') : t('add')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => submit(true)}>
          {t('addAnother')}
        </Button>
      </div>
    </form>
  )
}
