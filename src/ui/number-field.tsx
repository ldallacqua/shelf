'use client'

import { MinusIcon, PlusIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { fieldClass } from '@/ui/field'
import { Tip } from '@/ui/tooltip'

type NumberFieldProps = {
  label: string
  /** None while empty. */
  value: number | undefined
  /**
   * Once it is settled: the field left or Enter pressed, or a moment after the
   * last press of a step button or an arrow key. Called only with a change.
   */
  onCommit: (value: number | undefined) => void
  /** What a step button or an arrow key adds or takes away; with Shift, ten times as much. */
  step?: number
  min?: number
  max?: number
  /** Decimal places kept. */
  decimals?: number
  /** After the number, inside the field: "h". */
  unit?: string
  /** A value as the page's language writes it: 33.5, or 33,5. */
  format: (value: number) => string
  /** The step buttons' names: "One hour fewer", "One hour more". */
  decreaseLabel: string
  increaseLabel: string
  /** Under the field: what the number means, or where else it comes from. */
  hint?: ReactNode
  className?: string
}

/** How long the step buttons wait for another press before saving. */
const SETTLE_MS = 600

/** Digits, and one decimal separator, a point or a comma, whichever is typed first. */
const onlyNumber = (raw: string): string => {
  const kept = raw.replace(/[^\d.,]/g, '')
  const at = kept.search(/[.,]/)
  return at < 0 ? kept : kept.slice(0, at + 1) + kept.slice(at + 1).replace(/[.,]/g, '')
}

/**
 * A number typed, or stepped with the buttons beside it or the arrow keys: only
 * digits and one separator can be typed, in either language's way of writing a
 * decimal. Empty means none.
 */
function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  decimals = 0,
  unit,
  format,
  decreaseLabel,
  increaseLabel,
  hint,
  className,
}: NumberFieldProps) {
  const id = useId()
  const shown = value === undefined ? '' : format(value)
  const [text, setText] = useState(shown)
  const [from, setFrom] = useState(shown)
  // A saved or reverted value replaces what is in the field, unless it is being typed in.
  if (shown !== from) {
    setFrom(shown)
    setText(shown)
  }

  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(settle.current), [])

  const fit = (number: number) => {
    const places = 10 ** decimals
    return Math.min(max, Math.max(min, Math.round(number * places) / places))
  }
  const read = (typed: string): number | undefined | null => {
    if (typed.trim() === '') return undefined
    const number = Number(typed.replace(',', '.'))
    return Number.isFinite(number) ? fit(number) : null
  }
  const commit = (next: number | undefined) => {
    clearTimeout(settle.current)
    pending.current = undefined
    setText(next === undefined ? '' : format(next))
    if (next !== value) onCommit(next)
  }
  const commitTyped = () => {
    const next = read(text)
    // Not a number at all ("."): what was there comes back.
    if (next === null) setText(shown)
    else commit(next)
  }
  const stepBy = (direction: 1 | -1, far: boolean) => {
    const current = pending.current ?? read(text) ?? value ?? 0
    const next = fit(current + direction * step * (far ? 10 : 1))
    pending.current = next
    setText(format(next))
    clearTimeout(settle.current)
    settle.current = setTimeout(() => commit(next), SETTLE_MS)
  }
  // What the field holds now: typed, or stepped and not yet saved.
  const typed = read(text)
  const current = typed === null ? value : typed

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex max-w-64 items-center gap-2">
        <Tip label={decreaseLabel}>
          <Button
            variant="secondary"
            size="icon"
            aria-label={decreaseLabel}
            aria-controls={id}
            disabled={current === undefined || current <= min}
            onClick={(event) => stepBy(-1, event.shiftKey)}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
        </Tip>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(onlyNumber(event.target.value))}
            onBlur={commitTyped}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitTyped()
              } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault()
                stepBy(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey)
              }
            }}
            className={cn(
              fieldClass,
              'h-10 text-center tabular-nums pointer-coarse:h-11',
              unit && 'pr-8 pl-8',
            )}
          />
          {unit ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
            >
              {unit}
            </span>
          ) : null}
        </div>
        <Tip label={increaseLabel}>
          <Button
            variant="secondary"
            size="icon"
            aria-label={increaseLabel}
            aria-controls={id}
            disabled={current !== undefined && current >= max}
            onClick={(event) => stepBy(1, event.shiftKey)}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </Tip>
      </div>
      {hint ? <p className="text-xs text-pretty text-muted">{hint}</p> : null}
    </div>
  )
}

export { NumberField, onlyNumber }
export type { NumberFieldProps }
