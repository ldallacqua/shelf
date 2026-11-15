'use client'

import { CheckIcon, InfinityIcon, LockIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Status } from '@/domain/library/values'

import { StatusMark } from './status-mark'

/** The statuses with a mark, in the order a shelf shows them most. */
const marks = [
  'playing',
  'backlog',
  'completed',
  'dropped',
  'someday',
  'retired',
  'wishlist',
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
      </span>
    </span>
  )
}

/**
 * What each mark on a box means (spec 3.2), drawn with the shelf's own marks beside its words:
 * a screen reader hears all of it in each box's name, and a sighted visitor had to guess
 * (step 10's review, 01, finding 11). Fetched only once the key is opened.
 */
export default function MarksList({ view }: { view: 'shelf' | 'wall' }) {
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
    <dl className="grid grid-cols-[2.5rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
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
          {row(
            <span className="readout text-[0.625rem]" aria-hidden="true">
              {t('marks.platformsSample')}
            </span>,
            t('marks.platforms'),
            t('marks.wall.platforms'),
          )}
        </>
      )}
      {row(
        <span className="marks-swatch" aria-hidden="true">
          <LockIcon className="size-3.5" />
        </span>,
        t('marks.private'),
        t('marks.privateWords'),
      )}
    </dl>
  )
}
