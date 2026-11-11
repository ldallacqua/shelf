'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { StoreHoursGame } from '@/domain/library/editing'
import type { IgdbTime } from '@/domain/library/hours'
import type { SyncSource } from '@/domain/library/values'
import { editClient } from '@/features/game-detail/edit-client'
import { Cover } from '@/features/library/cover'
import { libraryHref } from '@/features/library/shelf-address'
import { useAccount } from '@/features/owner/account'
import { announceChange } from '@/features/owner/library-change'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Ghost, GhostText, Loading } from '@/ui/ghost'
import { NumberField } from '@/ui/number-field'

import { OrganizeTabs } from './organize-tabs'

/** What `GET /api/v1/me/hours` answers, in the API's units. */
type ApiStoreHours = {
  games: (Omit<StoreHoursGame, 'reported' | 'igdb'> & {
    hoursReported: number
    igdb: { hours: number; of: IgdbTime['of'] }
  })[]
}

/** What was said of a game here: time taken out, or its hours kept. */
type Said = { idle: number } | 'kept'

/** Rows of ghosts while the list is read: few games are offered at a time. */
const GHOST_ROWS = 4

/** Whole hours: beside IGDB's estimate, a tenth would be a precision neither has. */
const wholeHours = (minutes: number) => Math.round(minutes / 60)

/**
 * Organize's hours tab (spec 4.7): the games whose stores report far past
 * IGDB's time, offered for a look. Steam and Nintendo count the whole time a
 * game is open, so one left running counts as played. Each can have its idle
 * time taken out, or its hours kept as they are; either way it is not offered
 * again. Built ahead as a frame, filled in the browser for the account signed
 * in, as placing is.
 */
export function StoreHours() {
  const t = useTranslations('Placing')
  const account = useTranslations('AccountPage')
  const locale = useLocale()
  const who = useAccount('checking')

  if (who.status === 'visitor') {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('signInFirst')}</p>
        <div className="mt-6">
          <Button variant="primary" asChild>
            <Link href={{ pathname: '/sign-in', query: { from: `/${locale}/account/hours` } }}>
              {account('signIn')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }
  if (who.status === 'checking') {
    return (
      <>
        <OrganizeTabs current="hours" />
        <HoursGhosts />
      </>
    )
  }
  return <HoursList handle={who.handle} />
}

/** The list on its way, under the words that say what it is. */
function HoursGhosts() {
  const t = useTranslations('Placing')
  return (
    <>
      <p className="mt-6 max-w-2xl text-pretty text-muted">{t('storeHours.intro')}</p>
      <Loading label={t('loading')} className="mt-6 grid max-w-xl gap-6">
        {Array.from({ length: GHOST_ROWS }, (_, row) => (
          <div key={row} className="grid gap-3">
            <div className="flex items-center gap-3">
              <Ghost order={row} className="aspect-[3/4] w-10 flex-none rounded-[3px]" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <GhostText order={row} className="w-1/2" />
                <span className="text-sm">
                  <GhostText order={row} className="w-4/5" />
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pl-13">
              <span className="grid gap-1.5 text-sm">
                <GhostText order={row} className="w-28" />
                <Ghost order={row} className="h-10 w-44 rounded-control pointer-coarse:h-11" />
              </span>
              <Ghost order={row} className="h-10 w-32 rounded-control pointer-coarse:h-11" />
            </div>
          </div>
        ))}
      </Loading>
    </>
  )
}

/** The list, once the account is known: read, then answered here a game at a time. */
function HoursList({ handle }: { handle: string }) {
  const t = useTranslations('Placing.storeHours')
  const placing = useTranslations('Placing')
  const edit = useTranslations('Edit')
  const sync = useTranslations('Sync')
  const errors = useTranslations('Add')
  const locale = useLocale()
  const [games, setGames] = useState<StoreHoursGame[] | 'failed'>()
  const [said, setSaid] = useState<Record<string, Said>>({})
  const [problem, setProblem] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    void fetch('/api/v1/me/hours', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<ApiStoreHours>) : undefined))
      .then((answer) => {
        if (!current) return
        if (!answer) throw new Error('unread')
        setGames(
          answer.games.map(({ hoursReported, igdb, ...game }) => ({
            ...game,
            reported: Math.round(hoursReported * 60),
            igdb: { minutes: Math.round(igdb.hours * 60), of: igdb.of },
          })),
        )
      })
      .catch(() => {
        if (current) setGames('failed')
      })
    return () => {
      current = false
    }
  }, [attempt])

  // The tab counts what is still to say: a game answered here stays in view until the page is left.
  const waiting = Array.isArray(games)
    ? games.filter((game) => said[game.entryId] === undefined).length
    : undefined
  const tabs = (
    <OrganizeTabs
      current="hours"
      {...(games === undefined ? {} : { counts: { hours: waiting ?? 0 } })}
    />
  )

  if (games === undefined) {
    return (
      <>
        {tabs}
        <HoursGhosts />
      </>
    )
  }
  if (games === 'failed') {
    return (
      <>
        {tabs}
        <div className="mt-6 grid max-w-xl justify-items-start gap-4">
          <p role="alert">{placing('failed')}</p>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            {placing('retry')}
          </Button>
        </div>
      </>
    )
  }

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
    <>
      {tabs}
      <p className="mt-6 max-w-2xl text-pretty text-muted">{t('intro')}</p>
      {games.length === 0 ? (
        <div className="mt-6 grid max-w-xl justify-items-start gap-4">
          <p className="text-pretty">{t('empty')}</p>
          <Button variant="primary" asChild>
            <Link href={libraryHref(handle)}>{placing('toShelf')}</Link>
          </Button>
        </div>
      ) : (
        <ul aria-label={t('list')} className="mt-6 grid max-w-xl gap-6">
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
      )}
    </>
  )
}
