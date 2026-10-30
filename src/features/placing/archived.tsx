'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import type { ArchivedGame } from '@/domain/library/editing'
import { fold } from '@/domain/query/evaluate'
import { BringBack } from '@/features/add-game/bring-back'
import { Cover } from '@/features/library/cover'
import { libraryHref } from '@/features/library/shelf-address'
import { useAccount } from '@/features/owner/account'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'

import { OrganizeTabs } from './organize-tabs'

/** Rows drawn at first, and added each time more are asked for: years of archiving add up. */
const STEP = 50

/** From how many games a search is worth its room. */
const SEARCH_FROM = 10

/**
 * Organize's archived tab (spec 7.4), the one place archived games are
 * listed: each one's cover, title and platforms, and Bring back. A search
 * finds one among many, and the first 50 are drawn. Built ahead as a frame,
 * filled in the browser for the account signed in, as placing is.
 */
export function Archived() {
  const t = useTranslations('Placing')
  const account = useTranslations('AccountPage')
  const locale = useLocale()
  const who = useAccount()

  if (who.status === 'checking') return <p className="mt-6 text-muted">{account('checking')}</p>
  if (who.status !== 'signed-in') {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('signInFirst')}</p>
        <div className="mt-6">
          <Button variant="primary" asChild>
            <Link href={{ pathname: '/sign-in', query: { from: `/${locale}/account/archived` } }}>
              {account('signIn')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }
  return <ArchivedList handle={who.handle} />
}

/** The list, once the account is known: read, then brought back from here a game at a time. */
function ArchivedList({ handle }: { handle: string }) {
  const t = useTranslations('Placing.archived')
  const placing = useTranslations('Placing')
  const searchId = useId()
  const [games, setGames] = useState<ArchivedGame[] | 'failed'>()
  const [attempt, setAttempt] = useState(0)
  // Brought back on this visit: each stays in view, saying so, until the page is left.
  const [back, setBack] = useState<ReadonlySet<string>>(new Set())
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(STEP)

  useEffect(() => {
    let current = true
    void fetch('/api/v1/me/archived', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((answer: { games: ArchivedGame[] } | undefined) => {
        if (!current) return
        if (!answer) throw new Error('unread')
        setGames(answer.games)
      })
      .catch(() => {
        if (current) setGames('failed')
      })
    return () => {
      current = false
    }
  }, [attempt])

  const tabs = (
    <OrganizeTabs
      current="archived"
      {...(Array.isArray(games) ? { counts: { archived: games.length - back.size } } : {})}
    />
  )

  if (games === undefined) {
    return (
      <>
        {tabs}
        <p className="mt-6 text-muted">{placing('loading')}</p>
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
  if (games.length === 0) {
    return (
      <>
        {tabs}
        <div className="mt-6 grid max-w-xl justify-items-start gap-4">
          <p className="text-pretty">{t('empty')}</p>
          <Button variant="primary" asChild>
            <Link href={libraryHref(handle)}>{placing('toShelf')}</Link>
          </Button>
        </div>
      </>
    )
  }

  const words = fold(search.trim())
  const found = words ? games.filter((game) => fold(game.title).includes(words)) : games
  const shown = found.slice(0, limit)
  const remaining = found.length - shown.length

  return (
    <>
      {tabs}
      <p className="mt-6 max-w-2xl text-pretty text-muted">{t('intro')}</p>
      {games.length >= SEARCH_FROM ? (
        <div className="mt-6 grid max-w-sm gap-1.5">
          <label htmlFor={searchId} className="text-sm font-medium">
            {t('search')}
          </label>
          <Input
            id={searchId}
            type="search"
            autoComplete="off"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setLimit(STEP)
            }}
          />
        </div>
      ) : null}
      {found.length === 0 ? (
        <p className="mt-6 text-pretty" role="status">
          {t('noneFound', { search: search.trim() })}
        </p>
      ) : (
        <ul aria-label={t('list')} className="mt-6 grid max-w-2xl gap-3">
          {shown.map((game) => (
            <li key={game.entryId} className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
                <span className="font-semibold text-pretty">
                  {game.title}
                  {game.year ? (
                    <span className="ml-2 readout text-[0.6875rem] text-muted">{game.year}</span>
                  ) : null}
                </span>
                {game.platforms.length > 0 ? (
                  <span className="text-sm text-muted">
                    {t('copies', { platforms: game.platforms.join(' · ') })}
                  </span>
                ) : null}
              </span>
              <BringBack
                entryId={game.entryId}
                title={game.title}
                onBack={() => setBack((now) => new Set(now).add(game.entryId))}
              />
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 ? (
        <Button className="mt-4" onClick={() => setLimit((now) => now + STEP)}>
          {placing('more', { count: Math.min(STEP, remaining) })}
        </Button>
      ) : null}
    </>
  )
}
