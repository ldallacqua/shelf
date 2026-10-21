'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { cn } from '@/ui/cn'

/** A day as the library stores one: `YYYY-MM-DD`. */
type Day = string

const DAY_MS = 86_400_000

// Days are worked out in UTC, so no time zone or change of clocks moves one.
const timeOf = (day: Day) => {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}
const dayOf = (time: number): Day => new Date(time).toISOString().slice(0, 10)
const addDays = (day: Day, count: number) => dayOf(timeOf(day) + count * DAY_MS)
const addMonths = (day: Day, count: number) => {
  const from = new Date(timeOf(day))
  const year = from.getUTCFullYear()
  const month = from.getUTCMonth() + count
  // The same date in the new month, or its last day if it is shorter.
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return dayOf(Date.UTC(year, month, Math.min(from.getUTCDate(), last)))
}
const firstOfMonth = (day: Day): Day => `${day.slice(0, 8)}01`
const weekdayOf = (day: Day) => new Date(timeOf(day)).getUTCDay()

/** A Sunday, to name the days of the week from. */
const A_SUNDAY = Date.UTC(2024, 0, 7)

type CalendarProps = {
  /** The chosen day. */
  value?: Day
  onSelect: (day: Day) => void
  min?: Day
  max?: Day
  /** Today where the visitor is: marked, and where a calendar with nothing chosen opens. */
  today: Day
  /** The page's language, for the names of months and days. */
  locale: string
  labels: { previousMonth: string; nextMonth: string }
  /** The first day of the week: 0 for Sunday. */
  weekStartsOn?: number
  /** Puts focus on the chosen day, or today, as the calendar appears: for one that opens on request. */
  takeFocus?: boolean
  className?: string
}

/**
 * A month of days to choose one from. One Tab stop: arrow keys move by a
 * day or a week, Home and End to the ends of the week, Page Up and Page
 * Down by a month (with Shift, a year), Enter or Space chooses. Days past
 * `max` or before `min` cannot be chosen.
 */
function Calendar({
  value,
  onSelect,
  min,
  max,
  today,
  locale,
  labels,
  weekStartsOn = 0,
  takeFocus,
  className,
}: CalendarProps) {
  const titleId = useId()
  const grid = useRef<HTMLDivElement>(null)
  const clamp = (day: Day) => (max && day > max ? max : min && day < min ? min : day)
  const [focused, setFocused] = useState<Day>(() => clamp(value ?? today))
  // Focus follows the focused day only after a key moved it, or on opening.
  const follow = useRef(Boolean(takeFocus))

  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  }, [focused])

  const month = firstOfMonth(focused)
  const lead = (weekdayOf(month) - weekStartsOn + 7) % 7
  const start = addDays(month, -lead)
  const weeks = Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, at) => addDays(start, week * 7 + at)),
  )

  const utc = { timeZone: 'UTC' } as const
  const title = new Intl.DateTimeFormat(locale, { ...utc, month: 'long', year: 'numeric' })
  const long = new Intl.DateTimeFormat(locale, { ...utc, dateStyle: 'full' })
  const weekday = new Intl.DateTimeFormat(locale, { ...utc, weekday: 'short' })
  const weekdayLong = new Intl.DateTimeFormat(locale, { ...utc, weekday: 'long' })
  const names = Array.from({ length: 7 }, (_, at) => A_SUNDAY + ((at + weekStartsOn) % 7) * DAY_MS)

  const outside = (day: Day) => Boolean((max && day > max) || (min && day < min))
  const canGoBack = !min || firstOfMonth(min) < month
  const canGoOn = !max || firstOfMonth(max) > month

  const goTo = (day: Day, byKey: boolean) => {
    follow.current = byKey
    setFocused(clamp(day))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const from = focused
    const startOfWeek = addDays(from, -((weekdayOf(from) - weekStartsOn + 7) % 7))
    const next: Record<string, () => Day> = {
      ArrowLeft: () => addDays(from, -1),
      ArrowRight: () => addDays(from, 1),
      ArrowUp: () => addDays(from, -7),
      ArrowDown: () => addDays(from, 7),
      Home: () => startOfWeek,
      End: () => addDays(startOfWeek, 6),
      PageUp: () => addMonths(from, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(from, event.shiftKey ? 12 : 1),
    }
    const move = next[event.key]
    if (!move) return
    event.preventDefault()
    goTo(move(), true)
  }

  const navButton =
    'inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-10'

  return (
    <div data-slot="calendar" className={cn('grid w-max gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={labels.previousMonth}
          disabled={!canGoBack}
          onClick={() => goTo(addMonths(focused, -1), false)}
          className={navButton}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
        </button>
        <p id={titleId} aria-live="polite" className="text-sm font-semibold first-letter:uppercase">
          {title.format(timeOf(month))}
        </p>
        <button
          type="button"
          aria-label={labels.nextMonth}
          disabled={!canGoOn}
          onClick={() => goTo(addMonths(focused, 1), false)}
          className={navButton}
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div ref={grid} role="grid" aria-labelledby={titleId} className="grid gap-0.5">
        <div role="row" className="grid grid-cols-7 gap-0.5">
          {names.map((time) => (
            <span
              key={time}
              role="columnheader"
              aria-label={weekdayLong.format(time)}
              className="flex h-7 items-center justify-center text-xs text-muted first-letter:uppercase"
            >
              {weekday.format(time).replace('.', '')}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 gap-0.5">
            {week.map((day) => {
              const chosen = day === value
              const elsewhere = firstOfMonth(day) !== month
              return (
                <span key={day} role="gridcell" aria-selected={chosen}>
                  <button
                    type="button"
                    data-day={day}
                    tabIndex={day === focused ? 0 : -1}
                    disabled={outside(day)}
                    aria-label={long.format(timeOf(day))}
                    aria-current={day === today ? 'date' : undefined}
                    onKeyDown={onKeyDown}
                    onClick={() => {
                      setFocused(day)
                      onSelect(day)
                    }}
                    className={cn(
                      'relative inline-flex size-9 items-center justify-center rounded-control text-sm tabular-nums pointer-coarse:size-10',
                      'transition-colors duration-quick ease-settle hover:bg-text/8',
                      'disabled:pointer-events-none disabled:opacity-30',
                      elsewhere && 'text-muted',
                      chosen && 'bg-accent font-semibold text-on-accent hover:bg-accent',
                      // Today is marked by a line beneath, not by color alone.
                      day === today &&
                        'after:absolute after:bottom-1.5 after:h-0.5 after:w-3 after:rounded-full after:bg-current',
                    )}
                  >
                    {Number(day.slice(8))}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export { addDays, Calendar }
export type { Day }
