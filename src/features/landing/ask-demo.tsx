'use client'

import { SearchIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { useFlip } from '@/features/library/use-flip'
import { useReducedMotion } from '@/features/library/use-preference'
import { cn } from '@/ui/cn'

import { DemoCase, type AskGame } from './demo-case'
import { ASK_STEPS, ASK_TRIES, type AskStep } from './demo-choices'
import { useArrived } from './reveals'

/** How long each filter stays on before the next one joins it, as the scene plays. */
const STEP_MS = 2200

const SIZES = '(min-width: 40rem) 72px, 60px'

/** The grid shows three rows, nine boxes wide at most: no more are drawn. */
const MOST_SHOWN = 27

type AskDemoProps = {
  /** The example shelf, as its boxes need it: what a case draws, and the game's slug. */
  games: readonly AskGame[]
  /** What each filter finds on its own, by slug. */
  matches: Record<AskStep, readonly string[]>
}

const queryOf = (active: readonly AskStep[]) =>
  ASK_STEPS.filter((step) => active.includes(step.key))
    .map((step) => step.query)
    .join(' ')

/**
 * "Ask it anything": the example shelf, filtered in the real filter language.
 * As it comes into view its filters switch on in turn, and the boxes
 * rearrange for each, until three games are left. Then it is the visitor's:
 * a filter can be switched on or off, or typed. A typed one fetches the
 * filter language the first time; the steps were worked out ahead.
 */
export function AskDemo({ games, matches }: AskDemoProps) {
  const t = useTranslations('Landing.ask')
  const reduced = useReducedMotion()
  const scope = useRef<HTMLDivElement>(null)
  const arrived = useArrived(scope)
  const [active, setActive] = useState<AskStep[]>([])
  const [typed, setTyped] = useState<string>()
  const [found, setFound] = useState<{ slugs: readonly string[]; unread: boolean }>()
  const [touched, setTouched] = useState(false)
  // The question asked last: an answer to an earlier one, arriving late, is dropped.
  const asked = useRef('')

  const text = typed ?? queryOf(active)
  const shown = found?.slugs ?? keepAll(games, active, matches)
  const flip = useFlip(scope, shown)

  // The scene plays once, on arrival, unless the visitor got there first.
  useEffect(() => {
    if (!arrived || touched || reduced) return
    const timers = ASK_STEPS.map((step, index) =>
      setTimeout(
        () => {
          flip()
          setActive(ASK_STEPS.slice(0, index + 1).map((each) => each.key))
        },
        700 + index * STEP_MS,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // `flip` notes where the boxes stand, in refs: any drawing's copy of it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived, touched, reduced])

  const take = () => {
    if (!touched) setTouched(true)
    flip()
  }

  const choose = (step: AskStep) => {
    take()
    asked.current = ''
    setTyped(undefined)
    setFound(undefined)
    setActive((now) => (now.includes(step) ? now.filter((each) => each !== step) : [...now, step]))
  }

  const ask = (query: string) => {
    take()
    asked.current = query
    setTyped(query)
    setActive([])
    if (query.trim() === '') {
      setFound(undefined)
      return
    }
    void import('./ask-engine').then(({ matchesOf }) => {
      if (asked.current !== query) return
      flip()
      setFound(matchesOf(query))
    })
  }

  const byslug = new Map(games.map((game) => [game.slug, game]))
  const matching = shown.flatMap((slug) => byslug.get(slug) ?? [])
  const boxes = matching.slice(0, MOST_SHOWN)

  return (
    <div ref={scope} className="rounded-panel border border-line bg-surface/70 p-4 sm:p-6">
      <label className="relative block">
        <span className="sr-only">{t('field')}</span>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={text}
          onChange={(event) => ask(event.target.value)}
          placeholder={t('placeholder')}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="h-11 w-full rounded-control border border-line-strong bg-surface pr-10 pl-9 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        {text ? (
          <button
            type="button"
            onClick={() => ask('')}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-text/8 hover:text-text"
          >
            <XIcon aria-hidden="true" className="size-4" />
            <span className="sr-only">{t('reset')}</span>
          </button>
        ) : null}
      </label>

      <div role="group" aria-label={t('steps.label')} className="mt-3 flex flex-wrap gap-2">
        {ASK_STEPS.map((step) => {
          const on = active.includes(step.key)
          return (
            <button
              key={step.key}
              type="button"
              aria-pressed={on}
              onClick={() => choose(step.key)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors duration-(--motion-quick)',
                on
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong bg-surface text-text hover:bg-surface-raised',
              )}
            >
              {t(`steps.${step.key}`)}
            </button>
          )
        })}
      </div>

      <p
        aria-live={touched ? 'polite' : 'off'}
        className="mt-5 flex h-6 items-baseline justify-between gap-4 text-sm"
      >
        <span className="readout text-[0.6875rem] text-muted">{t('example')}</span>
        <span className="tabular-nums">
          {found?.slugs.length === 0
            ? t('none')
            : matching.length === games.length
              ? t('all', { total: games.length })
              : t('count', { count: matching.length, total: games.length })}
        </span>
      </p>

      <ul className="demo-grid mt-2" aria-label={t('results')}>
        {boxes.map((game) => (
          <li key={game.slug} data-flip={game.slug} className="demo-cell">
            <DemoCase game={game} sizes={SIZES} />
          </li>
        ))}
      </ul>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        {t('tries')}
        {ASK_TRIES.map((query) => (
          <button
            key={query}
            type="button"
            onClick={() => ask(query)}
            className="rounded-control border border-dashed border-line-strong px-2 py-1 font-mono text-xs text-text hover:bg-surface-raised"
          >
            {query}
          </button>
        ))}
      </p>
    </div>
  )
}

/** The games every switched-on filter found, in the shelf's order. */
function keepAll(
  games: readonly AskGame[],
  active: readonly AskStep[],
  matches: Record<AskStep, readonly string[]>,
): string[] {
  const sets = active.map((step) => new Set(matches[step]))
  return games.map((game) => game.slug).filter((slug) => sets.every((set) => set.has(slug)))
}
