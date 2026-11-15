import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'

import { isMeasured, type Fact } from '@/domain/duel/facts'
import { useDuration } from '@/features/library/duration'

type Side = 'a' | 'b'

/** A value as the eye reads it, and in full words for a screen reader. */
type Said = { shown: string; long?: string } | undefined

/** How long a game has waited, in the largest whole unit: days, then months, then years. */
const waitedIn = (days: number): { unit: 'days' | 'months' | 'years'; count: number } =>
  days >= 365
    ? { unit: 'years', count: Math.floor(days / 365) }
    : days >= 30
      ? { unit: 'months', count: Math.floor(days / 30) }
      : { unit: 'days', count: days }

/** One side's words for a fact, or undefined when it isn't known on that side. */
function useSay() {
  const t = useTranslations('Duel.fight.value')
  const duration = useDuration()
  // Commas only, in every language: a genre named with "and" in it ("Hack and slash") would run
  // into the next, and Portuguese would tie English names with "e".
  const list = (names: string[]) => names.join(', ')

  return (fact: Fact, side: 0 | 1): Said => {
    switch (fact.key) {
      case 'length': {
        const value = fact.values[side]
        if (!value) return undefined
        const hours = Math.max(1, Math.round(value.minutes / 60))
        const low = value.hasty === undefined ? hours : Math.max(1, Math.round(value.hasty / 60))
        return low < hours
          ? {
              shown: t('lengthRange', { low, high: hours }),
              long: t('lengthRangeLong', { low, high: hours }),
            }
          : { shown: t('length', { hours }), long: t('lengthLong', { hours }) }
      }
      case 'score': {
        const value = fact.values[side]
        if (!value) return undefined
        const rating = Math.round(value.rating)
        return {
          shown: t('score', { rating }),
          long: t('scoreLong', { rating, count: value.count }),
        }
      }
      case 'waiting': {
        const value = fact.values[side]
        if (!value) return undefined
        const { unit, count } = waitedIn(value.days)
        return { shown: t(unit, { count }) }
      }
      case 'played': {
        const value = fact.values[side]
        return value
          ? { shown: duration(value.minutes), long: duration(value.minutes, true) }
          : { shown: t('notStarted') }
      }
      case 'released': {
        const value = fact.values[side]
        return value ? { shown: String(value.year) } : undefined
      }
      case 'platforms': {
        const value = fact.values[side]
        if (!value) return undefined
        return 'wanted' in value
          ? { shown: t('wantedOn', { platforms: list(value.wanted) }) }
          : {
              shown: list(
                value.owned.map(({ platform, format: kind }) =>
                  t('copy', { platform, format: t(kind) }),
                ),
              ),
            }
      }
      case 'genres':
      case 'modes': {
        const value = fact.values[side]
        return value ? { shown: list(value.names) } : undefined
      }
    }
  }
}

function Value({ said, unknown }: { said: Said; unknown: string }) {
  if (!said) {
    return (
      <span className="duel-value" data-empty="">
        {unknown}
      </span>
    )
  }
  return said.long ? (
    <span className="duel-value">
      <span aria-hidden="true">{said.shown}</span>
      <span className="sr-only">{said.long}</span>
    </span>
  ) : (
    <span className="duel-value">{said.shown}</span>
  )
}

function Cell({ side, children, share }: { side: Side; children: ReactNode; share?: number }) {
  return (
    <td data-side={side}>
      {children}
      {share === undefined ? null : (
        <span aria-hidden="true" className="duel-track">
          <span className="duel-fill" style={{ '--share': share } as CSSProperties} />
        </span>
      )}
    </td>
  )
}

/**
 * Two games' facts side by side (spec 3.14), as a fighting game sets two fighters' stats against
 * each other: the fact's name in the middle, each game's value toward it, and, for what can be
 * measured, a bar growing out from the middle. A table underneath, so a screen reader hears each
 * row's fact and whose value is whose. Nothing is marked better: the bars only show which is more.
 */
export function FactTable({
  facts,
  titles,
}: {
  facts: Fact[]
  /** The two games' titles, the table's column headings for a screen reader. */
  titles: readonly [string, string]
}) {
  const t = useTranslations('Duel.fight')
  const say = useSay()
  const unknown = t('value.unknown')
  return (
    <table className="duel-table">
      <caption className="sr-only">{t('facts', { a: titles[0], b: titles[1] })}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{titles[0]}</th>
          <th scope="col">{t('factColumn')}</th>
          <th scope="col">{titles[1]}</th>
        </tr>
      </thead>
      <tbody>
        {facts.map((fact) => {
          const measured = isMeasured(fact)
          const [a, b] = [say(fact, 0), say(fact, 1)]
          // A side that isn't known draws no bar: an empty one would read as none at all.
          return (
            <tr key={fact.key}>
              <Cell side="a" {...(measured && fact.values[0] ? { share: fact.shares[0] } : {})}>
                <Value said={a} unknown={unknown} />
              </Cell>
              <th scope="row">{t(`fact.${fact.key}`)}</th>
              <Cell side="b" {...(measured && fact.values[1] ? { share: fact.shares[1] } : {})}>
                <Value said={b} unknown={unknown} />
              </Cell>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
