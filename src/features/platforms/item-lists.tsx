'use client'

import { SearchIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import type { SyncSource } from '@/domain/library/values'
import type { ItemCounts, ItemList, ItemView } from '@/domain/sync/link'
import { strippedTitle } from '@/domain/sync/titles'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'

import { answerItem, readItems, searchIgdb, type Found, type ItemAnswer } from './sync-client'

/**
 * The games a source listed that are not simply on the shelf (ADR 003):
 * the ones Shelf could not match, which wait for me; the ones left off;
 * and the ones on the shelf the source no longer lists. Each list is
 * fetched when it is opened, and every answer is kept.
 */

const COUNT_OF: Record<ItemList, keyof ItemCounts> = {
  'needs-you': 'needs-you',
  hidden: 'hidden',
  'not-seen': 'notSeen',
}

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

/** Finding the game an item is: IGDB searched by its title, which I can change. */
function FindIt({
  item,
  onPick,
  busy,
}: {
  item: ItemView
  onPick: (found: Found) => void
  busy: boolean
}) {
  const t = useTranslations('Sync')
  const id = useId()
  const [first] = useState(() => strippedTitle(item.title))
  const [text, setText] = useState(first)
  const [found, setFound] = useState<Found[]>()
  // Opened, it searches at once for the title as the source wrote it.
  const [searching, setSearching] = useState(true)
  const [trouble, setTrouble] = useState(false)

  const heard = (answer: Awaited<ReturnType<typeof searchIgdb>>) => {
    setSearching(false)
    if (answer.ok) setFound(answer.value)
    else setTrouble(true)
  }

  const search = async () => {
    if (text.trim().length < 2) return
    setSearching(true)
    setTrouble(false)
    heard(await searchIgdb(text.trim()))
  }

  useEffect(() => {
    const abort = new AbortController()
    void searchIgdb(first, abort.signal).then((answer) => {
      if (!abort.signal.aborted) heard(answer)
    })
    return () => abort.abort()
  }, [first])

  return (
    <div className="grid gap-3 rounded-control border border-line bg-surface p-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {t('searchFor', { title: item.title })}
        </label>
        <Input
          id={`${id}-q`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-w-48 flex-1"
          maxLength={100}
        />
        <Button type="submit" variant="secondary" disabled={searching || busy}>
          <SearchIcon aria-hidden="true" />
          {searching ? t('searching') : t('search')}
        </Button>
      </form>
      {trouble ? <p role="alert">{t('failed')}</p> : null}
      {found && found.length === 0 ? <p className="text-sm text-muted">{t('noResults')}</p> : null}
      {found && found.length > 0 ? (
        <ul className="grid gap-2" aria-live="polite">
          {found.map((each) => (
            <li key={each.igdbId} className="flex items-center gap-3">
              {each.cover ? (
                // Covers come straight from IGDB's servers, which already resize and cache them.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  src={each.cover}
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-9 flex-none rounded-[3px] object-cover"
                />
              ) : (
                <span aria-hidden="true" className="h-12 w-9 flex-none rounded-[3px] bg-line" />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{each.title}</span>
                {each.year ? <span className="ml-2 text-muted">{each.year}</span> : null}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                aria-label={
                  each.year
                    ? t('pickNamed', { title: each.title, year: each.year })
                    : t('pickUndated', { title: each.title })
                }
                onClick={() => onPick(each)}
              >
                {t('pick')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Row({
  item,
  list,
  source,
  handle,
  onAnswered,
}: {
  item: ItemView
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

  const answer = async (choice: ItemAnswer) => {
    setBusy(true)
    setSaid(undefined)
    const result = await answerItem(source, item.id, choice)
    setBusy(false)
    if (!result.ok) {
      setSaid({
        tone: 'trouble',
        text: result.reason === 'too-many' ? t('tooMany') : t('failed'),
      })
      return
    }
    const shelved = result.value.item.onShelf
    // The list is fetched again, and this row may leave it: the card says what happened.
    onAnswered(shelved ? t('added', { title: shelved.title }) : undefined)
  }

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
            {list === 'hidden' && item.decision !== 'pending' && item.decision !== 'copy' ? (
              <span className="text-muted">{t(`why.${item.decision}`)}</span>
            ) : list === 'not-seen' ? (
              <span className="text-muted">
                {t('lastSeen', { date: format.dateTime(item.lastSeenAt, { dateStyle: 'medium' }) })}
              </span>
            ) : (
              <Hours item={item} source={source} />
            )}
          </span>
        </span>
        {list === 'needs-you' ? (
          <span className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={finding ? 'ghost' : 'secondary'}
              aria-describedby={titleId}
              aria-expanded={finding}
              disabled={busy}
              onClick={() => setFinding((open) => !open)}
            >
              {t('find')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={titleId}
              disabled={busy}
              onClick={() => void answer({ kind: 'dismiss', as: 'not_a_game' })}
            >
              {t('notAGame')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-describedby={titleId}
              disabled={busy}
              onClick={() => void answer({ kind: 'dismiss', as: 'not_mine' })}
            >
              {t('notMine')}
            </Button>
          </span>
        ) : list === 'hidden' ? (
          <Button
            size="sm"
            variant="secondary"
            aria-describedby={titleId}
            disabled={busy}
            onClick={() => void answer({ kind: 'again' })}
          >
            {item.decision === 'removed' ? t('putBack') : t('askAgain')}
          </Button>
        ) : null}
      </div>
      {finding ? (
        <FindIt
          item={item}
          busy={busy}
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

/** One list, fetched when opened, and again after every answer and every sync. */
function List({
  list,
  source,
  handle,
  counts,
  stamp,
  onAnswered,
}: {
  list: ItemList
  source: SyncSource
  handle: string
  counts: ItemCounts
  /** Changes when the lists may have: after a sync or an answer. */
  stamp: number
  onAnswered: (said?: string) => void
}) {
  const t = useTranslations('Sync')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ItemView[]>()
  const [trouble, setTrouble] = useState(false)
  const count = counts[COUNT_OF[list]]
  const name = t(`source.${source}`)

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
  return (
    <details
      className="rounded-panel border border-line bg-surface/60 px-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer py-3 text-sm font-medium">
        {t(`lists.${list}`, { count, source: name })}
      </summary>
      <div className="pb-3">
        <p className="text-sm text-pretty text-muted">{t(`help.${list}`, { source: name })}</p>
        {trouble ? <p role="alert">{t('failed')}</p> : null}
        {items === undefined && !trouble ? (
          <p className="mt-3 text-sm text-muted">{t('loading')}</p>
        ) : null}
        {items ? (
          <ul className="mt-2">
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                list={list}
                source={source}
                handle={handle}
                onAnswered={onAnswered}
              />
            ))}
          </ul>
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
  onAnswered: (said?: string) => void
}) {
  return (
    <div className="grid gap-3">
      <List list="needs-you" {...props} />
      <List list="hidden" {...props} />
      <List list="not-seen" {...props} />
    </div>
  )
}
