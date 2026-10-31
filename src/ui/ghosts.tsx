import type { CSSProperties } from 'react'

import { cn } from '@/ui/cn'

/**
 * Bars where a paragraph is on its way. Apart from `Ghost`, in ghost.tsx: a
 * game's page needs only this, on every visit, within a tight script budget.
 */
export function Ghosts({ lines, className }: { lines: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('grid gap-2.5 pt-1', className)}>
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
