'use client'

import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/ui/cn'

type ColorFieldProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  label: ReactNode
  /** A line under the field: what the color is for. */
  hint?: ReactNode
  /** A #rrggbb color. */
  value: string
  /** Called with each color as it is picked, many times while a picker is dragged. */
  onValueChange: (value: string) => void
}

/**
 * A color, picked with the device's own color picker: a swatch that opens it,
 * and the color written beside it, as the swatch alone says nothing in words.
 * The browser's picker is the one people know, and it is reached and used from
 * the keyboard on every platform.
 */
function ColorField({
  label,
  hint,
  value,
  onValueChange,
  className,
  id,
  ...props
}: ColorFieldProps) {
  const own = useId()
  const inputId = id ?? own
  const hintId = hint ? `${inputId}-hint` : undefined
  return (
    <div data-slot="color-field" className={cn('grid content-start gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <span className="flex items-center gap-3">
        <input
          id={inputId}
          type="color"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-describedby={hintId}
          className={cn(
            'size-10 shrink-0 cursor-pointer rounded-control border border-line-strong bg-surface p-1',
            'hover:border-muted disabled:cursor-not-allowed disabled:opacity-50',
            '[&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-0',
            '[&::-webkit-color-swatch-wrapper]:p-0',
            '[&::-moz-color-swatch]:rounded-[4px] [&::-moz-color-swatch]:border-0',
          )}
          {...props}
        />
        <span className="font-mono text-sm text-muted uppercase">{value}</span>
      </span>
      {hint ? (
        <span id={hintId} className="text-xs text-pretty text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export { ColorField }
