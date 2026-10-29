'use client'

import { CalendarIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { Calendar, type Day } from '@/ui/calendar'
import { cn } from '@/ui/cn'
import { fieldClass } from '@/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

type DatePickerProps = {
  id?: string
  value?: Day
  /** A day, or none once cleared. */
  onChange: (day: Day | undefined) => void
  /** Shown while no day is chosen. */
  placeholder: string
  min?: Day
  max?: Day
  /** Today where the visitor is. */
  today: Day
  locale: string
  labels: {
    previousMonth: string
    nextMonth: string
    /** With it, the calendar offers to take the day away. */
    clear?: string
  }
  disabled?: boolean
  'aria-labelledby'?: string
  'aria-describedby'?: string
  className?: string
}

/**
 * A day, chosen from a calendar that opens under the field. The field reads
 * the day in the page's language; the calendar takes the keys described in
 * `Calendar`, and choosing a day closes it.
 */
function DatePicker({
  id,
  value,
  onChange,
  placeholder,
  min,
  max,
  today,
  locale,
  labels,
  disabled,
  className,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const valueId = useId()
  const shown = value
    ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', dateStyle: 'medium' }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-labelledby={[props['aria-labelledby'], valueId].filter(Boolean).join(' ')}
        aria-describedby={props['aria-describedby']}
        data-slot="date-picker"
        data-placeholder={value ? undefined : ''}
        className={cn(
          fieldClass,
          'flex h-10 cursor-pointer items-center gap-2 text-left text-sm pointer-coarse:h-11',
          'hover:bg-surface-raised data-[placeholder]:text-muted data-[state=open]:border-accent',
          className,
        )}
      >
        <CalendarIcon aria-hidden="true" className="size-4 flex-none text-muted" />
        {/* Named with the field's label, then the day it holds. */}
        <span id={valueId} className="truncate">
          {shown}
        </span>
      </PopoverTrigger>
      <PopoverContent
        // Named as the field is: "Completed on".
        aria-labelledby={props['aria-labelledby']}
        // The calendar puts focus on its day itself.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Calendar
          value={value}
          min={min}
          max={max}
          today={today}
          locale={locale}
          labels={labels}
          takeFocus
          onSelect={(day) => {
            onChange(day)
            setOpen(false)
          }}
        />
        {labels.clear && value ? (
          <div className="mt-2 flex justify-end border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(undefined)
                setOpen(false)
              }}
              className="rounded-control px-2.5 py-1.5 text-sm text-muted transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text pointer-coarse:min-h-10"
            >
              {labels.clear}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
