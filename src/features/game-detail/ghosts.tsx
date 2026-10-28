import type { CSSProperties } from 'react'

import { cn } from '@/ui/cn'

/** Bars where words are on their way. */
export function Ghosts({ lines }: { lines: number }) {
  return (
    <div aria-hidden="true" className="grid gap-2.5 pt-1">
      {Array.from({ length: lines }, (_, line) => (
        <span
          key={line}
          className={cn('ghost h-3', line === lines - 1 ? 'w-2/3' : 'w-full')}
          style={{ '--i': line } as CSSProperties}
        />
      ))}
    </div>
  )
}
