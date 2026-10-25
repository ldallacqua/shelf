'use client'

import { ExternalLinkIcon, InboxIcon, RefreshCwIcon, UnlinkIcon } from 'lucide-react'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

import type { Answer } from '@/domain/library/adding'
import type { SyncSource } from '@/domain/library/values'
import type { LinkPage, LinkView, SyncStep } from '@/domain/sync/link'
import { STEAM_PRIVACY_SETTINGS } from '@/domain/sync/steam'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Switch } from '@/ui/checkbox'
import { Progress } from '@/ui/progress'

import { ItemLists } from './item-lists'
import { NintendoSignIn } from './nintendo-sign-in'
import {
  connectAddress,
  readPlatforms,
  setDaily,
  syncStep,
  unlink,
  type PlatformRow,
} from './sync-client'

/** Said after an action, in the card it belongs to. */
type Said = { tone: 'done' | 'trouble'; text: string }

function Message({ said }: { said?: Said }) {
  if (!said) return null
  return (
    <p
      role={said.tone === 'trouble' ? 'alert' : 'status'}
      className={
        said.tone === 'trouble'
          ? 'rounded-control border border-line-strong px-4 py-3 text-sm'
          : 'text-sm text-muted'
      }
    >
      {said.text}
    </p>
  )
}

/**
 * Steam's privacy settings, linked from the words that send me there: where
 * to go is quicker followed than read, or drawn. In a tab of its own, so the
 * card is still here to sync from after.
 */
const steamSettings = (chunks: ReactNode) => (
  <a
    href={STEAM_PRIVACY_SETTINGS}
    target="_blank"
    rel="noopener noreferrer"
    className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
  >
    {chunks}
    <ExternalLinkIcon aria-hidden="true" className="ml-1 inline size-3.5 align-[-0.125em]" />
  </a>
)

type Outcome = 'linked' | 'failed'

/** What "Sign in through Steam" opened with, read once from the address and then taken off it. */
const takeOutcome = (): Outcome | undefined => {
  const address = new URL(window.location.href)
  const outcome = address.searchParams.get('steam')
  if (outcome !== 'linked' && outcome !== 'failed') return undefined
  address.searchParams.delete('steam')
  window.history.replaceState(window.history.state, '', address)
  return outcome
}

/** How far a sync has got: games added, of those matched so far. */
type Running = { done: number; total: number }

/**
 * One platform, linked or not (ADR 003). Unlinked: what linking does, and
 * the way to the platform's own sign-in: Steam's button, or Nintendo's page
 * and the link to paste back. Linked: when it last synced, how many games
 * it put on the shelf, Sync now with its progress, the daily switch, the
 * lists of games that need an answer, and the way to disconnect.
 */
