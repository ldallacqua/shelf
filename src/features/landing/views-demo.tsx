'use client'

import { StarIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { coverSources, imageUrl } from '@/domain/igdb/images'
import { useFlip } from '@/features/library/use-flip'
import { useReducedMotion } from '@/features/library/use-preference'
import { Ledge } from '@/ui/ledge'
import { Segmented, SegmentedItem } from '@/ui/segmented'

import { DemoCase, type DemoGame } from './demo-case'
import { useArrived } from './reveals'

const VIEWS = ['shelf', 'wall', 'list'] as const
type View = (typeof VIEWS)[number]

/** How long each view shows before the next, while the scene plays by itself. */
const VIEW_MS = 3200
const PER_LEDGE = 6

/**
 * The same games three ways: on the shelf in their cases, as a wall of
 * covers, and as a list of numbers. It turns through them by itself once it
 * is in view, until the visitor picks one; the covers travel between the
 * shelf and the wall. It always takes the same room, whatever it shows.
 */
export function ViewsDemo({ games }: { games: readonly DemoGame[] }) {
  const t = useTranslations('Landing.views')
  const reduced = useReducedMotion()
  const scope = useRef<HTMLDivElement>(null)
  const arrived = useArrived(scope)
  const [view, setView] = useState<View>('shelf')
  const [touched, setTouched] = useState(false)
  const flip = useFlip(scope, view)

  useEffect(() => {
    if (!arrived || touched || reduced) return
    const timer = setInterval(() => {
      flip()
      setView((now) => VIEWS[(VIEWS.indexOf(now) + 1) % VIEWS.length] ?? 'shelf')
    }, VIEW_MS)
    return () => clearInterval(timer)
    // `flip` notes where the covers stand, in refs: any drawing's copy of it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived, touched, reduced])

  const ledges = [games.slice(0, PER_LEDGE), games.slice(PER_LEDGE, PER_LEDGE * 2)]

  return (
    <div ref={scope} className="rounded-panel border border-line bg-surface/70 p-4 sm:p-6">
      <Segmented
        aria-label={t('label')}
        value={view}
        onValueChange={(next) => {
          setTouched(true)
          flip()
          setView(next)
        }}
      >
        {VIEWS.map((each) => (
          <SegmentedItem key={each} value={each}>
            {t(each)}
          </SegmentedItem>
        ))}
      </Segmented>

      <div className="views-stage mt-5" data-view={view}>
        {view === 'shelf' ? (
          <div className="views-shelf grid gap-6 pt-4">
            {ledges.map((ledge, index) => (
              <Ledge key={index} itemsClassName="justify-center gap-[calc(var(--mm)*10)]">
                {ledge.map((game) => (
                  <span key={game.slug} data-flip={game.slug}>
                    <DemoCase game={game} sizes="60px" />
                  </span>
                ))}
              </Ledge>
            ))}
          </div>
        ) : view === 'wall' ? (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {games.map((game) => (
              <li key={game.slug} data-flip={game.slug}>
                {/* Covers come straight from IGDB's servers, which already resize and cache them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={game.title}
                  {...coverSources(game.cover, 'cover_small_2x')}
                  sizes="(min-width: 40rem) 96px, 80px"
                  loading="lazy"
                  decoding="async"
                  className="aspect-3/4 w-full rounded-[3px] object-cover shadow-panel"
                  style={{ backgroundColor: game.colors[2] }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="readout text-[0.625rem] text-muted">
              <tr>
                <th scope="col" className="pb-2 font-medium">
                  {t('columns.game')}
                </th>
                <th scope="col" className="pb-2 font-medium max-sm:hidden">
                  {t('columns.platform')}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t('columns.hours')}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  {t('columns.rating')}
                </th>
              </tr>
            </thead>
            <tbody>
              {games.slice(0, 7).map((game) => (
                <tr key={game.slug} className="border-t border-line">
                  <td className="py-1.5">
                    <span className="flex items-center gap-3">
                      <span data-flip={game.slug} className="flex-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt=""
                          src={imageUrl(game.cover, 'cover_small')}
                          loading="lazy"
                          decoding="async"
                          className="h-8 w-6 rounded-[2px] object-cover"
                          style={{ backgroundColor: game.colors[2] }}
                        />
                      </span>
                      <span className="truncate">{game.title}</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-muted max-sm:hidden">{game.platform}</td>
                  <td className="py-1.5 text-right tabular-nums">{game.hours}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {game.rating === undefined ? (
                      <span className="text-muted">{'–'}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {game.rating}
                        <StarIcon aria-hidden="true" className="size-3 text-marker" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
