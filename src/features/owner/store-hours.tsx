'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { StoreHoursGame } from '@/domain/library/editing'
import type { IgdbTime } from '@/domain/library/hours'
import type { SyncSource } from '@/domain/library/values'
import { editClient } from '@/features/game-detail/edit-client'
import { Cover } from '@/features/library/cover'
import { announceChange } from '@/features/owner/library-change'
import { Button } from '@/ui/button'
import { NumberField } from '@/ui/number-field'

/** What `GET /api/v1/me/hours` answers, in the API's units. */
type ApiStoreHours = {
  games: (Omit<StoreHoursGame, 'reported' | 'igdb'> & {
    hoursReported: number
    igdb: { hours: number; of: IgdbTime['of'] }
  })[]
}

/** What was said of a game here: time taken out, or its hours kept. */
type Said = { idle: number } | 'kept'

/** Whole hours: beside IGDB's estimate, a tenth would be a precision neither has. */
const wholeHours = (minutes: number) => Math.round(minutes / 60)

/**
 * The games whose stores report far past IGDB's time, offered for a look
 * (ADR 003): Steam and Nintendo count the whole time a game is open, so one
 * left running counts as played. Each can have its idle time taken out, or
 * its hours kept as they are; either way it is not offered again. Not there
 * at all while there is none.
 */
export function StoreHours() {
  const t = useTranslations('AccountPage.hours')
  const edit = useTranslations('Edit')
  const sync = useTranslations('Sync')
  const errors = useTranslations('Add')
  const locale = useLocale()
  const [games, setGames] = useState<StoreHoursGame[]>()
  const [said, setSaid] = useState<Record<string, Said>>({})
  const [problem, setProblem] = useState<Record<string, string>>({})

  useEffect(() => {
    let current = true
    void fetch('/api/v1/me/hours', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((answer: ApiStoreHours | undefined) => {
        if (!current || !answer) return
        setGames(
          answer.games.map(({ hoursReported, igdb, ...game }) => ({
            ...game,
            reported: Math.round(hoursReported * 60),
            igdb: { minutes: Math.round(igdb.hours * 60), of: igdb.of },
          })),
        )
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  if (!games || games.length === 0) return null

  const hoursText = (hours: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(hours)
  const storesOf = (sources: readonly SyncSource[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(
      sources.map((source) => sync(`source.${source}`)),
    )

  /** Saves what was said of a game; on a refusal, says why beside it. */
  const answer = async (game: StoreHoursGame, idle: number) => {
    setProblem(({ [game.entryId]: _, ...rest }) => rest)
    const result = await editClient
      .update(game.entryId, { idle })
      .catch(() => ({ ok: false as const, reason: 'failed' as const }))
    if (!result.ok) {
      setProblem((all) => ({ ...all, [game.entryId]: errors(`errors.${result.reason}`) }))
      return
    }
    setSaid((all) => ({ ...all, [game.entryId]: idle > 0 ? { idle } : 'kept' }))
    announceChange({ version: result.value.version })
  }

  return (
    <section aria-labelledby="store-hours" className="grid max-w-xl gap-3">
      <h2 id="store-hours" className="title text-xl">
        {t('title')}
      </h2>
      <p className="text-sm text-pretty text-muted">{t('intro')}</p>
      <ul className="grid gap-6 pt-2">
        {games.map((game) => {
          const now = said[game.entryId]
          return (
            <li key={game.entryId}>
              <div role="group" aria-labelledby={`hours-${game.entryId}`} className="grid gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="relative block w-10 flex-none overflow-hidden rounded-[3px] bg-text/8"
                    style={{ aspectRatio: '3 / 4' }}
                  >
                    <Cover
                      cover={game.cover}
                      colors={game.colors}
                      hash={game.hash}
                      title={game.title}
                      sizes="40px"
                    />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-semibold">
                      <span id={`hours-${game.entryId}`}>{game.title}</span>
                      {game.year ? (
                        <span className="ml-2 readout text-[0.6875rem] text-muted">
                          {game.year}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted">
                      {t('counted', {
                        stores: storesOf(game.sources),
                        hours: wholeHours(game.reported),
                      })}
                      {' · '}
                      {t(`igdb.${game.igdb.of}`, { hours: wholeHours(game.igdb.minutes) })}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pl-13">
                  <NumberField
                    label={edit('idle')}
                    value={now && now !== 'kept' ? now.idle / 60 : undefined}
                    decimals={1}
                    max={game.reported / 60}
                    unit="h"
                    format={hoursText}
                    decreaseLabel={edit('hourFewer')}
                    increaseLabel={edit('hourMore')}
                    onCommit={(hours) => void answer(game, Math.round((hours ?? 0) * 60))}
                  />
                  {now === undefined ? (
                    <Button variant="secondary" onClick={() => void answer(game, 0)}>
                      {t('keep')}
                    </Button>
                  ) : null}
                </div>
                <p className="pl-13 text-sm text-muted" aria-live="polite">
                  {now === 'kept'
                    ? t('kept')
                    : now
                      ? t('taken', { hours: wholeHours(Math.max(0, game.reported - now.idle)) })
                      : ''}
                </p>
                {problem[game.entryId] ? (
                  <p role="alert" className="pl-13 text-sm">
                    {problem[game.entryId]}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
