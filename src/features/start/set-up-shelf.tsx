'use client'

import { CheckIcon, InboxIcon, LibraryBigIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import type { Standing } from '@/domain/library/placing'
import { libraryHref } from '@/features/library/shelf-address'
import { useAccount } from '@/features/owner/account'
import { readTally } from '@/features/placing/placing-client'
import { PlatformCardGhosts, PlatformCards } from '@/features/platforms/platforms'
import type { PlatformRow } from '@/features/platforms/sync-client'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Progress } from '@/ui/progress'
import { Loading } from '@/ui/ghost'
import { Ghosts } from '@/ui/ghosts'

const LINK = 'rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/** One step: its number, or a check once what it asks is true, and what to do. */
function Step({
  number,
  title,
  done,
  children,
}: {
  number: number
  title: string
  done: boolean
  children: ReactNode
}) {
  const t = useTranslations('Start')
  return (
    <li className="grid gap-x-5 gap-y-4 rounded-panel border border-line bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 place-items-center rounded-full border text-sm tabular-nums',
          done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-muted',
        )}
      >
        {done ? <CheckIcon className="size-4" /> : number}
      </span>
      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="title text-xl sm:text-2xl">{title}</h2>
          {/* Said in words, not by the check's color alone. */}
          {done ? (
            <span className="readout text-[0.625rem] text-muted uppercase">{t('done')}</span>
          ) : null}
        </div>
        {children}
      </div>
    </li>
  )
}

/** The two steps with their words, and ghosts for what is read from the shelf. */
function StepsGhosts() {
  const t = useTranslations('Start')
  const account = useTranslations('AccountPage')
  return (
    <Loading label={account('checking')}>
      <ol className="mt-8 grid gap-5">
        <Step number={1} title={t('bring.title')} done={false}>
          <p className="max-w-2xl text-pretty text-muted">{t('bring.body')}</p>
          <div className="grid gap-5">
            <PlatformCardGhosts />
          </div>
        </Step>
        <Step number={2} title={t('place.title')} done={false}>
          <p className="max-w-2xl text-pretty text-muted">{t('place.body')}</p>
          <Ghosts lines={2} className="max-w-md" />
        </Step>
      </ol>
    </Loading>
  )
}

/**
 * The two steps, once the account is known. What each asks is read from the
 * shelf as it is, so a step checks itself off: games on the shelf with no
 * platform question left, then every game given a status. The tally is read
 * again whenever a card's counts move, as a sync adds games or a question
 * is answered.
 */
function Steps({ handle }: { handle: string }) {
  const t = useTranslations('Start')
  const [rows, setRows] = useState<PlatformRow[]>()
  const [standing, setStanding] = useState<Standing>()
  const [trouble, setTrouble] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const moved = rows ? JSON.stringify(rows.map((row) => row.link?.counts ?? null)) : ''
  useEffect(() => {
    const abort = new AbortController()
    void readTally(abort.signal).then((answer) => {
      if (abort.signal.aborted) return
      setTrouble(!answer.ok)
      if (answer.ok) setStanding(answer.value)
    })
    return () => abort.abort()
  }, [moved, attempt])

  const total = standing
    ? Object.values(standing.tally).reduce((sum, count) => sum + count, 0)
    : undefined
  const unsorted = standing?.tally.unsorted ?? 0
  const waiting = rows?.reduce((sum, row) => sum + (row.link?.counts['needs-you'] ?? 0), 0) ?? 0
  const brought = total !== undefined && total > 0 && rows !== undefined && waiting === 0
  const placed = total !== undefined && total > 0 && unsorted === 0

  return (
    <>
      {trouble ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p>{t('failed')}</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {t('retry')}
          </Button>
        </div>
      ) : null}

      <ol aria-label={t('steps')} className="mt-8 grid gap-5">
        <Step number={1} title={t('bring.title')} done={brought}>
          <p className="max-w-2xl text-pretty text-muted">{t('bring.body')}</p>
          <div className="grid gap-5">
            <PlatformCards handle={handle} page="start" onRows={setRows} />
          </div>
          <p className="max-w-2xl text-sm text-pretty">
            {t.rich('bring.byHand', {
              shelf: (chunks) => (
                <Link href={libraryHref(handle)} className={LINK}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
          {waiting > 0 ? (
            <p className="text-sm font-medium">{t('bring.waiting', { count: waiting })}</p>
          ) : total ? (
            <p className="text-sm font-medium">{t('bring.onShelf', { count: total })}</p>
          ) : null}
        </Step>

        <Step number={2} title={t('place.title')} done={placed}>
          <p className="max-w-2xl text-pretty text-muted">{t('place.body')}</p>
          {total === undefined ? (
            trouble ? null : (
              <Ghosts lines={2} className="max-w-md" />
            )
          ) : total === 0 ? (
            <p className="text-sm text-muted">{t('place.nothingYet')}</p>
          ) : unsorted > 0 ? (
            <div className="grid max-w-md gap-3">
              <p className="text-sm font-medium">{t('place.left', { count: unsorted, total })}</p>
              <Progress value={total - unsorted} max={total} aria-label={t('place.share')} />
              <div>
                <Button variant="primary" asChild>
                  <Link href="/account/unsorted">
                    <InboxIcon aria-hidden="true" />
                    {t('place.go')}
                  </Link>
                </Button>
              </div>
              <p className="text-sm text-pretty text-muted">{t('place.later')}</p>
            </div>
          ) : (
            <p className="text-sm font-medium">{t('place.none', { count: total })}</p>
          )}
        </Step>
      </ol>

      <div className="mt-8">
        {/* The way out is the page's main action once nothing is left to do. */}
        <Button variant={brought && placed ? 'primary' : 'secondary'} asChild>
          <Link href={libraryHref(handle)}>
            <LibraryBigIcon aria-hidden="true" />
            {t('toShelf')}
          </Link>
        </Button>
      </div>
    </>
  )
}

/**
 * Setting a new shelf up, where signing up leads: bring the games in, from a
 * platform or by hand, then say where each one stands. Nothing here is new:
 * the same platform cards as the account page, and the way to the page for
 * placing a sync's games (spec 4.5).
 */
export function SetUpShelf() {
  const t = useTranslations('Start')
  const account = useTranslations('AccountPage')
  const locale = useLocale()
  const who = useAccount('checking')

  if (who.status === 'visitor') {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('signInFirst')}</p>
        <div className="mt-6">
          <Button variant="primary" asChild>
            <Link href={{ pathname: '/sign-in', query: { from: `/${locale}/account/start` } }}>
              {account('signIn')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="mt-4 max-w-2xl text-lg text-pretty text-muted">{t('intro')}</p>
      {who.status === 'checking' ? <StepsGhosts /> : <Steps handle={who.handle} />}
    </>
  )
}
