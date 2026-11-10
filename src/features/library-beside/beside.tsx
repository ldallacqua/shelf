'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { LibraryLink } from '@/features/game-detail/back-to-library'
import { useArriving } from '@/features/game-detail/hand-off'
import { useIsMine } from '@/features/owner/account'
import { Button } from '@/ui/button'

import { BesideColumn, BesideGhost } from './beside-ghost'
import { listCode, loadList } from './list-code'
import { useHandedOver, useKnownShelf } from './store'

import './beside.css'

/**
 * Wide enough for the list beside a game (`beside.css`): from 1024px (ADR 009,
 * phase 2). Narrower, and on a phone, the page stands alone with its way back.
 */
export const BESIDE = '(width >= 64rem)'

const subscribeWide = (changed: () => void) => {
  const query = window.matchMedia(BESIDE)
  query.addEventListener('change', changed)
  return () => query.removeEventListener('change', changed)
}

/** Whether the list stands beside the page; unknown on the server. */
const useWide = (): boolean | undefined =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(BESIDE).matches,
    () => undefined,
  )

/** The address's part: a segment may come encoded. */
const decoded = (value: string | string[] | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * The column beside every game's page on a shelf (ADR 009, phase 2), in the
 * layout around them, so it stays put from one game to the next. Its shelf
 * comes from the library's hand-over, or from the page; its code, once the
 * window is wide enough for it, or when a game was opened from the library,
 * whose Previous and Next follow it even where it is not shown. Someone
 * else's private shelf has nothing to list.
 */
export function LibraryBeside() {
  const t = useTranslations('Beside')
  const library = useTranslations('Library')
  const params = useParams<{ handle?: string; slug?: string }>()
  const handle = decoded(params.handle)
  // The game being drawn while the router fetches it is the one the list marks.
  const slug = useArriving(handle) ?? decoded(params.slug)
  const handed = useHandedOver(handle)
  const known = useKnownShelf(handle)
  const wide = useWide()
  const mine = useIsMine(handle)

  const shelf = known?.shelf ?? handed?.shelf
  // A visibility change rotates the public file key; never reuse the old hand-over then.
  const carried =
    handed &&
    shelf &&
    handed.shelf.files.kind === shelf.files.kind &&
    (shelf.files.kind === 'mine' ||
      (handed.shelf.files.kind === 'public' && handed.shelf.files.key === shelf.files.key))
      ? handed
      : undefined
  // One's own files are read only by their account (ADR 004).
  const allowed = shelf !== undefined && (shelf.files.kind === 'public' || mine)
  const wanted = allowed && (wide === true || handed !== undefined)

  const [code, setCode] = useState(listCode)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const opened = handed !== undefined
  useEffect(() => {
    if (!wanted || code) return
    let current = true
    const fetchCode = () =>
      loadList().then(
        (module) => current && setCode(module),
        () => current && setFailed(true),
      )
    // Opened from the library, the code is here or on its way. At an address opened directly,
    // the game's own page comes first: the list is asked for once the browser has a moment.
    if (opened || !('requestIdleCallback' in window)) {
      void fetchCode()
      return () => {
        current = false
      }
    }
    const idle = requestIdleCallback(() => void fetchCode(), { timeout: 2000 })
    return () => {
      current = false
      cancelIdleCallback(idle)
    }
  }, [wanted, code, opened, attempt])

  const List = code?.LibraryList
  return (
    <BesideColumn>
      {List && handle && shelf && wanted ? (
        <List
          key={`${handle}:${shelf.files.kind === 'public' ? shelf.files.key : 'mine'}`}
          handle={handle}
          slug={slug}
          shelf={shelf}
          version={Math.max(handed?.version ?? 0, known?.version ?? 0)}
          handed={carried}
          shown={wide === true}
        />
      ) : failed && wanted ? (
        <div role="alert" className="grid justify-items-start gap-2 p-3 text-sm">
          {handle ? <LibraryLink handle={handle} /> : null}
          <p>{t('failed')}</p>
          <Button
            size="sm"
            onClick={() => {
              setFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            {library('error.retry')}
          </Button>
        </div>
      ) : (
        <BesideGhost back={handle ? <LibraryLink handle={handle} /> : undefined} />
      )}
    </BesideColumn>
  )
}
