import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/**
 * The look every field shares: a text field, a text area, a select's
 * button, a date's button. One height, one border that warms on hover, and
 * the page's own 2px focus ring. Sixteen pixels of text on a phone, so
 * focusing a field never zooms the page.
 */
const fieldClass = cn(
  'w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-base text-text sm:text-sm',
  'transition-[border-color,background-color] duration-quick ease-settle',
  'placeholder:text-muted hover:border-muted',
  // Wrong is shown by the border's shape as well as its color, beside a message saying why.
  'aria-invalid:border-dashed aria-invalid:border-text',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

/**
 * A text box that cannot be typed in, while it waits. Not in `fieldClass`:
 * to CSS, a button or a box of chips is read-only too.
 */
const readOnly = 'read-only:opacity-70'

/** One line of text. */
function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(fieldClass, readOnly, 'h-10 pointer-coarse:h-11', className)}
      {...props}
    />
  )
}

type TextareaProps = ComponentProps<'textarea'> & {
  /** Grows with what is written, up to a point, then scrolls. */
  grow?: boolean
}

/** Several lines of text. */
function Textarea({ className, grow, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClass,
        readOnly,
        'min-h-24 py-2 leading-relaxed',
        grow && 'field-sizing-content max-h-80',
        className,
      )}
      {...props}
    />
  )
}

export { fieldClass, Input, Textarea }
