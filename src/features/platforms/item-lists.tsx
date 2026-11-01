'use client'

import { DownloadIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import type { Answer } from '@/domain/library/adding'
import type { Format, SyncSource } from '@/domain/library/values'
import { isSetAside } from '@/domain/sync/items'
import type { ItemCounts, ItemList, ItemMatch, ItemView, SyncStep } from '@/domain/sync/link'
import { SOURCES } from '@/domain/sync/sources'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { CartridgeIcon } from '@/ui/icons'
import { Ghost, GhostText, Loading } from '@/ui/ghost'

import { FindIt, Thumb } from './find-it'
import { answerItem, confirmMany, readItems, type ItemAnswer } from './sync-client'

/**
 * The games a source listed that are not simply on the shelf (ADR 003):
 * the ones Shelf could not match, which wait for me; the ones left off;
 * and the ones on the shelf the source no longer lists. A source that saw
 * me play a game, as Nintendo does, cannot say how I own it: each game
 * waits, its match shown, for a cartridge or a download, one at a time or
 * all at once. Each list is fetched when it is opened, and every answer is
 * kept.
 */

/** How a game a source saw me play is owned, as its row asks it. */
const FORMATS: readonly Format[] = ['physical', 'digital']

/** A picture beside each answer's word, so a long list of the same two reads at a glance. */
const FormatIcon = ({ format }: { format: Format }) =>
  format === 'physical' ? <CartridgeIcon aria-hidden="true" /> : <DownloadIcon aria-hidden="true" />

/** A source that lists what was played: its copies wait for how I own each game. */
const playedOn = (source: SyncSource) => SOURCES[source].evidence === 'played'

/** The game Shelf took an item for, which I confirm by saying how I own it. */
function Match({ match }: { match: ItemMatch }) {
  const t = useTranslations('Sync')
  return (
    <span className="mt-2 flex items-center gap-3">
      <Thumb cover={match.cover} />
      <span className="text-muted">
        {match.year
          ? t('nintendo.matchedYear', { title: match.title, year: match.year })
          : t('nintendo.matched', { title: match.title })}
      </span>
    </span>
  )
}

const COUNT_OF: Record<ItemList, keyof ItemCounts> = {
  'needs-you': 'needs-you',
  hidden: 'hidden',
  'not-seen': 'notSeen',
}

/** Rows of ghosts while a list is read, once it is opened. */
const GHOST_ROWS = 3

/** Its hours there, or that it was never played there. */
function Hours({ item, source }: { item: ItemView; source: SyncSource }) {
  const t = useTranslations('Sync')
  const name = t(`source.${source}`)
  return (
    <span className="text-muted">
      {item.minutes > 0
        ? t('hours', { hours: Math.round(item.minutes / 6) / 10, source: name })
        : t('unplayed', { source: name })}
    </span>
  )
}

/**
 * The items a list shows as one row: a game a source lists more than once,
 * as Nintendo lists Warframe for the Switch and the Switch 2, is one game,
 * matched once and answered once. The most played comes first.
 */
const asGames = (items: readonly ItemView[]): ItemView[][] => {
  const games = new Map<string, ItemView[]>()
  for (const item of items) {
    const key = item.match ? `game:${item.match.igdbId}` : item.id
    games.set(key, [...(games.get(key) ?? []), item])
  }
  return [...games.values()]
}

function Row({
  game,
  list,
  source,
  handle,
  onAnswered,
}: {
  /** One game's items, the first shown: usually one. */
  game: readonly ItemView[]
  list: ItemList
  source: SyncSource
  handle: string
  onAnswered: (said?: string) => void
}) {
  const t = useTranslations('Sync')
  const format = useFormatter()
  const titleId = useId()
  const [finding, setFinding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: 'done' | 'trouble'; text: string }>()
  const item = game[0]!
  const minutes = game.reduce((sum, each) => sum + each.minutes, 0)
  // Answered, the row leaves at once rather than when the list comes back; an error brings it back.
  const [leaving, setLeaving] = useState(false)
  // A game picked for a source that saw me play it stays, waiting for its format: until the
  // list brings it back with its new match, it is not answered again.
  const [answered, setAnswered] = useState<ItemView>()
  const still = busy || answered === item

  /** The answer, for each of the game's items in turn: the first makes the copy, the rest feed it. */
  const answer = async (choice: ItemAnswer) => {
    const stays = choice.kind === 'pick' && playedOn(source) && choice.format === undefined
    setBusy(true)
    setLeaving(!stays)
    setSaid(undefined)
    let shelved: string | undefined
    for (const each of game) {
      const result = await answerItem(source, each.id, choice)
      if (!result.ok) {
        setBusy(false)
        setLeaving(false)
        setSaid({
          tone: 'trouble',
          text: result.reason === 'too-many' ? t('tooMany') : t('failed'),
        })
        return
      }
      shelved = result.value.item.onShelf?.title ?? shelved
    }
    setBusy(false)
    setAnswered(item)
    setFinding(false)
    // The list is fetched again, which this row has left: the card says what happened.
    onAnswered(shelved ? t('added', { title: shelved }) : undefined)
  }

  if (leaving) return null
  return (
    <li className="grid gap-2 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span id={titleId} className="min-w-40 flex-1">
          {list === 'not-seen' && item.onShelf ? (
            <Link
              href={{
                pathname: '/u/[handle]/game/[slug]',
                params: { handle, slug: item.onShelf.slug },
              }}
              className="font-medium underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {item.title}
            </Link>
          ) : (
            <span className="font-medium">{item.title}</span>
          )}
          <span className="block">
            {list === 'hidden' && item.decision === 'not_a_game' && isSetAside(item.kind) ? (
              // Left out by the sync itself, or by me: either way, what the store calls it.
              <span className="text-muted">
                {t(`kind.${item.kind}`, { source: t(`source.${source}`) })}
              </span>
            ) : list === 'hidden' && item.decision !== 'pending' && item.decision !== 'copy' ? (
              <span className="text-muted">{t(`why.${item.decision}`)}</span>
            ) : list === 'not-seen' ? (
              <span className="text-muted">
                {t('lastSeen', { date: format.dateTime(item.lastSeenAt, { dateStyle: 'medium' }) })}
              </span>
            ) : (
              <Hours item={{ ...item, minutes }} source={source} />
            )}
          </span>
          {game.length > 1 ? (
            <span className="block text-muted">
              {t('alsoListed', {
                source: t(`source.${source}`),
                titles: format.list(game.slice(1).map((each) => each.title)),
              })}
            </span>
          ) : null}
          {list === 'needs-you' && item.match ? <Match match={item.match} /> : null}
        </span>
        {list === 'needs-you' && item.match && playedOn(source) ? (
          <span className="flex flex-wrap gap-2">
            {FORMATS.map((format) => (
              <Button
                key={format}
                size="sm"
                variant="secondary"
                aria-describedby={titleId}
                disabled={still}
                onClick={() => void answer({ kind: 'confirm', format })}
              >
                <FormatIcon format={format} />
                {t(`nintendo.${format}`)}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={titleId}
              aria-expanded={finding}
              disabled={still}
              onClick={() => setFinding((open) => !open)}
            >
              {t('nintendo.notThis')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={titleId}
              disabled={still}
              onClick={() => void answer({ kind: 'dismiss', as: 'not_mine' })}
            >
              {t('removeFromList')}
            </Button>
          </span>
        ) : list === 'needs-you' ? (
          <span className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={finding ? 'ghost' : 'secondary'}
              aria-describedby={titleId}
              aria-expanded={finding}
              disabled={still}
              onClick={() => setFinding((open) => !open)}
            >
              {t('find')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={titleId}
              disabled={still}
              onClick={() => void answer({ kind: 'dismiss', as: 'not_mine' })}
            >
              {t('removeFromList')}
            </Button>
          </span>
        ) : list === 'hidden' ? (
          <Button
            size="sm"
            variant="secondary"
            aria-describedby={titleId}
            disabled={still}
            onClick={() => void answer({ kind: 'again' })}
          >
            {item.decision === 'removed' ? t('putBack') : t('askAgain')}
          </Button>
        ) : null}
      </div>
      {finding ? (
        <FindIt
          title={item.title}
          busy={still}
          onPick={(found) => void answer({ kind: 'pick', igdbId: found.igdbId })}
        />
      ) : null}
      {said ? (
        <p role={said.tone === 'trouble' ? 'alert' : 'status'} className="text-sm">
          {said.text}
        </p>
      ) : null}
    </li>
  )
}

/**
 * Every match in a list, given one format: "all of these are downloads"
 * (ADR 003). The games then go on the shelf in steps, as after a read.
 */
function AllAtOnce({
  source,
  items,
  busy,
  onSteps,
}: {
  source: SyncSource
  items: readonly ItemView[]
  busy: boolean
  onSteps: (first: Answer<SyncStep>) => void
}) {
  const t = useTranslations('Sync')
  const [sending, setSending] = useState(false)
  const matched = items.filter((item) => item.match)
  const games = new Set(matched.map((item) => item.match!.igdbId)).size
  if (games < 2) return null
  const send = async (format: Format) => {
    setSending(true)
    const first = await confirmMany(
      source,
      matched.map((item) => item.id),
      format,
    )
    setSending(false)
    onSteps(first)
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line px-3 py-2 text-sm">
      <span className="flex-1">{t('nintendo.all', { count: games })}</span>
      <span className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || sending}
          onClick={() => void send('physical')}
        >
          <FormatIcon format="physical" />
          {t('nintendo.allPhysical')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || sending}
          onClick={() => void send('digital')}
        >
          <FormatIcon format="digital" />
          {t('nintendo.allDigital')}
        </Button>
      </span>
    </div>
  )
}

/** One list, fetched when opened, and again after every answer and every sync. */
function List({
  list,
  source,
  handle,
  counts,
  stamp,
  busy,
  onAnswered,
  onSteps,
}: {
  list: ItemList
  source: SyncSource
  handle: string
  counts: ItemCounts
  /** Changes when the lists may have: after a sync or an answer. */
  stamp: number
  /** A sync is running: answering many at once waits for it. */
  busy: boolean
  onAnswered: (said?: string) => void
  onSteps: (first: Answer<SyncStep>) => void
}) {
  const t = useTranslations('Sync')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ItemView[]>()
  const [trouble, setTrouble] = useState(false)
  const count = counts[COUNT_OF[list]]
  const name = t(`source.${source}`)
  const played = playedOn(source)

  useEffect(() => {
    if (!open) return
    const abort = new AbortController()
    void readItems(source, list, abort.signal).then((answer) => {
      if (abort.signal.aborted) return
      if (answer.ok) setItems(answer.value)
      else setTrouble(true)
    })
    return () => abort.abort()
  }, [open, source, list, stamp])

  if (count === 0) return null
  const rows = (some: readonly ItemView[]) => (
    <ul className="mt-2">
      {asGames(some).map((game) => (
        <Row
          key={game[0]!.id}
          game={game}
          list={list}
          source={source}
          handle={handle}
          onAnswered={onAnswered}
        />
      ))}
    </ul>
  )
  // The matched games first, which need only how I own them; then those Shelf could not find.
  const found = items?.filter((item) => item.match) ?? []
  const unfound = items?.filter((item) => !item.match) ?? []
  return (
    <details
      className="rounded-panel border border-line bg-surface/60 px-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer py-3 text-sm font-medium">
        {t(`lists.${list}`, { count, source: name })}
      </summary>
      <div className="pb-3">
        <p className="text-sm text-pretty text-muted">
          {played && list === 'needs-you'
            ? t('nintendo.help', { source: name })
            : t(`help.${list}`, { source: name })}
        </p>
        {played && list === 'needs-you' && items ? (
          <AllAtOnce source={source} items={items} busy={busy} onSteps={onSteps} />
        ) : null}
        {trouble ? <p role="alert">{t('failed')}</p> : null}
        {open && items === undefined && !trouble ? (
          <Loading label={t('loading')} className="mt-2 grid">
            {Array.from({ length: GHOST_ROWS }, (_, row) => (
              <div
                key={row}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 text-sm first-of-type:border-t-0"
              >
                <span className="grid min-w-40 flex-1">
                  <GhostText order={row} className="w-1/2" />
                  <GhostText order={row} className="w-1/3" />
                </span>
                <Ghost order={row} className="h-8 w-40 rounded-control pointer-coarse:h-10" />
              </div>
            ))}
          </Loading>
        ) : null}
        {items && found.length > 0 && unfound.length > 0 ? (
          <>
            {rows(found)}
            <h4 className="mt-3 border-t border-line pt-4 text-sm font-medium">
              {t('unfound', { count: unfound.length })}
            </h4>
            <p className="mt-1 text-sm text-pretty text-muted">{t('unfoundHelp')}</p>
            {rows(unfound)}
          </>
        ) : items ? (
          rows(items)
        ) : null}
      </div>
    </details>
  )
}

export function ItemLists(props: {
  source: SyncSource
  handle: string
  counts: ItemCounts
  stamp: number
  busy: boolean
  onAnswered: (said?: string) => void
  onSteps: (first: Answer<SyncStep>) => void
}) {
  // A row's answers stay within reach of its title, however wide the card.
  return (
    <div className="grid max-w-3xl gap-3">
      <List list="needs-you" {...props} />
      <List list="hidden" {...props} />
      <List list="not-seen" {...props} />
    </div>
  )
}
