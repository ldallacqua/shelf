'use client'

import { CheckIcon, InfinityIcon, LockIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Status } from '@/domain/library/values'
import { StatusMark } from './status-mark'

/** The statuses with a mark on the shelf, in the order a shelf shows them most. */
const shelfMarks = [
  'playing',
  'backlog',
  'completed',
  'dropped',
  'someday',
  'retired',
  'wishlist',
] as const satisfies readonly Status[]

/** The wall's and the list's: the same, and Unsorted's inbox, which a sync's games carry. */
const iconMarks = [...shelfMarks, 'unsorted'] as const satisfies readonly Status[]

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

  const row = (mark: ReactNode, name: string, words: string) => (
    <div key={name} className="contents">
      <dt className="flex justify-center">{mark}</dt>
      <dd>
        <span className="block font-semibold">{name}</span>
        <span className="block text-muted">{words}</span>
      </dd>
    </div>
  )

  return (
    <dl className="grid grid-cols-[minmax(2.5rem,auto)_1fr] items-center gap-x-4 gap-y-3 text-sm">
      {view === 'shelf' ? (
        <>
          {shelfMarks.map((status) =>
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
          {iconMarks.map((status) =>
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
