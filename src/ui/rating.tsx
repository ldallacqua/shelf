'use client'

import { XIcon } from 'lucide-react'
import { Slider } from 'radix-ui'
import { useId } from 'react'

import { cn } from '@/ui/cn'
import { Tip } from '@/ui/tooltip'

type RatingProps = {
  label: string
  /** Out of ten, in half steps; none while unrated. */
  value: number | undefined
  /** While the thumb moves. */
  onValueChange: (value: number) => void
  /** Once it comes to rest: the pointer let go, or a key pressed. */
  onValueCommit?: (value: number) => void
  onClear: () => void
  /** Shown, and read, in place of a number while unrated. */
  unrated: string
  /** The clear button's name. */
  clearLabel: string
  /** After the number: "/10". */
  outOf: string
  /** What assistive technology reads for a value: "8.5 out of 10". */
  valueText: (value: number) => string
  /** A value as the page's language writes it: 8.5, or 8,5. */
  format: (value: number) => string
  disabled?: boolean
  /** -1 keeps it out of the Tab order: in a list that is one stop, a row not in focus. */
  tabIndex?: number
  /**
   * On one line, for a list of many: the slider, its number and the button
   * that clears it, with no marks. The number says what the slider is, and
   * the label is for assistive technology.
   */
  compact?: boolean
  className?: string
}

const TICKS = Array.from({ length: 11 }, (_, at) => at)

/**
 * A rating out of ten in half steps (spec decision 10): a slider, with the
 * number large above it. Drag, tap the track, or use the arrow keys; Home
 * and End go to either end. Until it is moved it says it is unrated, and
 * the button beside the number takes a rating away again.
 */
function Rating({
  label,
  value,
  onValueChange,
  onValueCommit,
  onClear,
  unrated,
  clearLabel,
  outOf,
  valueText,
  format,
  disabled,
  tabIndex,
  compact = false,
  className,
}: RatingProps) {
  const labelId = useId()
  const rated = value !== undefined

  const slider = (
    <Slider.Root
      data-unrated={rated ? undefined : ''}
      min={0}
      max={10}
      step={0.5}
      value={[value ?? 0]}
      disabled={disabled}
      onValueChange={([next]) => next !== undefined && onValueChange(next)}
      onValueCommit={([next]) => next !== undefined && onValueCommit?.(next)}
      className={cn(
        'group relative flex flex-1 cursor-pointer touch-none items-center select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        compact ? 'h-8 min-w-0 pointer-coarse:h-10' : 'h-10',
      )}
    >
      <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-line-strong">
        <Slider.Range className="absolute h-full bg-accent group-data-[unrated]:opacity-0" />
      </Slider.Track>
      <Slider.Thumb
        // Radix makes the thumb a stop of its own: only a value given replaces that.
        {...(tabIndex === undefined ? {} : { tabIndex })}
        aria-labelledby={labelId}
        aria-valuetext={rated ? valueText(value) : unrated}
        className={cn(
          'block size-5 rounded-full border-2 border-accent bg-surface shadow-panel pointer-coarse:size-6',
          'transition-[box-shadow,border-color] duration-quick ease-settle hover:shadow-glow',
          'group-data-[unrated]:border-line-strong',
        )}
      />
    </Slider.Root>
  )
  const clear = rated ? (
    <Tip label={clearLabel}>
      <button
        type="button"
        aria-label={clearLabel}
        disabled={disabled}
        tabIndex={tabIndex}
        onClick={onClear}
        className="inline-flex size-8 flex-none items-center justify-center rounded-control text-muted transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text disabled:opacity-50 pointer-coarse:size-10"
      >
        <XIcon aria-hidden="true" className="size-4" />
      </button>
    </Tip>
  ) : (
    // The same room, so the slider does not change length when a rating is taken away.
    <span aria-hidden="true" className="size-8 flex-none pointer-coarse:size-10" />
  )

  if (compact) {
    return (
      <div
        data-slot="rating"
        role="group"
        aria-labelledby={labelId}
        className={cn('flex items-center gap-2', className)}
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        {slider}
        {/* Read through the slider's own value; this is for the eye. Wide enough for either, so the slider stays put. */}
        <span
          aria-hidden="true"
          className="flex w-16 flex-none items-baseline justify-end gap-0.5 whitespace-nowrap"
        >
          {rated ? (
            <>
              <span className="title text-base tabular-nums">{format(value)}</span>
              <span className="text-xs text-muted">{outOf}</span>
            </>
          ) : (
            <span className="text-sm text-muted">{unrated}</span>
          )}
        </span>
        {clear}
      </div>
    )
  }

  return (
    <div
      data-slot="rating"
      role="group"
      aria-labelledby={labelId}
      className={cn('grid gap-1', className)}
    >
      <div className="flex min-h-10 items-center justify-between gap-3">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        {/* Read through the slider's own value; this is for the eye. */}
        <span aria-hidden="true" className="flex items-baseline gap-1">
          {rated ? (
            <>
              <span className="title text-2xl tabular-nums">{format(value)}</span>
              <span className="text-sm text-muted">{outOf}</span>
            </>
          ) : (
            <span className="text-sm text-muted">{unrated}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {slider}
        {clear}
      </div>
      {/* A mark at each whole number, lined up with where the thumb's middle stops. */}
      <div
        aria-hidden="true"
        className="-mt-2 mr-10 flex justify-between px-2.5 pointer-coarse:mr-12 pointer-coarse:px-3"
      >
        {TICKS.map((tick) => (
          <span key={tick} className="relative flex w-0 justify-center">
            <span
              className={cn(
                'h-1.5 w-px flex-none bg-line-strong',
                tick % 5 === 0 && 'h-2 bg-muted',
              )}
            />
            {tick % 5 === 0 ? (
              <span className="absolute top-2.5 readout text-[0.625rem] text-muted">
                {format(tick)}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      {/* Room for the numbers under the marks. */}
      <span aria-hidden="true" className="h-3" />
    </div>
  )
}

export { Rating }
export type { RatingProps }