function PlatformCard({
  row,
  handle,
  page,
  outcome,
  onChange,
}: {
  row: PlatformRow
  handle: string
  /** The page the card is on, which Steam's sign-in comes back to. */
  page: LinkPage
  /** Back from Steam's sign-in: how it went. Linked, the first sync starts by itself. */
  outcome?: Outcome
  onChange: (link: LinkView | null) => void
}) {
  const t = useTranslations('Sync')
  const placing = useTranslations('Placing')
  const format = useFormatter()
  // "Last synced 3 minutes ago" moves on by itself.
  const now = useNow({ updateInterval: 60_000 })
  const locale = useLocale()
  const dailyId = useId()
  const source: SyncSource = row.source
  const name = t(`source.${source}`)
  const link = row.link
  const starting = outcome === 'linked' && link !== null
  const [running, setRunning] = useState<Running | undefined>(
    starting ? { done: 0, total: 0 } : undefined,
  )
  const [said, setSaid] = useState<Said | undefined>(
    outcome === 'failed'
      ? { tone: 'trouble', text: t('linkFailed') }
      : starting
        ? { tone: 'done', text: t('linked') }
        : undefined,
  )
  const [asking, setAsking] = useState(false)
  const [stamp, setStamp] = useState(0)
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false
    return () => {
      stopped.current = true
    }
  }, [])

  /** After the first step, the rest until nothing is left, the progress shown as they come. */
  const steps = useCallback(
    async (first: Answer<SyncStep>) => {
      let done = 0
      let answer = first
      while (answer.ok && !stopped.current) {
        done += answer.value.added
        onChange(answer.value.link)
        setRunning({ done, total: done + answer.value.link.counts.adding })
        if (answer.value.remaining === 0) break
        answer = await syncStep(source, false)
      }
      if (stopped.current) return
      setRunning(undefined)
      setStamp((value) => value + 1)
      if (!answer.ok) {
        setSaid({
          tone: 'trouble',
          text: answer.reason === 'too-many' ? t('tooMany') : t('failed'),
        })
      } else if (!answer.value.link.problem) {
        // Games waiting for me are not "up to date": the card says how many.
        const waiting = answer.value.link.counts['needs-you']
        const came = t('done', { count: done, source: name })
        setSaid({
          tone: 'done',
          text:
            waiting === 0
              ? came
              : done === 0
                ? t('waiting', { count: waiting })
                : `${came} ${t('waiting', { count: waiting })}`,
        })
      }
    },
    [name, onChange, source, t],
  )

  const sync = () => {
    setSaid(undefined)
    setRunning({ done: 0, total: 0 })
    void syncStep(source, true).then(steps)
  }

  /** Signed in on Nintendo's page and pasted back: the link as it is now, then its first sync. */
  const linked = async () => {
    const answer = await readPlatforms()
    if (answer.ok) onChange(answer.value.find((each) => each.source === source)?.link ?? null)
    sync()
    setSaid({ tone: 'done', text: t('linked') })
  }

  useEffect(() => {
    if (starting) void syncStep(source, true).then(steps)
    // Once, as the card opens back from Steam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(async () => {
    const answer = await readPlatforms()
    if (answer.ok) onChange(answer.value.find((each) => each.source === source)?.link ?? null)
    setStamp((value) => value + 1)
  }, [onChange, source])

  return (
    <article className="grid gap-4 rounded-panel border border-line bg-surface p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="title text-lg">{name}</h3>
        {link ? (
          <p className="text-sm text-muted">
            {link.name ? t('linkedAs', { name: link.name }) : null}
          </p>
        ) : null}
      </header>

      {!link && source === 'nintendo' ? (
        <>
          <p className="max-w-xl text-sm text-pretty">{t('nintendo.about')}</p>
          <NintendoSignIn onLinked={() => void linked()} />
          <Link
            href="/privacy"
            className="w-fit text-sm underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            {t('kept')}
          </Link>
          <Message said={said} />
        </>
      ) : !link ? (
        <>
          <p className="max-w-xl text-sm text-pretty">{t('steam.about')}</p>
          <p className="max-w-xl text-sm text-pretty text-muted">
            {t.rich('steam.public', { settings: steamSettings })}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {/*
             * A plain link: the browser leaves for Steam's own page and comes back.
             * Valve asks for its own button where its sign-in is offered: this is
             * sits_01.png from steamcommunity.com/dev, served from here, as the
             * pages' rules allow images only from our own origin and IGDB's.
             */}
            <a
              href={connectAddress(source, locale, page)}
              className="inline-flex rounded-[3px] transition-[filter] duration-quick ease-settle hover:brightness-125"
            >
              {/* Valve's fixed artwork at its own size: next/image would only add a request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/platforms/sign-in-through-steam.png"
                width={180}
                height={35}
                alt={t('steam.signIn')}
              />
            </a>
            <Link
              href="/privacy"
              className="text-sm underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {t('kept')}
            </Link>
          </div>
          <Message said={said} />
        </>
      ) : (
        <>
          <div className="grid gap-1 text-sm">
            <p>{t('onShelf', { count: link.counts['on-shelf'], source: name })}</p>
            <p className="text-muted">
              {link.syncedAt
                ? t('syncedOn', {
                    // The server's clock may run a moment ahead of this one: never "in 2 seconds".
                    when: format.relativeTime(Math.min(link.syncedAt, now.getTime()), now),
                  })
                : t('never')}
            </p>
          </div>

          {link.problem ? (
            <p role="alert" className="rounded-control border border-line-strong px-4 py-3 text-sm">
              {t.rich(`problem.${link.problem}`, { source: name, settings: steamSettings })}
            </p>
          ) : null}
          {link.problem === 'signed-out' && source === 'nintendo' ? (
            <NintendoSignIn again onLinked={() => void linked()} />
          ) : null}

          {running ? (
            <div className="grid max-w-md gap-2" aria-live="polite">
              <Progress
                value={running.done}
                max={Math.max(running.total, 1)}
                aria-label={t('progressLabel', { source: name })}
              />
              <p className="text-sm text-muted">
                {t('progress', { done: running.done, total: running.total })}
              </p>
            </div>
          ) : null}
          <Message said={said} />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button variant="primary" disabled={running !== undefined} onClick={sync}>
              <RefreshCwIcon aria-hidden="true" />
              {running ? t('syncing') : t('syncNow')}
            </Button>
            {link.counts.unsorted > 0 && page === 'account' ? (
              // What it brought in waits for me to say where each game stands (spec 4.5). On the
              // page that sets a shelf up, its next step leads there, for every platform at once.
              <Button asChild>
                <Link href="/account/unsorted">
                  <InboxIcon aria-hidden="true" />
                  {placing('toPlace', { count: link.counts.unsorted })}
                </Link>
              </Button>
            ) : null}
            <label htmlFor={dailyId} className="inline-flex items-center gap-3 text-sm">
              <Switch
                id={dailyId}
                checked={link.daily}
                onChange={async (event) => {
                  const answer = await setDaily(source, event.target.checked)
                  if (answer.ok) onChange(answer.value)
                  else setSaid({ tone: 'trouble', text: t('failed') })
                }}
              />
              {t('daily')}
            </label>
          </div>

          <ItemLists
            source={source}
            handle={handle}
            counts={link.counts}
            stamp={stamp}
            busy={running !== undefined}
            onAnswered={(text) => {
              if (text) setSaid({ tone: 'done', text })
              void refresh()
            }}
            onSteps={(first) => {
              // Many answered at once: the games go on the shelf in steps, as after a read.
              setSaid(undefined)
              setRunning({ done: 0, total: 0 })
              void steps(first)
            }}
          />

          {asking ? (
            <div className="grid gap-3 border-t border-line pt-4">
              <p className="max-w-xl text-sm text-pretty">{t('disconnectAsk', { source: name })}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  onClick={async () => {
                    const answer = await unlink(source)
                    setAsking(false)
                    if (!answer.ok) {
                      setSaid({ tone: 'trouble', text: t('failed') })
                      return
                    }
                    onChange(null)
                    setSaid({ tone: 'done', text: t('disconnected', { source: name }) })
                  }}
                >
                  <UnlinkIcon aria-hidden="true" />
                  {t('disconnect')}
                </Button>
                <Button variant="secondary" onClick={() => setAsking(false)}>
                  {t('keep')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-line pt-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={running !== undefined}
                onClick={() => setAsking(true)}
              >
                <UnlinkIcon aria-hidden="true" />
                {t('disconnect')}
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  )
}

/**
 * Each store or console a shelf can be synced from, as cards (ADR 003): the
 * account page's, and the first step of setting a new shelf up. Only the
 * ones built are offered; the rest are named as coming. Whoever holds them
 * hears of every link as it changes.
 */
export function PlatformCards({
  handle,
  page = 'account',
  onRows,
}: {
  handle: string
  page?: LinkPage
  onRows?: (rows: PlatformRow[]) => void
}) {
  const t = useTranslations('Sync')
  const [rows, setRows] = useState<PlatformRow[]>()
  const [outcome, setOutcome] = useState<Outcome>()
  const [trouble, setTrouble] = useState(false)

  useEffect(() => {
    const abort = new AbortController()
    void readPlatforms(abort.signal).then((answer) => {
      if (abort.signal.aborted) return
      setOutcome(takeOutcome())
      if (answer.ok) setRows(answer.value)
      else setTrouble(true)
      // The address names this section (back from Steam, or a link to it), which the browser
      // could not find as the page opened: the account is drawn in the browser.
      if (window.location.hash === '#platforms') {
        document.getElementById('platforms')?.scrollIntoView()
      }
    })
    return () => abort.abort()
  }, [])

  useEffect(() => {
    if (rows) onRows?.(rows)
  }, [rows, onRows])

  const changed = useCallback(
    (source: SyncSource) => (link: LinkView | null) =>
      setRows((current) => current?.map((row) => (row.source === source ? { ...row, link } : row))),
    [],
  )

  return (
    <>
      {trouble ? <p role="alert">{t('failed')}</p> : null}
      {rows === undefined && !trouble ? <p className="text-sm text-muted">{t('loading')}</p> : null}
      {rows
        ?.filter((row) => row.ready)
        .map((row) => (
          <PlatformCard
            key={row.source}
            row={row}
            handle={handle}
            page={page}
            // Back from Steam's sign-in: Steam's card is the one it was for.
            {...(outcome && row.source === 'steam' ? { outcome } : {})}
            onChange={changed(row.source)}
          />
        ))}
      <p className="text-sm text-muted">{t('later')}</p>
    </>
  )
}

/** The account page's Platforms (ADR 003). */
export function Platforms({ handle }: { handle: string }) {
  const t = useTranslations('Sync')
  return (
    <section id="platforms" className="grid scroll-mt-24 gap-5 border-t border-line pt-8">
      <h2 className="title text-xl sm:text-2xl">{t('title')}</h2>
      <p className="max-w-xl text-pretty text-muted">{t('intro')}</p>
      <PlatformCards handle={handle} />
    </section>
  )
}
