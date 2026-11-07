'use client'

import { EllipsisIcon, InfoIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useId, useRef, useState } from 'react'

import { AWAY_AFTER_MINUTES } from '@/domain/library/hours'
import { useDuration } from '@/features/library/duration'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { NumberField } from '@/ui/number-field'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Tip } from '@/ui/tooltip'

import { mineHeading } from './mine-layout'

/** One source's hours on a platform, named. */
export type SourceRow = {
  name: string
  minutes: number
  /** The sources whose hours count instead, having seen the same play: named, joined. */
  sameAs?: string
  /** Its last read failed, so its hours may be behind. */
  behind?: boolean
}

/** One platform's hours, named: what it adds to the total, and its sources. */
export type PlatformRow = { name: string; minutes: number; sources: SourceRow[] }

/** The line every value stands on: what it is, then the number at the end. */
const row = 'flex items-baseline justify-between gap-3'
/** A number, in a column of numbers. */
const figure = 'flex-none text-right tabular-nums'

/**
 * A game's play time on its own page, for its owner (spec 7.3, #153): one total in the shared
 * format, when it was last played, and where it came from by the platform of the copy each hour is
 * on, the largest first. A platform's sources sit under it, smaller; one that saw the same play as
 * another, whose hours count instead, says so in a tag. Idle time taken off the stores shows as a
 * row once set, and is set from the section's menu. How it is counted waits behind (i).
 */
