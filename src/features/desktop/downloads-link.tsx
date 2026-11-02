'use client'

import { DownloadIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Tip } from '@/ui/tooltip'

import { AppWords } from './app-words'
import { type Download, downloads, sources } from './sources'

/** How often the header asks: once a second while something moves, and now and then to see if it has. */
const LOOK_MOVING = 1000
const LOOK_RESTING = 5000

const RADIUS = 14
const AROUND = 2 * Math.PI * RADIUS

const extracting = (each: Download) =>
  each.extraction?.state === 'waiting' || each.extraction?.state === 'working'

const moving = (each: Download) =>
  each.state === 'downloading' ||
  each.state === 'queued' ||
  each.state === 'remote' ||
  extracting(each)

/**
 * How far along what is moving is, from 0 to 1, or undefined while any of it can't say. A download
 * and its extraction are one job, and only one of them is moving at a time.
 */
export const shareOf = (list: readonly Download[]) => {
  let done = 0
  let total = 0
  for (const each of list.filter(moving)) {
    if (extracting(each)) {
      if (!each.extraction?.total) return undefined
      done += each.extraction.done
      total += each.extraction.total
    } else {
      if (each.total === null) return undefined
      done += each.done
      total += each.total
    }
  }
  return total > 0 ? Math.min(1, done / total) : undefined
}

/** The button, drawn from what it is given. */
export function DownloadsLinkView({
  list,
  current = false,
}: {
  list: readonly Download[]
  current?: boolean
}) {
  const t = useTranslations('Downloads')
  const format = useFormatter()
  const going = list.some(moving)
  const share = going ? shareOf(list) : undefined
  const stopped =
    list.some((each) => each.state === 'failed') ||
    list.some((each) => each.extraction?.state === 'failed')
  const label = going
    ? share !== undefined
      ? t('linkShare', { percent: format.number(share, { style: 'percent' }) })
      : t('linkMoving')
    : stopped
      ? t('linkStopped')
      : t('title')

  return (
    <Tip label={label} side="bottom">
      <Button asChild variant="ghost" size="icon">
        <Link
          href="/downloads"
          aria-label={label}
          aria-current={current ? 'page' : undefined}
          className="relative"
        >
          <DownloadIcon aria-hidden="true" />
          {going ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 32 32"
              className="pointer-events-none absolute inset-0 m-auto size-8! -rotate-90"
            >
              <circle
                cx="16"
                cy="16"
                r={RADIUS}
                fill="none"
                strokeWidth="2"
                className="stroke-line"
              />
              <circle
                cx="16"
                cy="16"
                r={RADIUS}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={AROUND}
                // Where it can't say how far, the whole ring, fainter: moving, and no more than that.
                strokeDashoffset={AROUND * (1 - (share ?? 1))}
                className={cn(
                  'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-base',
                  share === undefined ? 'stroke-accent/50' : 'stroke-accent',
                )}
              />
            </svg>
          ) : null}
          {stopped && !going ? (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent"
            />
          ) : null}
        </Link>
      </Button>
    </Tip>
  )
}

function Asking() {
  const pathname = usePathname()
  const [list, setList] = useState<Download[]>([])
  const [hasSources, setHasSources] = useState(false)

  const look = useCallback(async () => {
    if (document.hidden) return
    setList(await downloads.list())
    setHasSources((await sources.list()).length > 0)
  }, [])

  const going = list.some(moving)
  useEffect(() => {
    void Promise.resolve()
      .then(look)
      .catch(() => undefined)
    const timer = setInterval(
      () => void look().catch(() => undefined),
      going ? LOOK_MOVING : LOOK_RESTING,
    )
    return () => clearInterval(timer)
  }, [going, look])

  // Nothing is drawn for what may never come: most people here have no source and no download.
  if (list.length === 0 && !hasSources) return null
  return <DownloadsLinkView list={list} current={pathname === '/downloads'} />
}

/** Downloads, from the header, in Shelf for Windows alone: where they are, and how far along. */
export default function DownloadsLink() {
  return (
    <AppWords>
      <Asking />
    </AppWords>
  )
}
