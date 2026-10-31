'use client'

import { SearchIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import { strippedTitle } from '@/domain/sync/titles'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'
import { Ghost, GhostText, Loading } from '@/ui/ghost'

import { searchIgdb, type Found } from './sync-client'

/** The cover, or a blur of nothing where IGDB has none. */
export function Thumb({ cover }: { cover: string | null }) {
  return cover ? (
    // Covers come straight from IGDB's servers, which already resize and cache them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      src={cover}
      loading="lazy"
      decoding="async"
      className="h-12 w-9 flex-none rounded-[3px] object-cover"
    />
  ) : (
    <span aria-hidden="true" className="h-12 w-9 flex-none rounded-[3px] bg-line" />
  )
}

/** Results on their way, one fewer than IGDB usually finds, in their shape. */
const GHOST_RESULTS = 3

/**
 * Finding which game something is: IGDB searched by its title, which I can
 * change. What a sync could not match asks it; so does a game it matched
 * wrong, on the page for placing them (spec 4.5).
 */
export function FindIt({
  title,
  onPick,
  busy,
  pickLabel,
}: {
  /** The title as the source wrote it, or as the shelf has it. */
  title: string
  onPick: (found: Found) => void
  busy: boolean
  /** What picking a result does, in words, for its button: adding it, unless said otherwise. */
  pickLabel?: (found: Found) => string
}) {
  const t = useTranslations('Sync')
  const id = useId()
  const [first] = useState(() => strippedTitle(title))
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
          {t('searchFor', { title })}
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
          {t('search')}
        </Button>
      </form>
      {trouble ? <p role="alert">{t('failed')}</p> : null}
      {searching ? (
        <Loading label={t('searching')} className="grid gap-2">
          {Array.from({ length: GHOST_RESULTS }, (_, row) => (
            <div key={row} className="flex items-center gap-3">
              <Ghost order={row} className="h-12 w-9 flex-none rounded-[3px]" />
              <span className="min-w-0 flex-1 text-sm">
                <GhostText order={row} className="w-1/2" />
              </span>
              <Ghost
                order={row}
                className="h-8 w-14 flex-none rounded-control pointer-coarse:h-10"
              />
            </div>
          ))}
        </Loading>
      ) : null}
      {!searching && found && found.length === 0 ? (
        <p className="text-sm text-muted">{t('noResults')}</p>
      ) : null}
      {!searching && found && found.length > 0 ? (
        <ul className="grid gap-2" aria-live="polite">
          {found.map((each) => (
            <li key={each.igdbId} className="flex items-center gap-3">
              <Thumb cover={each.cover} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{each.title}</span>
                {each.year ? <span className="ml-2 text-muted">{each.year}</span> : null}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                aria-label={
                  pickLabel?.(each) ??
                  (each.year
                    ? t('pickNamed', { title: each.title, year: each.year })
                    : t('pickUndated', { title: each.title }))
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
