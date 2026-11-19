'use client'

import { CheckIcon, InboxIcon, InfinityIcon, LockIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Status } from '@/domain/library/values'
import { StatusMark } from './status-mark'

/**
 * Every status has a mark, in the order a shelf shows them most. Unsorted, which a sync's games
 * are, last: on the shelf it once had none, and stood as Backlog does (step 10's review, 01,
 * finding 55).
 */
const marks = [
  'playing',
  'backlog',
  'completed',
  'dropped',
  'someday',
  'retired',
  'wishlist',
  'unsorted',
] as const satisfies readonly Status[]

/** A box in small, standing as a box of that status stands, with the shelf's own marks on it. */
function Swatch({ status, loose }: { status?: Status; loose?: boolean }) {
  return (
    <span className="marks-swatch" aria-hidden="true">
      <span className="marks-box" data-status={status} data-loose={loose ? '' : undefined}>
        {status === 'playing' ? <span className="game-live" /> : null}
        {status === 'completed' ? (
          <span className="game-seal">
            <CheckIcon />
          </span>
        ) : null}
        {status === 'retired' ? (
          <span className="game-tag">
            <InfinityIcon />
          </span>
        ) : null}
        {status === 'unsorted' ? (
          <span className="game-tag">
            <InboxIcon />
          </span>
        ) : null}
      </span>
    </span>
  )
}

/**
 * What each mark on a game means (spec 3.2), drawn with the view's own marks beside its words: a
 * screen reader hears all of it in each game's name, and a sighted visitor had to guess (step
 * 10's review, 01, finding 11). The shelf's boxes stand and carry seals; the wall's covers and a
 * phone's list carry a status icon (finding 33). Fetched only once the key is opened.
 */
export default function MarksList({
  view,
  mine = false,
}: {
  view: 'shelf' | 'wall' | 'list'
  /** One's own shelf: only its own account ever sees a private game, and so its lock. */
  mine?: boolean
}) {
  const t = useTranslations('Library')
  const format = useFormatter()

  /**
   * A term is the mark and its name, its words the definition. The term held only the mark, which
   * is hidden from a screen reader, so it met a list of empty terms (finding 56). The mark stands
   * beside both lines, in a column as wide as the widest.
   */
  const row = (mark: ReactNode, name: string, words: string) => (
    <div key={name} className="col-span-2 grid grid-cols-subgrid grid-rows-[auto_auto]">
      <dt className="col-span-2 col-start-1 row-span-2 row-start-1 grid grid-cols-subgrid grid-rows-subgrid">
        <span className="row-span-2 flex items-center justify-center">{mark}</span>
        <span className="font-semibold">{name}</span>
      </dt>
      <dd className="col-start-2 row-start-2 text-muted">{words}</dd>
    </div>
  )

  return (
    <dl className="grid grid-cols-[minmax(2.5rem,auto)_1fr] gap-x-4 gap-y-3 text-sm">
      {view === 'shelf' ? (
        <>
          {marks.map((status) =>
            row(<Swatch status={status} />, t(`status.${status}`), t(`marks.shelf.${status}`)),
          )}
          {row(<Swatch loose />, t('format.digital'), t('marks.shelf.digital'))}
          {row(
            <span className="marks-swatch" aria-hidden="true">
              <span className="marks-box">
                <span className="game-count">{format.number(2)}</span>
              </span>
            </span>,
            t('marks.copies'),
            t('marks.shelf.copies'),
          )}
        </>
      ) : (
        <>
          {marks.map((status) =>
            row(
              // Its word is beside it: hidden here, so it isn't said twice.
              <span aria-hidden="true">
                <StatusMark status={status} label={t(`status.${status}`)} iconOnly />
              </span>,
              t(`status.${status}`),
              t(`marks.wall.${status}`),
            ),
          )}
          {view === 'wall'
            ? row(
                <span className="readout text-[0.625rem] whitespace-nowrap" aria-hidden="true">
                  {t('marks.platformsSample')}
                </span>,
                t('marks.platforms'),
                t('marks.wall.platforms'),
              )
            : null}
        </>
      )}
      {mine
        ? row(
            <span className="marks-swatch" aria-hidden="true">
              <LockIcon className="size-3.5" />
            </span>,
            t('marks.private'),
            t('marks.privateWords'),
          )
        : null}
    </dl>
  )
}
