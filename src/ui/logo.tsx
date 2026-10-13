import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/**
 * The mark: three game cases facing out on a lit shelf.
 * It is decoration next to the name, so it is hidden from assistive technology.
 */
function LogoMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn('size-6', className)}
      {...props}
    >
      <rect x="2.5" y="4" width="5.5" height="12.5" rx="1" fill="currentColor" />
      <rect x="9.25" y="6.5" width="5.5" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="16" y="5" width="5.5" height="11.5" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="1.5" y="18.25" width="21" height="2.25" rx="1.125" fill="var(--led)" />
    </svg>
  )
}

export { LogoMark }
