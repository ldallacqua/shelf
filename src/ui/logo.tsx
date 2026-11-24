import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/** The mark's drawing, cropped to the S: the letter's two strokes and the lit shelf between them. */
export const MARK = {
  viewBox: '4.5 2.5 23 27',
  letter:
    'M27.5 2.5H14A9.5 9.5 0 0 0 4.5 12V13H10.5V12A3.5 3.5 0 0 1 14 8.5H27.5ZM4.5 29.5H18A9.5 9.5 0 0 0 27.5 20V19H21.5V20A3.5 3.5 0 0 1 18 23.5H4.5Z',
  shelf: 'M4.5 13H24.5A3 3 0 0 1 27.5 16V19H7.5A3 3 0 0 1 4.5 16Z',
} as const

/**
 * The mark: a squared S of three shelves, the middle one lit. The lit shelf is the colorway's
 * light in the dark, and its accent in the light (`mark-shelf`), where some lights are too pale to
 * show on the wall; in forced colors, the system's highlight, so it stays apart from the letter.
 * It is decoration next to the name, so it is hidden from assistive technology.
 */
function LogoMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox={MARK.viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn('aspect-[23/27] h-6 w-auto', className)}
      {...props}
    >
      <path d={MARK.letter} fill="currentColor" />
      <path
        d={MARK.shelf}
        fill="var(--accent)"
        className="mark-shelf dark:fill-led forced-colors:fill-[Highlight]"
      />
    </svg>
  )
}

export { LogoMark }
