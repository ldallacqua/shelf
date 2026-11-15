import { useFormatter, useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { isMeasured, type Fact } from '@/domain/duel/facts'
import { coverSources } from '@/domain/igdb/images'
import { buttonVariants } from '@/ui/button'
import { cn } from '@/ui/cn'

import type { DemoGame } from './demo-case'
import { Scene } from './scene'

import '@/features/duel/duel.css'

/** The facts the example's duel shows: what doesn't depend on the day the page was built. */
export const DEMO_FACTS = ['length', 'score', 'released', 'genres'] as const
type DemoFact = (typeof DEMO_FACTS)[number]

/** The rounds a bracket of eight narrows through, with how many games each starts with. */
const FUNNEL = [
  { round: 'quarterfinal', games: 8 },
  { round: 'semifinal', games: 4 },
  { round: 'final', games: 2 },
  { round: 'next', games: 1 },
] as const

/**
 * One duel of the example shelf's backlog (spec 3.14), as `/account/duel` draws it: the round, the
 * two games under their lights with VS between them, their facts side by side, and Choose on each.
 * Choosing works with no script: the two Chooses are radio buttons, and CSS lights the game chosen,
 * dims the other and says which goes on. Under it, the bracket's rounds narrowing to one game.
 */
export function DuelDemo({
  games,
  facts,
}: {
  games: readonly [DemoGame, DemoGame]
  facts: Fact[]
}) {
  const t = useTranslations('Landing.duel')
  const format = useFormatter()

  /** A value as the eye reads it, and in full words for a screen reader where they differ. */
  const said = (fact: Fact, side: 0 | 1): { shown: string; long?: string } | undefined => {
    switch (fact.key) {
      case 'length': {
        const value = fact.values[side]
        if (!value) return undefined
        const high = Math.max(1, Math.round(value.minutes / 60))
        const low = value.hasty === undefined ? high : Math.max(1, Math.round(value.hasty / 60))
        return low < high
          ? { shown: t('lengthRange', { low, high }), long: t('lengthRangeLong', { low, high }) }
          : { shown: t('length', { hours: high }), long: t('lengthLong', { hours: high }) }
      }
      case 'score': {
        const value = fact.values[side]
        if (!value) return undefined
        const rating = Math.round(value.rating)
        return { shown: format.number(rating), long: t('scoreLong', { rating }) }
      }
      case 'released': {
        const value = fact.values[side]
        return value ? { shown: String(value.year) } : undefined
      }
      case 'genres': {
        const value = fact.values[side]
        // Commas only, in every language, as the duel's own table lists them.
        return value ? { shown: value.names.join(', ') } : undefined
      }
      default:
        return undefined
    }
  }

  /** One side's value, toward the fact's name, with its bar when the fact is measured. */
  const cell = (fact: Fact, side: 0 | 1) => {
    const value = said(fact, side)
    return (
      <td data-side={side === 0 ? 'a' : 'b'}>
        {value?.long ? (
          <span className="duel-value">
            <span aria-hidden="true">{value.shown}</span>
            <span className="sr-only">{value.long}</span>
          </span>
        ) : (
          <span className="duel-value" {...(value ? {} : { 'data-empty': '' })}>
            {value?.shown ?? t('unknown')}
          </span>
        )}
        {isMeasured(fact) && value ? (
          <span aria-hidden="true" className="duel-track">
            <span className="duel-fill" style={{ '--share': fact.shares[side] } as CSSProperties} />
          </span>
        ) : null}
      </td>
    )
  }

  return (
    <Scene className="duel-demo rounded-panel border border-line bg-surface/70 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="title text-xl sm:text-2xl">{t('round')}</p>
        <p className="readout text-[0.625rem] text-muted">{t('position')}</p>
      </div>
      <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full w-[29%] rounded-full bg-accent" />
      </div>

      <fieldset className="mt-6">
        <legend className="mb-4 w-full text-center text-base text-pretty sm:text-lg">
          {t('question')}
        </legend>
        <div className="duel-arena duel-demo-arena">
          {games.map((game, index) => {
            const side = index === 0 ? 'a' : 'b'
            return (
              <div
                key={game.slug}
                className="duel-fighter"
                data-side={side}
                style={{ '--case-led': game.led } as CSSProperties}
              >
                <span className="duel-niche">
                  <span className="duel-cover">
                    {/* Covers come straight from the image servers, which resize and cache them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt=""
                      {...coverSources(game.cover, 'cover_big')}
                      sizes="(min-width: 40rem) 176px, 30vw"
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                      style={{ backgroundColor: game.colors[2] }}
                    />
                  </span>
                  <span aria-hidden="true" className="duel-plinth" />
                </span>
                <div className="grid w-full max-w-60 content-start justify-items-center gap-1">
                  <p className="line-clamp-2 text-sm font-semibold text-balance sm:text-base">
                    {game.title}
                  </p>
                  {game.year === undefined ? null : (
                    <p className="text-xs text-muted">{game.year}</p>
                  )}
                </div>
                <label
                  className={cn(
                    buttonVariants({ variant: 'primary' }),
                    'duel-demo-choose w-full max-w-60 cursor-pointer',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  )}
                >
                  <input
                    type="radio"
                    name="duel-demo"
                    value={side}
                    className="sr-only"
                    aria-label={t('choose', { title: game.title })}
                  />
                  {t('chooseShort')}
                </label>
              </div>
            )
          })}
          <div className="duel-versus">
            <span className="duel-vs" aria-hidden="true">
              {t('vs')}
            </span>
          </div>
          <div className="duel-facts">
            <table className="duel-table">
              <caption className="sr-only">
                {t('facts', { a: games[0].title, b: games[1].title })}
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{games[0].title}</th>
                  <th scope="col">{t('factColumn')}</th>
                  <th scope="col">{games[1].title}</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((fact) => (
                  <tr key={fact.key}>
                    {cell(fact, 0)}
                    <th scope="row">{t(`fact.${fact.key as DemoFact}`)}</th>
                    {cell(fact, 1)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </fieldset>

      {games.map((game, index) => (
        <p
          key={game.slug}
          className="duel-demo-result mt-5 text-center text-sm font-semibold"
          data-for={index === 0 ? 'a' : 'b'}
        >
          {t('goesOn', { title: game.title })}
        </p>
      ))}

      <p
        id="duel-demo-funnel"
        className="mt-6 border-t border-line pt-5 text-center readout text-[0.5625rem] text-muted"
      >
        {t('funnel.label')}
      </p>
      <ol aria-labelledby="duel-demo-funnel" className="mt-3 grid grid-cols-4 gap-2">
        {FUNNEL.map(({ round, games: count }, index) => (
          <li key={round} className="grid justify-items-center gap-1 text-center">
            <span
              className={cn(
                'title text-2xl sm:text-3xl',
                index === 0 ? 'text-accent' : 'text-muted',
              )}
            >
              {count}
            </span>
            <span className="readout text-[0.5625rem] text-muted">{t(`funnel.${round}`)}</span>
          </li>
        ))}
      </ol>
    </Scene>
  )
}
