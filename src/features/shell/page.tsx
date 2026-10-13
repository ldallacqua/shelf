import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/** The column every page's content sits in. */
export function Page({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mx-auto w-full max-w-360 px-4 sm:px-6 lg:px-10', className)} {...props} />
  )
}

/** The small read-out above a heading. */
export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('readout text-[0.6875rem] text-accent', className)} {...props} />
}
