import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ghostOrder } from '@/ui/ghost'

/** Rows not read yet: the shape of the list, still. */
export function BesideGhostRows() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className="beside-game" data-ghost="" style={ghostOrder(index)}>
          <span className="beside-thumb">
            <span className="ghost size-full" />
          </span>
          <span className="ghost h-3" style={{ width: `${55 + ((index * 23) % 35)}%` }} />
        </span>
      ))}
    </div>
  )
}

/**
 * The list before its code and its library arrive: the same places, still,
 * so nothing moves when they do. The way back is here from the start.
 */
export function BesideGhost({ back }: { back?: ReactNode }) {
  const t = useTranslations('Library')
  return (
    <>
      <div className="beside-head">{back ?? <span className="ghost h-4 w-20" />}</div>
      <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
        <p className="sr-only" role="status">
          {t('loading')}
        </p>
        <div className="flex-none px-3 pb-3" aria-hidden="true">
          <span className="ghost block h-10 w-full rounded-control pointer-coarse:h-11" />
        </div>
        <div className="beside-rows">
          <BesideGhostRows />
        </div>
      </div>
    </>
  )
}

/** The column the list stands in, named for those who move by landmarks. */
export function BesideColumn({ children }: { children: ReactNode }) {
  const t = useTranslations('Beside')
  return (
    <aside className="library-beside" aria-label={t('label')}>
      {children}
    </aside>
  )
}