export function PlayTimeView({
  heading: Heading,
  total,
  lastPlayed,
  platforms,
  idle,
  reported,
  stores,
  onIdle,
}: {
  heading: 'h3' | 'h4'
  /** Minutes, as `playTimeOf` adds them up. */
  total: number
  /** The day it was last played, said. */
  lastPlayed?: string
  platforms: readonly PlatformRow[]
  /** Minutes of the stores' hours I said sat idle. */
  idle: number
  /** Minutes the stores report together: idle time can't be more. None, and none can be set. */
  reported: number
  /** The stores reporting them, named: what idle time comes off. */
  stores: readonly string[]
  onIdle: (minutes: number) => void
}) {
  const t = useTranslations('PlayTime')
  const duration = useDuration()
  const id = useId()
  const [editing, setEditing] = useState<'menu' | 'row'>()
  // Chosen from the menu: the menu gives the focus to the field, not back to its button.
  const toField = useRef(false)
  const more = useRef<HTMLButtonElement>(null)
  const canIdle = reported > 0
  // One platform says nothing a bar could: its sources stand alone.
  const several = platforms.length > 1

  const form = (
    <IdleForm
      idle={idle}
      reported={reported}
      stores={stores}
      onSave={(minutes) => {
        setEditing(undefined)
        onIdle(minutes)
      }}
      onCancel={() => setEditing(undefined)}
    />
  )

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-1">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Heading id={`${id}-heading`} className={mineHeading}>
          {t('heading')}
        </Heading>
        <div className="-mr-1 flex items-center">
          <Help />
          {canIdle && idle === 0 ? (
            <Popover
              open={editing === 'menu'}
              onOpenChange={(open) => setEditing(open ? 'menu' : undefined)}
            >
              <PopoverAnchor asChild>
                <span className="inline-flex">
                  <DropdownMenu>
                    <Tip label={t('more')}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          ref={more}
                          variant="ghost"
                          size="sm"
                          className="px-2 text-muted hover:text-text"
                          aria-label={t('more')}
                        >
                          <EllipsisIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                    </Tip>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => {
                        if (toField.current) event.preventDefault()
                        toField.current = false
                      }}
                    >
                      <DropdownMenuItem
                        onSelect={() => {
                          toField.current = true
                          setEditing('menu')
                        }}
                      >
                        {t('idleMenu')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </PopoverAnchor>
              <PopoverContent
                align="end"
                className="w-72"
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  more.current?.focus()
                }}
              >
                {form}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>

      {total > 0 ? (
        <p className="text-xl font-semibold tabular-nums">{duration(total)}</p>
      ) : (
        <>
          <p className="text-sm text-muted">{t('empty')}</p>
          <p className="text-xs text-pretty text-muted">
            {t.rich('emptyHint', {
              link: (chunks: ReactNode) => (
                <Link
                  href={{ pathname: '/account', hash: 'platforms' }}
                  className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </>
      )}
      {lastPlayed ? (
        <p className="text-xs text-muted">{t('lastPlayed', { date: lastPlayed })}</p>
      ) : null}

      {platforms.length > 0 ? (
        <ul
          aria-label={t('breakdown')}
          className={cn('mt-2 grid text-sm', several ? 'gap-3' : 'gap-0.5')}
        >
          {several
            ? platforms.map((platform) => (
                <li key={platform.name} className="grid gap-1">
                  <div className={cn(row, 'font-medium')}>
                    <span className="min-w-0">{platform.name}</span>
                    <span className={figure}>{duration(platform.minutes)}</span>
                  </div>
                  <span aria-hidden="true" className="block h-1 rounded-full bg-text/8">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${total > 0 ? (platform.minutes / total) * 100 : 0}%` }}
                    />
                  </span>
                  <ul className="grid gap-0.5 pl-3 text-xs text-muted">
                    {platform.sources.map((source) => (
                      <Source key={source.name} source={source} />
                    ))}
                  </ul>
                </li>
              ))
            : platforms[0]?.sources.map((source) => (
                <Source key={source.name} source={source} className="text-xs text-muted" />
              ))}
          {idle > 0 ? (
            <li className={cn(row, 'text-xs text-muted')}>
              <span className="min-w-0">{t('idleRow')}</span>
              <span className="flex flex-none items-baseline gap-2">
                <span className={figure}>{t('idleValue', { time: duration(idle) })}</span>
                <Popover
                  open={editing === 'row'}
                  onOpenChange={(open) => setEditing(open ? 'row' : undefined)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs pointer-coarse:h-auto"
                      aria-label={t('idleEditLabel')}
                    >
                      {t('idleEdit')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72">
                    {form}
                  </PopoverContent>
                </Popover>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}

/** A source's line: its name, any tag, and its hours as it reports them. */
function Source({ source, className }: { source: SourceRow; className?: string }) {
  const t = useTranslations('PlayTime')
  const duration = useDuration()
  return (
    <li className={cn(row, 'items-center', className)}>
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        <span>{source.name}</span>
        {source.sameAs ? (
          <Tag
            words={t('overlap')}
            why={t('overlapTip', { source: source.name, other: source.sameAs })}
          />
        ) : null}
        {source.behind ? (
          <Tag words={t('behind')} why={t('behindTip', { source: source.name })} dashed />
        ) : null}
      </span>
      <span className={figure}>{duration(source.minutes)}</span>
    </li>
  )
}

/**
 * A few words in a pill beside a source, and why, a press away: a button and not a tip, as a touch
 * never opens a tip, and the why is the point. The button is 24 pixels high around a smaller pill.
 */
function Tag({ words, why, dashed = false }: { words: string; why: string; dashed?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex min-h-6 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <span
            className={cn(
              'rounded-full border border-line-strong px-1.5 text-[0.6875rem] leading-4 whitespace-nowrap text-muted',
              'transition-colors duration-quick ease-settle group-hover:border-muted group-hover:text-text',
              dashed && 'border-dashed',
            )}
          >
            {words}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-64 text-xs text-pretty">{why}</PopoverContent>
    </Popover>
  )
}

/** How play time is counted, in three points, behind a button beside the heading. */
function Help() {
  const t = useTranslations('PlayTime')
  return (
    <Popover>
      <Tip label={t('help')}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-muted hover:text-text"
            aria-label={t('help')}
          >
            <InfoIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="grid w-80 max-w-[calc(100vw-2rem)] gap-3 text-sm">
        <p className="font-semibold">{t('help')}</p>
        <ul className="grid list-disc gap-2 pl-4 text-pretty text-muted marker:text-muted">
          <li>{t('help1', { minutes: AWAY_AFTER_MINUTES })}</li>
          <li>{t('help2')}</li>
          <li>{t('help3')}</li>
        </ul>
        <Link
          href={{ pathname: '/', hash: 'faq-hours' }}
          className="w-fit rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          {t('helpMore')}
        </Link>
      </PopoverContent>
    </Popover>
  )
}

/** The idle time taken off the stores' hours: one field, one line on what it does, and Save. */
function IdleForm({
  idle,
  reported,
  stores,
  onSave,
  onCancel,
}: {
  idle: number
  reported: number
  stores: readonly string[]
  onSave: (minutes: number) => void
  onCancel: () => void
}) {
  const t = useTranslations('PlayTime')
  const edit = useTranslations('Edit')
  const locale = useLocale()
  const [hours, setHours] = useState(idle > 0 ? idle / 60 : undefined)
  // What the field last settled on, at once: Enter settles it and sends the form in one press.
  const settled = useRef(hours)
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(Math.round((settled.current ?? 0) * 60))
      }}
    >
      <NumberField
        label={t('idleField')}
        value={hours}
        decimals={1}
        max={reported / 60}
        unit="h"
        format={(value) =>
          new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(
            value,
          )
        }
        decreaseLabel={edit('hourFewer')}
        increaseLabel={edit('hourMore')}
        hint={t('idleHint', {
          stores: new Intl.ListFormat(locale, { type: 'conjunction' }).format(stores),
          count: stores.length,
        })}
        onCommit={(value) => {
          settled.current = value
          setHours(value)
        }}
        onEnter={() => onSave(Math.round((settled.current ?? 0) * 60))}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm">
          {t('idleSave')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('idleCancel')}
        </Button>
      </div>
    </form>
  )
}
