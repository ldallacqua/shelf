import { ghostOrder } from '@/features/library/ghosts'
import { cn } from '@/ui/cn'

/** The first sections, by the width of their names. */
const ROWS = ['w-12', 'w-24', 'w-16', 'w-14', 'w-12', 'w-14', 'w-12', 'w-18', 'w-14', 'w-10']

/**
 * The filters' sections before the column draws them: in the page built ahead of time, and
 * until the browser says the window is wide enough for the column. On a phone, where the column
 * is hidden, this is all of it there is. No hooks and no words, so the skeleton can use it too.
 */
export function FilterGhosts() {
  return (
    <div aria-hidden="true" className="grid">
      {ROWS.map((width, index) => (
        <span key={index} className="flex h-11 items-center gap-2 border-b border-line">
          <span className="ghost size-4 flex-none" style={ghostOrder(index)} />
          <span className={cn('ghost h-3', width)} style={ghostOrder(index)} />
        </span>
      ))}
    </div>
  )
}
