'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { Button } from '@/ui/button'
import { Sheet, SheetContent } from '@/ui/sheet'

import { Cover } from './cover'
import { dateOf, hoursOf, outOfTen } from './format'
import { StatusMark } from './status-mark'

type GamePreviewProps = {
  /** The game whose details are open, or nothing when the sheet is closed. */
  item?: ShelfItem
  platforms: ReadonlyMap<number, LibraryPlatform>
  tags: readonly LibraryTag[]
  onClose: () => void
  /** Puts focus back on the shelf when the sheet closes. Returns false if it could not. */
  onReturnFocus: () => boolean
  /** To the game before or after, in the library's current order. Absent at either end. */
  onPrevious?: () => void
  onNext?: () => void
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2.5">
      <dt className="flex-none readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  )
}

/**
 * A game picked up from the shelf: its cover and what I have recorded about
 * it. A sheet from the bottom on a phone, a panel from the right on anything
 * wider. The full game page arrives at build step 6; this is its first part.
 */
export function GamePreview({
  item,
  platforms,
  tags,
  onClose,
  onReturnFocus,
  onPrevious,
  onNext,
}: GamePreviewProps) {
  const t = useTranslations('Library')
  const format = useFormatter()
  // The sheet keeps showing the last game while it slides away.
  const [shown, setShown] = useState(item)
  if (item && item !== shown) setShown(item)
  const game = shown?.game

  const day = (value: string) =>
    format.dateTime(dateOf(value), { dateStyle: 'long', timeZone: 'UTC' })

  const hours = game ? hoursOf(game.minutes) : 0
  const length = game?.length ? hoursOf(game.length) : 0

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      {game ? (
        <SheetContent
          title={game.title}
          description={t('preview.description')}
          closeLabel={t('preview.close')}
          onCloseAutoFocus={(event) => {
            // Focus goes back to the box that was picked up, not to the top of the page.
            if (onReturnFocus()) event.preventDefault()
          }}
          onKeyDown={(event) => {
            // The arrows step through the library, as they do on the shelf.
            if (event.key === 'ArrowLeft' && onPrevious) onPrevious()
            if (event.key === 'ArrowRight' && onNext) onNext()
          }}
        >
          <div className="flex gap-4">
            <span className="block h-44 w-33 flex-none overflow-hidden rounded-[3px] shadow-panel">
              <Cover
                cover={shown?.copy?.cover ?? game.cover}
                colors={game.colors}
                hash={game.hash}
                title={game.title}
                sizes="132px"
              />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <StatusMark
                status={game.status}
                label={t(`status.${game.status}`)}
                className="text-sm font-semibold"
              />
              {game.year ? (
                <p className="mt-2 readout text-[0.6875rem] text-muted">
                  {t('preview.released', { year: game.year })}
                </p>
              ) : null}
              {game.rating === undefined ? null : (
                <p className="mt-3">
                  <span className="title text-3xl">
                    {format.number(outOfTen(game.rating), { maximumFractionDigits: 1 })}
                  </span>
                  <span className="ml-1.5 readout text-[0.625rem] text-muted">
                    {t('preview.outOfTen')}
                  </span>
                </p>
              )}
            </div>
          </div>

          <dl className="mt-5">
            <Fact label={t('preview.owned')}>
              {game.copies.length > 0 ? (
                <ul>
                  {game.copies.map((copy) => (
                    <li key={`${copy.platform}:${copy.format}`}>
                      {t('preview.copy', {
                        platform: platforms.get(copy.platform)?.name ?? '',
                        format: t(`format.${copy.format}`),
                      })}
                    </li>
                  ))}
                </ul>
              ) : (
                t('shelf.notOwned')
              )}
            </Fact>
            {hours > 0 ? (
              <Fact label={t('preview.playtime')}>{t('hours', { count: hours })}</Fact>
            ) : null}
            {length > 0 ? (
              <Fact label={t('preview.length')}>{t('hours', { count: length })}</Fact>
            ) : null}
            {game.igdbRating === undefined ? null : (
              <Fact label={t('preview.igdb')}>
                {t('preview.igdbValue', { value: game.igdbRating, count: game.igdbRatingCount })}
              </Fact>
            )}
            <Fact label={t('preview.added')}>{day(game.addedOn)}</Fact>
            {game.completedOn ? (
              <Fact label={t('preview.completed')}>{day(game.completedOn)}</Fact>
            ) : null}
            {game.tags.length > 0 ? (
              <Fact label={t('preview.tags')}>
                {game.tags
                  .map((position) => tags[position]?.name)
                  .filter((name) => name !== undefined)
                  .join(', ')}
              </Fact>
            ) : null}
          </dl>

          <div className="mt-5 flex justify-between gap-2">
            <Button variant="secondary" disabled={!onPrevious} onClick={onPrevious}>
              <ChevronLeftIcon aria-hidden="true" />
              {t('preview.previous')}
            </Button>
            <Button variant="secondary" disabled={!onNext} onClick={onNext}>
              {t('preview.next')}
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
